// 실행: node --test tests/aiEarlyCloseAmc.test.cjs
// 합성 입력만 사용. src/lib 순수 모듈만 로드하며 환경 파일·외부 모듈·네트워크 접근은 허용하지 않는다.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const timeFile = 'src/lib/ai/evidenceTime.ts';
// 문제 커밋의 원문을 고정해 비교한다. HEAD나 작업 파일에서 옛 동작을 역으로 만들지 않는다.
const beforeTime = execFileSync('git', ['show', `9a9c0170c:${timeFile}`], { cwd: root, encoding: 'utf8' });
const compiled = new Map();
function modules(before) {
    const cache = new Map();
    function load(file) {
        if (!file.startsWith('src/lib/') || !file.endsWith('.ts')) throw new Error(`허용하지 않은 의존성: ${file}`);
        if (cache.has(file)) return cache.get(file).exports;
        const source = before && file === timeFile ? beforeTime : readFileSync(path.join(root, file), 'utf8');
        if (!compiled.has(source)) compiled.set(source, ts.transpileModule(source, {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
        }).outputText);
        const mod = { exports: {} };
        cache.set(file, mod);
        const localRequire = id => {
            const resolved = id.startsWith('@/') ? `src/${id.slice(2)}`
                : id.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(file), id)) : '';
            return load(`${resolved}.ts`);
        };
        new Function('require', 'module', 'exports', compiled.get(source))(localRequire, mod, mod.exports);
        return mod.exports;
    }
    return {
        time: load(timeFile), prompt: load('src/lib/ai/tacticalPrompt.ts'),
        depth: load('src/lib/ai/watchlistDepth.ts'), line: load('src/lib/ai/watchlistLine.ts'),
        calendar: load('src/lib/marketCalendar.ts'),
    };
}
const old = modules(true), fixed = modules(false);
const et = (date, time) => fixed.time.evidenceTime('wall:et', `${date} ${time}`).ms;
const staleLine = date => `[earnings calendar; ${date}; AMC timing boundary 16:00 ET; exact release time unknown] ZZZ (estimated schedule; scheduled; not a released result)`;
function evidence(m, date, nowMs, extra = {}) {
    return m.prompt.cachedEvidence(null, null, {
        generatedAt: new Date(nowMs).toISOString(), rows: [{ ticker: 'ZZZ', date, hour: 'amc', ...extra }],
    }, new Date(nowMs));
}
function ownLine(m, date, nowMs, extra) {
    return evidence(m, date, nowMs, extra).stockEvents.find(e => e.ticker === 'ZZZ').text;
}

test('11/27 14:00: 정확 시각 없는 AMC는 경계 경과·발표 여부 미확인, 새 근거와 저장본 모두 예정 주장 차단', () => {
    const date = '2026-11-27', now = et(date, '14:00');
    const fresh = ownLine(fixed, date, now), stale = staleLine(date);
    assert.match(fresh, /release status unconfirmed; AMC timing boundary elapsed/);
    assert.doesNotMatch(fresh, /scheduled; not a released result|\(released;/);
    assert.equal(fixed.time.earningsReleaseAt(date, 'amc', null).ms, et(date, '13:00'));
    assert.equal(fixed.time.scheduledLineAt(stale), et(date, '13:00'));
    const claim = 'ZZZ earnings are scheduled on 11/27 after the close.';
    const source = `FACTS — ZZZ (options)\nTOP EVIDENCE [earnings]: ZZZ earnings pending\n${stale}`;
    for (const line of [fresh, stale]) {
        assert.equal(fixed.time.isUpcomingLine(line, now), false);
        assert.deepEqual(fixed.time.dropElapsedScheduled([line], now), line === stale ? [] : [line]);
        for (const mode of ['strict', 'claims']) {
            assert.ok(fixed.prompt.scheduleClaimReasons(claim, [line], now, mode).includes('schedule:claim-not-upcoming'));
        }
        const prompt = fixed.prompt.buildTacticalPrompt({ rlsiScore: 34, nasdaqChange: 0, vix: 18, asOf: new Date(now).toISOString(), scheduledEvents: [line] }, 'ko');
        assert.ok(fixed.prompt.checkTacticalStored(claim, prompt).length);
        assert.equal(fixed.depth.rankStockContext({ ticker: 'ZZZ', earnings: [line], news: [] }, now).top, 'positioning');
    }
    assert.deepEqual(old.prompt.scheduleClaimReasons(claim, [stale], now, 'strict'), []);
    assert.deepEqual(old.depth.checkDepthLine('ZZZ earnings are pending', 'en', source, now), []);
    assert.ok(fixed.depth.checkDepthLine('ZZZ earnings are pending', 'en', source, now).includes('insight:schedule'));
    assert.equal(fixed.time.evidenceValidUntil([stale], et(date, '12:00'), { dayEnd: false }), et(date, '13:00'));
});

test('기존 달력 전체의 조기 폐장 13:00 정각·정상일 16:00 정각·정확 시각 우선', () => {
    for (const date of fixed.calendar.EARLY_CLOSE_DATES) {
        const close = et(date, '13:00');
        assert.equal(fixed.calendar.sessionCloseMinutes(date), 780);
        assert.match(ownLine(fixed, date, close - 1), /scheduled; not a released result/);
        assert.match(ownLine(fixed, date, close), /AMC timing boundary elapsed/);
        assert.equal(fixed.time.isUpcomingLine(staleLine(date), close - 1), true);
        assert.equal(fixed.time.isUpcomingLine(staleLine(date), close), false);
        for (const exactTime of ['08:30', '13:30', '16:30', '16:30:45']) {
            assert.deepEqual(fixed.time.earningsReleaseAt(date, 'amc', exactTime), old.time.earningsReleaseAt(date, 'amc', exactTime));
            const exactLine = `[earnings calendar; ${date}; ${exactTime} ET] ZZZ (confirmed; scheduled; not a released result)`;
            assert.equal(fixed.time.scheduledLineAt(exactLine), et(date, exactTime));
        }
    }
    for (const date of ['2026-07-02', '2026-10-20', '2026-11-25', '2026-12-01', '2027-07-02']) {
        const close = et(date, '16:00');
        assert.deepEqual(fixed.time.earningsReleaseAt(date, 'amc', null), old.time.earningsReleaseAt(date, 'amc', null));
        for (const now of [close - 1, close, close + 1]) assert.equal(ownLine(fixed, date, now), ownLine(old, date, now));
        assert.match(ownLine(fixed, date, close - 1), /scheduled; not a released result/);
        assert.match(ownLine(fixed, date, close), /AMC timing boundary elapsed/);
    }
});

// 경계 메타데이터(ms·유효 기한)는 13:00으로 바뀌어야 한다. 비교 대상은 각 시점의
// 실제 프롬프트 문자열·출구 검사 배열·예정/유효 여부다.
function behavior(m, date, now, extra = {}) {
    const ev = evidence(m, date, now, extra);
    const fresh = ev.stockEvents.find(e => e.ticker === 'ZZZ').text;
    const claim = `ZZZ earnings are scheduled on ${date.slice(5).replace('-', '/')} after the close.`;
    const results = [ev];
    for (const lines of [[fresh], [staleLine(date)]]) {
        const rank = m.depth.rankStockContext({ ticker: 'ZZZ', earnings: lines, news: [] }, now);
        const source = `FACTS — ZZZ (options)\n${rank.topLine}\n${lines.join('\n')}`;
        const facts = m.line.buildLineFacts('ZZZ', {
            price: 100, levelsSource: 'structure', levelsChainDate: date,
            maxPain: 100, callWall: 110, putFloor: 90, gammaFlipLevel: 105,
        });
        assert.ok(facts);
        results.push(m.time.isUpcomingLine(lines[0], now), m.time.dropElapsedScheduled(lines, now), rank,
            m.line.buildLineUserPrompt({ ...facts, topLine: rank.topLine, contextText: rank.lines.join('\n') }),
            // 저장본을 12:00에 생성했다고 할 때 출구에서의 유효 여부.
            now < m.time.evidenceValidUntil(lines, et(date, '12:00'), { dayEnd: false }));
        for (const locale of ['ko', 'en', 'ja']) {
            const prompt = m.prompt.buildTacticalPrompt({ rlsiScore: 34, nasdaqChange: 0, vix: 18, asOf: new Date(now).toISOString(), scheduledEvents: lines }, locale);
            results.push(prompt, m.prompt.checkTacticalOutput(claim, locale, prompt), m.prompt.checkTacticalStored(claim, prompt),
                m.depth.checkDepthLine('ZZZ earnings are pending', locale, source, now));
        }
        for (const mode of ['strict', 'claims']) results.push(m.prompt.scheduleClaimReasons(claim, lines, now, mode));
    }
    return Buffer.from(JSON.stringify(results), 'utf8');
}

test('조기 폐장일 [13:00,16:00) 밖: 이전 커밋 대비 프롬프트·출구 판정 바이트 동일', () => {
    let compared = 0;
    for (const date of fixed.calendar.EARLY_CLOSE_DATES) {
        const start = et(date, '00:00'), close = et(date, '13:00'), regularClose = et(date, '16:00');
        // 11/27은 하루의 모든 분, 나머지 달력 날짜는 30분 간격 + 정각 양쪽 1ms.
        const step = date === '2026-11-27' ? 60_000 : 30 * 60_000;
        const times = new Set([start - 1, close - 1, close, regularClose - 1, regularClose, regularClose + 1]);
        for (let now = start; now < start + 86400_000; now += step) times.add(now);
        for (const now of times) {
            if (now >= close && now < regularClose) continue;
            assert.ok(behavior(fixed, date, now).equals(behavior(old, date, now)), `${date} ${new Date(now).toISOString()}`);
            compared++;
        }
    }
    console.log(`구간 밖 바이트 동일: ${compared}개 시점, 한·영·일 프롬프트 및 새 근거·저장본 검사`);
});

test('BMO·정확 시각·실제치·시각 미상·정상일: 13~16시를 포함한 기존 판정 바이트 동일', () => {
    const extras = [
        { hour: 'bmo' }, { hour: '' }, { hour: 'amc', etTime: '08:30' },
        { hour: 'amc', etTime: '13:30' }, { hour: 'amc', time: '16:30' },
        { hour: 'bmo', etTime: '13:30:45' }, { hour: 'amc', epsActual: 0 },
    ];
    let compared = 0;
    for (const date of [...fixed.calendar.EARLY_CLOSE_DATES, '2026-07-02', '2026-10-20', '2026-12-01', '2027-07-02']) {
        for (const extra of [{}, ...extras]) {
            for (const time of ['00:00', '08:29:59', '08:30', '12:59:59', '13:00', '13:30', '14:00', '15:59:59', '16:00', '16:30', '23:59:59']) {
                // 옛 저장 AMC 줄은 다른 입력과 무관하게 수리 대상이다. 이 시험은 새 근거만 비교한다.
                const now = et(date, time);
                if (fixed.calendar.EARLY_CLOSE_DATES.has(date) && !Object.keys(extra).length && time >= '13:00' && time < '16:00') continue;
                const before = ownLine(old, date, now, extra), after = ownLine(fixed, date, now, extra);
                assert.equal(after, before, `${date} ${time} ${JSON.stringify(extra)}`);
                for (const m of [old, fixed]) assert.equal(m.time.isUpcomingLine(after, now), old.time.isUpcomingLine(before, now));
                for (const locale of ['ko', 'en', 'ja']) {
                    const ctx = { rlsiScore: 34, nasdaqChange: 0, vix: 18, asOf: new Date(now).toISOString(), scheduledEvents: [after] };
                    assert.equal(fixed.prompt.buildTacticalPrompt(ctx, locale), old.prompt.buildTacticalPrompt(ctx, locale));
                }
                compared++;
            }
        }
    }
    console.log(`BMO·정확 시각 등 바이트 동일: ${compared}개 입력`);
});
