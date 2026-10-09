'use strict';
/* ============================================================================
 * 관제 콘솔 «실측 원천» 읽기 모듈 (2026-10-10, 대표 10/9 «관제는 정확하게 실시간으로»)
 *
 * 원칙 — 값은 원천 파일에서 «그대로» 읽는다. 없으면 null(화면에 «없음»), 0 으로 지어내지 않는다.
 *       모든 블록에 «원천 시각(at, ms)»을 싣는다. 화면이 N시간 전/회색을 판단한다.
 *       비밀값(키·토큰)은 읽지도 싣지도 않는다 — 광고·RC 로그에는 비밀이 없다(캠페인 수치만).
 *
 *  loadAds()           애플 광고 5개국   ← ~/signum-ego-io/<날짜>/ads-periods-*.log · ads-today-*.log · ads-periods-result.json
 *  loadInstalls()      RevenueCat 신규    ← ~/Documents/signum-work/<최신 날짜>/report/rc.log («플랫폼별» JSON)
 *  loadTodo()          대표 할 일         ← ~/Documents/Project/recipt/대표-할일.md (최신판 그대로)
 *  loadRunner()        예약 게시 실행기   ← ~/signum-ego-io/<날짜>/pub/.day-sched-*.pid · <표>.tsv · day-sched-<표>.log
 *  loadParticipation() 커뮤니티 참여      ← ~/Documents/signum-work/growth/communities/PARTICIPATION-LOG.md
 *  parseHuman()/parseGift()                collect.js 가 느린 명령(mkt-clicks-human·mkt-gift)의 출력을 읽을 때 쓴다
 * ========================================================================== */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const HOME = os.homedir();
const DIRS = {
    egoIo: process.env.HUD_EGO_IO || path.join(HOME, 'signum-ego-io'),
    work: process.env.HUD_WORK || path.join(HOME, 'Documents', 'signum-work'),
    todo: process.env.HUD_TODO_FILE || path.join(HOME, 'Documents', 'Project', 'recipt', '대표-할일.md'),
    participation: process.env.HUD_PARTICIPATION || path.join(HOME, 'Documents', 'signum-work', 'growth', 'communities', 'PARTICIPATION-LOG.md'),
};
const DATE_DIR = /^\d{4}-\d{2}-\d{2}$/;
const num = (s) => Number(String(s).replace(/,/g, ''));
const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const mtime = (p) => { try { return Math.round(fs.statSync(p).mtimeMs); } catch { return null; } };
const listDirs = (root, n) => { try { return fs.readdirSync(root).filter((d) => DATE_DIR.test(d)).sort().slice(-n); } catch { return []; } };

const fmtNY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const nyDay = (ms) => fmtNY.format(new Date(ms));
const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const kstParse = (ymd, hm) => Date.parse(`${ymd}T${hm.length === 4 ? '0' + hm : hm}:00+09:00`);

/** 짧은 TTL 캐시 — 10초 폴링마다 파일을 전부 다시 읽지 않는다. */
const memo = (fn, ttlMs) => { let at = 0, val; return (...a) => { const t = Date.now(); if (t - at < ttlMs) return val; val = fn(...a); at = t; return val; }; };

// ─────────────────────────────────────────────────────────────────────────────
// ① 애플 광고
// ─────────────────────────────────────────────────────────────────────────────
const COUNTRY = { SG: '싱가포르', HK: '홍콩', TW: '대만', JP: '일본', KR: '한국', US: '미국' };
const ADS_ORDER = ['SG', 'HK', 'TW', 'JP', 'KR', 'US'];   // 대표 지시 순서 · US 는 일시 정지(지출 있을 때만 본다)
const CAMP_RE = /^\s+SIGNUM ([A-Z]{2}) - (.+?)\s+(실행 중|일시 정지됨|[가-힣]+(?: [가-힣]+)?)\s+지출 \$([\d,.]+)\s+노출 ([\d,]+)\s+탭 ([\d,]+)\s+설치 ([\d,]+)\s+CPA \$([\d,.]+)(?: · CPT \$([\d,.]+))?/;
const TOTAL_RE = /합계(?:=합계)?\s*\|\s*\$([\d,.]+)\s*\|\s*\$([\d,.]+)\s*\|\s*\$([\d,.]+)\s*\|\s*\$([\d,.]+)\s*\|\s*([\d,]+)\s*\|\s*([\d,]+)\s*\|\s*([\d,]+)/;

/** ads-periods-*.log / ads-today-*.log 텍스트 → [{period, rows, total}] */
function parseAdsText(text) {
    const out = []; let cur = null;
    const push = () => { if (cur && cur.rows.length) out.push(cur); cur = null; };
    for (const ln of text.split('\n')) {
        let m = /^\[(.+?)\]/.exec(ln);
        if (m) { push(); cur = { period: m[1].trim(), rows: [], total: null }; continue; }
        m = /기간 선택=\{"t":"([^"]+)"/.exec(ln);
        if (m) { push(); cur = { period: m[1].trim(), rows: [], total: null }; continue; }
        if (!cur) continue;
        m = CAMP_RE.exec(ln);
        if (m) { cur.rows.push({ code: m[1], name: m[2].trim(), state: m[3], spend: num(m[4]), impr: num(m[5]), taps: num(m[6]), installs: num(m[7]), cpa: num(m[8]), cpt: m[9] != null ? num(m[9]) : null }); continue; }
        m = TOTAL_RE.exec(ln);
        if (m) cur.total = { spend: num(m[1]), impr: num(m[5]), taps: num(m[6]), installs: num(m[7]) };
    }
    push();
    return out;
}
/** ads-periods-result.json → 같은 모양 */
function parseAdsResult(j) {
    const out = [];
    for (const p of Array.isArray(j) ? j : []) {
        const rows = [];
        for (const r of p.per || []) {
            const m = /^SIGNUM ([A-Z]{2}) - (.+)$/.exec(r.c || ''); if (!m) continue;
            rows.push({ code: m[1], name: m[2], state: r.st, spend: num(r.spend), impr: num(r.impr), taps: num(r.taps), installs: num(r.inst), cpa: num(r.cpa), cpt: r.cpt != null ? num(r.cpt) : null });
        }
        const t = TOTAL_RE.exec(String(p.total || ''));
        if (rows.length) out.push({ period: p.period, rows, total: t ? { spend: num(t[1]), impr: num(t[5]), taps: num(t[6]), installs: num(t[7]) } : null });
    }
    return out;
}

function adsReads(egoRoot, daysBack) {
    const reads = [];
    for (const d of listDirs(egoRoot, daysBack)) {
        const dir = path.join(egoRoot, d);
        let files = []; try { files = fs.readdirSync(dir); } catch { continue; }
        for (const f of files) {
            if (!/^(ads-(periods|today)-\d{4}\.log|ads-periods-result\.json)$/.test(f)) continue;
            const p = path.join(dir, f), at = mtime(p); if (at == null) continue;
            const t = readText(p); if (!t) continue;
            let parsed = [];
            try { parsed = f.endsWith('.json') ? parseAdsResult(JSON.parse(t)) : parseAdsText(t); } catch { continue; }
            for (const r of parsed) reads.push(Object.assign({ readAt: at, file: p }, r));
        }
    }
    return reads;
}

/** 기간별로 «가장 최근에 읽은» 것만 고른다. 날짜는 읽은 시각의 뉴욕 날짜로 계산한다(대표 지시: 뉴욕 기준). */
function loadAds({ egoRoot = DIRS.egoIo, daysBack = 5 } = {}) {
    const reads = adsReads(egoRoot, daysBack);
    const pick = (period) => reads.filter((r) => r.period === period).sort((a, b) => b.readAt - a.readAt)[0] || null;
    const shape = (r, kind) => {
        if (!r) return null;
        const today = nyDay(r.readAt);
        const label = kind === 'yesterday' ? addDays(today, -1) : kind === 'today' ? today : null;
        // 같은 나라의 캠페인이 둘 이상이면(US 2개) 나라 단위로 합친다. 상태는 하나라도 «실행 중»이면 실행 중.
        const agg = {};
        for (const x of r.rows) {
            const a = agg[x.code] = agg[x.code] || { code: x.code, country: COUNTRY[x.code] || x.code, state: x.state, spend: 0, impr: 0, taps: 0, installs: 0, campaigns: 0 };
            a.spend += x.spend; a.impr += x.impr; a.taps += x.taps; a.installs += x.installs; a.campaigns++;
            if (x.state === '실행 중') a.state = '실행 중';
        }
        const countries = ADS_ORDER.filter((c) => agg[c]).concat(Object.keys(agg).filter((c) => !ADS_ORDER.includes(c))).map((c) => {
            const a = agg[c]; a.spend = +a.spend.toFixed(2); a.cpa = a.installs ? +(a.spend / a.installs).toFixed(2) : null; return a;
        });
        const sumOf = (k) => r.rows.reduce((a, x) => a + x[k], 0);
        const sum = { spend: +sumOf('spend').toFixed(2), impr: sumOf('impr'), taps: sumOf('taps'), installs: sumOf('installs') };
        // 합계는 «콘솔 합계 줄»을 우선한다(캠페인 행은 센트 반올림이 달라 0.01 어긋난다) — 행 합이 크게 다르면 totalMatches=false
        const total = r.total ? Object.assign({}, r.total) : sum;
        total.cpa = total.installs ? +(total.spend / total.installs).toFixed(2) : null;
        return {
            period: r.period, readAt: r.readAt, file: r.file.replace(HOME, '~'),
            nyDate: label, nyFrom: kind === 'week' ? addDays(today, -7) : null, nyTo: kind === 'week' ? addDays(today, -1) : null,
            countries, total, rowSum: sum,
            totalMatches: r.total ? (Math.abs(r.total.spend - sum.spend) < 0.051 && r.total.installs === sum.installs && r.total.impr === sum.impr && r.total.taps === sum.taps) : null,
        };
    };
    let state = null;
    try { state = JSON.parse(fs.readFileSync(path.join(egoRoot, 'ads-session-state.json'), 'utf8')); } catch { /* 없으면 null */ }
    const y = shape(pick('어제'), 'yesterday'), t = shape(pick('오늘'), 'today'), w = shape(pick('최근 7일'), 'week');
    return {
        yesterday: y, today: t, week: w,
        session: state ? { streak: state.streak || 0, kind: state.kind || '', lastOkAt: state.lastOkAt || null, lastFailAt: state.lastFailAt || null } : null,
        countries: COUNTRY, order: ADS_ORDER,
        // 가장 최근 «정상 판독» — 위 세 기간 중 가장 늦은 판독 시각(없으면 null)
        readAt: [y, t, w].filter(Boolean).reduce((a, x) => Math.max(a, x.readAt), 0) || null,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// ② RevenueCat 신규 고객(설치 근사)
// ─────────────────────────────────────────────────────────────────────────────
/** 시험 고객 — 실적에서 «표시만» 한다(대표 지시). 출처: 메모리 android-rc-zero-check-with-emulator (10/5 에뮬레이터 시험 → 안드 신규 2명). */
const TEST_CUSTOMERS = [{ date: '2026-10-05', platform: 'android', n: 2, note: '10/5 에뮬레이터 연동 시험 고객' }];

function monthNum(s) { return { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 }[s]; }
function rcDate(label) { const m = /^([A-Z][a-z]{2}) (\d{1,2}) '(\d{2})$/.exec(String(label).trim()); return m ? `20${m[3]}-${String(monthNum(m[1])).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}` : null; }

/** rc.log 한 줄의 JSON 파싱 — 1200자 잘림으로 깨진 경우 labels·dates·rows 를 정규식으로 건진다. */
function parseRcLine(line) {
    const i = line.indexOf('{'); if (i < 0) return null;
    const body = line.slice(i);
    let j = null; try { j = JSON.parse(body); } catch { /* 잘림 */ }
    if (!j) {
        const dates = (/"dates":\[(.*?)\]/.exec(body) || [])[1]; const labels = (/"labels":\[(.*?)\]/.exec(body) || [])[1];
        const rows = [...body.matchAll(/\[("[\d,]*"(?:,"[\d,]*")+)\]/g)].map((m) => m[1].split(',').map((x) => x.replace(/"/g, '')));
        if (!dates || !labels || !rows.length) return null;
        j = { dates: JSON.parse('[' + dates + ']'), labels: JSON.parse('[' + labels + ']'), rows };
    }
    return j;
}

function loadInstalls({ work = DIRS.work } = {}) {
    let dirs = []; try { dirs = fs.readdirSync(work).filter((d) => DATE_DIR.test(d)).sort().reverse(); } catch { return null; }
    for (const d of dirs) {
        const p = path.join(work, d, 'report', 'rc.log'); const t = readText(p); if (!t) continue;
        const readAt = mtime(p);
        const plat = t.split('\n').find((l) => /^플랫폼별/.test(l));
        const all = t.split('\n').find((l) => /^전체:/.test(l));
        const jp = plat ? parseRcLine(plat) : null, ja = all ? parseRcLine(all) : null;
        const j = jp || ja; if (!j || !j.dates || !j.rows) continue;
        // 열 = 날짜들 + «Row Average»(마지막)
        const cols = j.dates.filter((x) => rcDate(x)).map((x) => ({ label: x, date: rcDate(x) }));
        const n = cols.length;
        const labels = (j.labels || []).map((x) => String(x).trim()).filter((x) => x && x !== 'Segments');
        // 플랫폼 JSON: labels = [Segments, Total, iOS, Android] · rows 같은 순서. «전체:» 만 있으면 rows[0] = 전체
        const named = {}; if (jp) { labels.forEach((lb, k) => { named[lb.toLowerCase()] = (j.rows[k] || []).slice(0, n).map(num); }); }
        const total = (named.total || (ja ? ja.rows[0].slice(0, n).map(num) : (j.rows[0] || []).slice(0, n).map(num)));
        const ios = named.ios || null, android = named.android || null;
        // 읽은 날(UTC)과 같거나 늦은 열은 «진행 중(부분)» — 그날이 끝나지 않았다
        const readDay = utcDay(readAt);
        const days = cols.map((c, k) => ({ date: c.date, total: total[k], ios: ios ? ios[k] : null, android: android ? android[k] : null, partial: c.date >= readDay }));
        const full = days.filter((x) => !x.partial);
        const sum = (arr, key) => arr.reduce((a, x) => a + (x[key] == null ? 0 : x[key]), 0);
        return {
            readAt, file: p.replace(HOME, '~'), range: cols.length ? `${cols[0].date}~${cols[n - 1].date}` : null,
            platformSplit: !!jp, days,
            last: full.length ? full[full.length - 1] : null,                    // 마지막 «완결일»
            partial: days.find((x) => x.partial) || null,
            week: { total: sum(full, 'total'), ios: ios ? sum(full, 'ios') : null, android: android ? sum(full, 'android') : null, days: full.length },
            tests: TEST_CUSTOMERS.filter((t) => days.some((x) => x.date === t.date)),
        };
    }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ③ 대표 할 일 — 파일 그대로(최신판만). 누적하지 않는다.
// ─────────────────────────────────────────────────────────────────────────────
function parseTodo(md) {
    const out = { title: '', versionAt: null, note: '', sections: [], footer: [] };
    let cur = null, footer = false;
    for (const raw of md.split(/\r?\n/)) {
        if (/^#\s+/.test(raw) && !out.title) {
            out.title = raw.replace(/^#\s+/, '').trim();
            const m = /\((\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*KST\)/.exec(out.title); if (m) out.versionAt = kstParse(m[1], m[2]);
            continue;
        }
        if (/^>\s?/.test(raw)) { out.note += (out.note ? ' ' : '') + raw.replace(/^>\s?/, '').trim(); continue; }
        if (/^-{3,}\s*$/.test(raw)) { footer = true; cur = null; continue; }
        const h2 = /^##\s+(.+)$/.exec(raw);
        if (h2 && !footer) { cur = { h: h2[1].trim(), items: [], paras: [] }; out.sections.push(cur); continue; }
        if (!raw.trim()) continue;
        if (footer) { out.footer.push(raw.replace(/^\s*[-*]\s+/, '').trim()); continue; }
        if (!cur) continue;
        const li = /^(\s*)[-*]\s+(?:\[( |x|X)\]\s+)?(.*)$/.exec(raw);
        if (li) {
            const node = { text: li[3].trim(), checked: li[2] == null ? null : li[2] !== ' ', children: [] };
            const indent = li[1].length;
            const last = cur.items[cur.items.length - 1];
            if (indent >= 2 && last) last.children.push(node); else cur.items.push(node);
        } else cur.paras.push(raw.trim());
    }
    for (const s of out.sections) {
        s.kind = /대기\s*중|할 일 없음/.test(s.h) ? 'wait' : /채팅/.test(s.h) ? 'chat' : /준비/.test(s.h) ? 'prep' : 'do';
        const boxes = s.items.filter((i) => i.checked != null);
        s.open = s.kind === 'wait' ? 0 : (boxes.length ? boxes.filter((i) => !i.checked).length : ((s.items.length || s.paras.length) ? 1 : 0));
    }
    const sum = (k) => out.sections.filter((s) => s.kind === k).reduce((a, s) => a + s.open, 0);
    out.counts = { do: sum('do'), chat: sum('chat'), prep: sum('prep'), wait: out.sections.filter((s) => s.kind === 'wait').reduce((a, s) => a + s.items.length + s.paras.length, 0) };
    out.counts.open = out.counts.do + out.counts.chat + out.counts.prep;
    return out;
}
function loadTodo({ file = DIRS.todo } = {}) {
    const t = readText(file); if (t == null) return null;
    const j = parseTodo(t);
    return Object.assign(j, { fileAt: mtime(file), file: file.replace(HOME, '~'), at: j.versionAt || mtime(file) });
}

// ─────────────────────────────────────────────────────────────────────────────
// ④ 예약 게시 실행기 (day-sched.sh — 모델 없음)
// ─────────────────────────────────────────────────────────────────────────────
const psInfo = (pid) => {
    try {
        const s = execFileSync('ps', ['-p', String(pid), '-o', 'etime=,command='], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        if (!s) return null;
        const m = /^(\S+)\s+(.*)$/.exec(s); return m ? { etime: m[1], cmd: m[2] } : null;
    } catch { return null; }
};
function loadRunner({ egoRoot = DIRS.egoIo, now = Date.now() } = {}) {
    const pubs = [];
    for (const d of listDirs(egoRoot, 4).reverse()) {
        const p = path.join(egoRoot, d, 'pub'); let rp = null; try { rp = fs.realpathSync(p); } catch { continue; }
        if (!pubs.includes(rp)) pubs.push(rp);
    }
    const runners = [];
    for (const pub of pubs) {
        let files = []; try { files = fs.readdirSync(pub); } catch { continue; }
        for (const f of files) {
            const m = /^\.day-sched-(.+)\.pid$/.exec(f); if (!m) continue;
            const name = m[1], pid = parseInt(readText(path.join(pub, f)) || '', 10);
            const info = Number.isFinite(pid) ? psInfo(pid) : null;
            const alive = !!(info && /day-sched/.test(info.cmd));
            const tsv = readText(path.join(pub, name + '.tsv')) || '';
            const log = readText(path.join(pub, `day-sched-${name}.log`)) || '';
            const slots = tsv.split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l) => {
                const [id, at, acct, kind, lang, tickers] = l.split('\t');
                const atMs = /^\d{12}$/.test(at || '') ? kstParse(`${at.slice(0, 4)}-${at.slice(4, 6)}-${at.slice(6, 8)}`, `${at.slice(8, 10)}:${at.slice(10, 12)}`) : null;
                const rc = new RegExp('↳ ' + id.replace(/[^\w-]/g, '') + ' 종료코드 (\\d+)').exec(log);
                const skipped = new RegExp('⏭ ' + id.replace(/[^\w-]/g, '') + ' 건너뜀').test(log);
                const state = rc ? (rc[1] === '0' ? 'done' : 'fail') : skipped ? 'skipped' : (atMs && atMs < now - 45 * 60e3 ? 'missed' : 'pending');
                return { id, at: atMs, acct, kind, lang, tickers: tickers || '', state, rc: rc ? Number(rc[1]) : null };
            }).sort((a, b) => (a.at || 0) - (b.at || 0));
            const next = slots.find((s) => s.state === 'pending') || null;
            const flags = files.filter((x) => x === 'STOP' || /^SKIP-/.test(x));
            const lastLines = log.split('\n').filter((l) => l.trim()).slice(-3);
            const posted = (readText(path.join(pub, 'posted.tsv')) || '').split('\n').filter(Boolean).slice(-4).reverse().map((l) => {
                const [ep, ch, url] = l.split('\t'); return { at: Number(ep) * 1000, ch, url };
            });
            runners.push({ name, pid: Number.isFinite(pid) ? pid : null, alive, etime: info ? info.etime : null, slots, next,
                done: slots.filter((s) => s.state === 'done').length, total: slots.length, flags, lastLines, posted, logAt: mtime(path.join(pub, `day-sched-${name}.log`)) });
        }
    }
    runners.sort((a, b) => (b.alive - a.alive) || ((b.logAt || 0) - (a.logAt || 0)));
    return { runners, alive: runners.filter((r) => r.alive), at: now };
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑤ 커뮤니티 참여 기록
// ─────────────────────────────────────────────────────────────────────────────
function loadParticipation({ file = DIRS.participation, max = 8 } = {}) {
    const t = readText(file); if (t == null) return null;
    const entries = []; let date = null;
    for (const ln of t.split('\n')) {
        const d = /^##\s+(\d{4}-\d{2}-\d{2})/.exec(ln); if (d) { date = d[1]; continue; }
        if (/^##\s/.test(ln)) { date = null; continue; }
        const h = /^###\s+(?:\d+\.\s+)?(.+)$/.exec(ln);
        if (h && date) {
            const title = h[1].replace(/\*\*/g, '').trim();
            // 머리글의 모양이 제각각이라(제목 — 상태 — 계정) 칸을 나누지 않고 «전체 문장»을 보여 주고 색만 판정한다.
            const neg = /미게시|미실행|막힘|안 함|보류|0개|로그인 안|불가|거절/.test(title);
            const pos = /게시 완료|등록 완료|참여 완료|제출 완료|공개/.test(title);
            entries.push({ date, title, tone: neg ? 'warn' : pos ? 'ok' : 'info' });
        }
    }
    return { at: mtime(file), file: file.replace(HOME, '~'), recent: entries.slice(-max).reverse(), count: entries.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑥ 느린 명령 출력 파서 (collect.js 가 쓴다)
// ─────────────────────────────────────────────────────────────────────────────
/** node scripts/mkt-clicks-human.js <일수> 의 첫 표 → 태그 가족별 «중복 제외» 합.
 *  같은 글·같은 홈에서 여러 링크(sg·uc·wim·code)가 한꺼번에 세어지므로(홈 링크 4개가 같은 방문자를 4번 센다 — 10/4 실측)
 *  가족(태그)마다 «사람 폰이 가장 많은 한 행»만 대표로 쓴다. 따라서 phone 은 «최소치»다. phoneRowSum 은 중복을 그대로 더한 값. */
function parseHuman(text) {
    const head = /최근 (\d+)일 ET: (\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})/.exec(text);
    if (!head) return null;
    const lines = text.split('\n');
    let i = lines.findIndex((l) => /^앱:태그/.test(l)); if (i < 0) return null;
    const rows = [];
    for (i++; i < lines.length && lines[i].trim(); i++) {
        const m = /^(\w+):(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+│\s+(\d+)\s+(\d+%|-)\s+│\s+(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)/.exec(lines[i]);
        if (!m) continue;
        rows.push({ app: m[1], tag: m[2], ios: +m[3], android: +m[4], pc: +m[5], raw: +m[6], nonHuman: +m[8] + +m[9] + +m[10] + +m[11] + +m[12] });
    }
    const fam = (t) => (t === 'home_hero' ? 'home' : t);
    const by = {};
    for (const r of rows) (by[fam(r.tag)] = by[fam(r.tag)] || []).push(r);
    const tags = Object.entries(by).map(([tag, rs]) => {
        const rep = rs.slice().sort((a, b) => ((b.ios + b.android) - (a.ios + a.android)) || (b.pc - a.pc) || (b.raw - a.raw))[0];
        return { tag, ios: rep.ios, android: rep.android, pc: rep.pc, raw: rep.raw, rawAll: rs.reduce((a, x) => a + x.raw, 0), repApp: rep.app, rows: rs.length };
    }).sort((a, b) => ((b.ios + b.android) - (a.ios + a.android)) || (b.pc - a.pc) || (b.raw - a.raw) || a.tag.localeCompare(b.tag));
    const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
    const failed = (/조회 실패 (\d+)건/.exec(text) || [])[1];
    return {
        days: +head[1], etFrom: head[2], etTo: head[3],
        ios: sum(tags, (x) => x.ios), android: sum(tags, (x) => x.android), pc: sum(tags, (x) => x.pc), raw: sum(tags, (x) => x.raw),
        phone: sum(tags, (x) => x.ios + x.android),
        phoneRowSum: sum(rows, (x) => x.ios + x.android), pcRowSum: sum(rows, (x) => x.pc), rawRowSum: sum(rows, (x) => x.raw),
        tags: tags.slice(0, 14), tagCount: tags.length, rowCount: rows.length, failed: failed ? +failed : 0,
    };
}

/** node scripts/mkt-gift.js --days N 의 ①②③ 중 ①(보낸 쪽)·②(받은 쪽) 합계. */
function parseGift(text) {
    const head = /최근 (\d+)일\(ET (\d{4}-\d{2}-\d{2}) ~ (\d{4}-\d{2}-\d{2})\)/.exec(text);
    if (!head) return null;
    const pop = { shown: 0, tap: 0, sent: 0 }; const entries = [];
    for (const m of text.matchAll(/^\s+(gift_\w+)\s+(\w+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/gm)) {
        entries.push({ surface: m[1], via: m[2], shown: +m[3], tap: +m[4], sent: +m[5] });
        pop.shown += +m[3]; pop.tap += +m[4]; pop.sent += +m[5];
    }
    const daily = [];
    for (const m of text.matchAll(/^\s+(\d{4}-\d{2}-\d{2})\s+(\d+) \((\d+)·(\d+)·(\d+)\)\s+(\d+)\s+(\d+)·(\d+)·(\d+)·(\d+)\s+(\d+)·(\d+)·(\d+)·(\d+)·(\d+)\s+(\d+)\s*$/gm)) {
        daily.push({ date: m[1], human: +m[2], ios: +m[3], android: +m[4], pc: +m[5], couponView: +m[6], tapApply: +m[7], tapCopy: +m[8], tapPlay: +m[9], tapInstall: +m[10], raw: +m[16] });
    }
    const tot = /합계\s+사람\s+(\d+)\s+→\s+쿠폰 화면\s+(\d+)\s+→\s+적용 단추\s+(\d+)\s*\/\s*개인 번호 배정\s+(\d+)/.exec(text);
    const inviters = /사람 클릭이 있었던 id (\d+)개 · 그중 친구가 적용\/배정까지 간 id (\d+)개/.exec(text);
    return {
        days: +head[1], etFrom: head[2], etTo: head[3],
        sender: pop, entries, daily,
        receiver: tot ? { human: +tot[1], couponView: +tot[2], applyTap: +tot[3], claimed: +tot[4] } : null,
        inviters: inviters ? { withHumanClick: +inviters[1], reachedApply: +inviters[2] } : null,
    };
}

module.exports = {
    DIRS, COUNTRY, ADS_ORDER, TEST_CUSTOMERS, nyDay, utcDay, addDays, memo,
    parseAdsText, parseAdsResult, loadAds, parseRcLine, loadInstalls, parseTodo, loadTodo, loadRunner, loadParticipation, parseHuman, parseGift,
};
