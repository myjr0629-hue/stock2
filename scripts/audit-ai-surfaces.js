#!/usr/bin/env node
/**
 * 앱의 «AI 가 쓴 자리»가 지금 진짜 AI 인지 폴백인지 한 번에 잰다.
 *
 * 왜 필요한가 — 2026-09-09 아침 브리핑이 11.9시간 동안 템플릿이었는데
 * 어떤 검사에도 안 걸렸다. 폴백은 «에러»가 아니라 «글자»로 오기 때문이다.
 * 화면은 차 있고, HTTP 는 200 이고, 필드는 null 이 아니다.
 * → 값의 «출처»를 봐야 한다. 그걸 자동으로 보는 검사기.
 *
 * 사용: node scripts/audit-ai-surfaces.js [--base https://www.signumhq.com]
 */
const BASE = (() => {
    const i = process.argv.indexOf('--base');
    return i > 0 ? process.argv[i + 1] : 'https://www.signumhq.com';
})();

// 폴백일 때만 나오는 지문. 하나라도 걸리면 «AI 아님».
const FALLBACK_MARKS = [
    // ★ 예열이 빈 입력으로 호출해 캐시에 앉힌 «정직한 무능력» 문장들 (2026-09-10)
    '분석 불가능', '판단 불가', '데이터 부재', '데이터 전무', '피드 단절',
    'Insight generation failed',
    'temporarily unavailable',
    'Briefing not available',
    'Gathering Pulse',
    'System Initializing',
    '프리마켓 브리핑입니다',          // 템플릿 브리핑 고정 문구(ko)
    'Pre-market conditions as of',   // 〃 (en)
    'のプレマーケットブリーフィングです', // 〃 (ja)
];

const UA = { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' };

async function get(path, opts = {}) {
    const r = await fetch(BASE + path, { headers: UA, signal: AbortSignal.timeout(60000), ...opts });
    const t = await r.text();
    try { return { status: r.status, body: JSON.parse(t) }; }
    catch { return { status: r.status, body: null, raw: t.slice(0, 200) }; }
}

/** AI 필드는 {ko,en,ja} 형태가 흔하다. 문자열이면 그대로, 딕셔너리면 로케일을 꺼낸다. */
function pick(v, loc = 'ko') {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'object') return String(v[loc] || v.ko || v.en || '');
    return String(v);
}

function hasFallbackMark(text) {
    const s = String(text || '');
    return FALLBACK_MARKS.find((m) => s.includes(m)) || null;
}

/** ET 기준 지금 몇 시인가 — «아직 안 만들어진 것»과 «못 만든 것»을 가르는 데 쓴다. */
function etClock() {
    const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    return { hours: d.getHours() + d.getMinutes() / 60, weekday: d.getDay() >= 1 && d.getDay() <= 5 };
}

const results = [];
function record(surface, verdict, detail) {
    results.push({ surface, verdict, detail });
    const icon = verdict === 'AI' ? '✅' : verdict === 'FALLBACK' ? '🔴'
        : verdict === 'PENDING' ? '⏳' : verdict === 'EMPTY' ? '⚪' : '⚠️';
    console.log(`${icon} ${surface.padEnd(38)} ${verdict.padEnd(9)} ${detail}`);
}

(async () => {
    console.log(`\n══ AI 자리 전수검사 — ${BASE} ══\n`);

    // 1) 아침 브리핑 — source 필드가 출처를 직접 말한다
    for (const loc of ['ko', 'en', 'ja']) {
        const { status, body } = await get(`/api/guardian/briefing?locale=${loc}`);
        if (status !== 200 || !body) { record(`briefing:${loc}`, 'HTTP', `status ${status}`); continue; }
        const text = body.briefing;
        if (!text) {
            // 아침 브리핑은 08:00 ET 에 만들어진다. 그 전이나 주말이면 «없는 것»이 정상이다.
            const { hours, weekday } = etClock();
            const tooEarly = !weekday || hours < 8.5;
            record(`briefing:${loc}`, tooEarly ? 'PENDING' : 'EMPTY',
                tooEarly ? `아직 생성 전 (ET ${hours.toFixed(1)}시${weekday ? '' : ' · 주말'}) — 정상`
                         : (body.message || '본문 없음'));
            continue;
        }
        const mark = hasFallbackMark(text);
        if (body.degraded === true || String(body.source) !== 'claude' || mark) {
            record(`briefing:${loc}`, 'FALLBACK', `source=${body.source} degraded=${body.degraded}${mark ? ` mark="${mark}"` : ''}`);
        } else {
            record(`briefing:${loc}`, 'AI', `${String(text).length}자 · ${body.source}`);
        }
    }

    // 2) 가디언 판정 3종 — AI 3콜(rotation·reality·gamma)이 각각 폴백 문구를 갖는다
    {
        const { status, body } = await get('/api/debug/guardian');
        const v = body?.verdict || body?.data?.verdict;
        if (status !== 200 || !v) { record('guardian:verdict', 'HTTP', `status ${status}`); }
        else {
            for (const [name, key] of [['rotation', 'description'], ['reality', 'realityInsight'], ['gamma', 'gammaInsight']]) {
                const text = v[key];
                if (!text) { record(`guardian:${name}`, 'EMPTY', '필드 없음'); continue; }
                const mark = hasFallbackMark(text);
                if (mark) record(`guardian:${name}`, 'FALLBACK', `mark="${mark}"`);
                else record(`guardian:${name}`, 'AI', `${String(text).length}자`);
            }
        }
    }

    // 3) 인텔 종합 브리프 — structured.marketOverview.summary 가 {ko,en,ja}
    {
        const { status, body } = await get('/api/intel/cross-sector-brief');
        const mo = body?.structured?.marketOverview;
        if (status !== 200) record('intel:cross-sector', 'HTTP', `status ${status}`);
        else if (!mo) record('intel:cross-sector', 'EMPTY', 'marketOverview 없음');
        else {
            const missing = ['ko', 'en', 'ja'].filter((l) => pick(mo.summary, l).length < 20);
            const mark = hasFallbackMark(pick(mo.summary));
            if (mark) record('intel:cross-sector', 'FALLBACK', `mark="${mark}"`);
            else if (missing.length) record('intel:cross-sector', 'EMPTY', `로케일 결손: ${missing.join(',')}`);
            else record('intel:cross-sector', 'AI', `tone=${mo.tone} · ko ${pick(mo.summary).length}자 · 3개국어`);
        }
    }

    // 4) 섹터 스냅샷 헤드라인 — 앱 인텔 «판정문»이 이걸 읽는다
    //    ★ 첫 판에서 이 자리를 «AI» 로 통과시켰는데 **틀렸다.**
    //      generateNextDayBriefing() 의 하드코딩 분기 4갈래였다. 글자는 멀쩡하고
    //      3개국어도 다 차 있어서 «폴백 지문»·«로케일 결손» 어느 쪽에도 안 걸렸다.
    //      → 라우트가 스스로 말하게 만들었다: headlineSource === 'claude' 일 때만 AI.
    //        그리고 템플릿 골격 자체를 지문으로 등록한다.
    //    실제 경로: snapshot.sector_summary.briefing.{headline,headlineEN,headlineJP}
    for (const sec of ['m7', 'silicon_core', 'power_matrix', 'bio_pulse', 'cloud_fortress']) {
        const { status, body } = await get(`/api/intel/snapshot?sector=${sec}`);
        const b = body?.snapshot?.sector_summary?.briefing;
        if (status !== 200) { record(`intel:snapshot:${sec}`, 'HTTP', `status ${status}`); continue; }
        if (!b || typeof b !== 'object') { record(`intel:snapshot:${sec}`, 'EMPTY', 'briefing 없음'); continue; }
        const missing = [['ko', 'headline'], ['en', 'headlineEN'], ['ja', 'headlineJP']]
            .filter(([, k]) => String(b[k] || '').length < 12).map(([l]) => l);
        const mark = hasFallbackMark(b.headline);
        // 템플릿 골격(하드코딩 4갈래)의 지문
        const TEMPLATE = [
            /^전 종목 상승 — .+ 선도, 리스크 온 모드$/,
            /^전 종목 하락 — .+ 최대 낙폭, 방어적 환경 관측$/,
            /주도 반등, 그러나 \d+종 중 \d+종 하락 — 변동성 지속 관측$/,
            /^\d+종 상승 vs \d+종 하락 — .+ 장세, 혼조 환경 관측$/,
        ];
        const looksTemplate = TEMPLATE.some((re) => re.test(String(b.headline || '')));
        const isAi = String(b.headlineSource || '') === 'claude';
        if (mark) record(`intel:snapshot:${sec}`, 'FALLBACK', `mark="${mark}"`);
        else if (missing.length) record(`intel:snapshot:${sec}`, 'EMPTY', `로케일 결손: ${missing.join(',')}`);
        else if (!isAi || looksTemplate) {
            record(`intel:snapshot:${sec}`, 'FALLBACK',
                `템플릿 판정문${looksTemplate ? '(골격 일치)' : ''} · headlineSource=${b.headlineSource || '없음'}`);
        } else {
            record(`intel:snapshot:${sec}`, 'AI', `${b.headlineAgeMin}분 전 · "${String(b.headline).slice(0, 34)}"`);
        }
    }

    // 5) 플로우 AI 분석 — 앱 «상세 시나리오»가 읽는다. usedFallback 을 라우트가 직접 준다.
    {
        const { status, body } = await get('/api/flow/ai-analysis', {
            method: 'POST',
            headers: { ...UA, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticker: 'NVDA', locale: 'ko', triggerReason: 'AUDIT' }),
        });
        if (status !== 200 || !body) record('flow:ai-analysis', 'HTTP', `status ${status}`);
        else {
            const thesis = pick(body.structuralThesis);
            const missing = ['ko', 'en', 'ja'].filter((l) => pick(body.structuralThesis, l).length < 30);
            const mark = hasFallbackMark(thesis);
            if (body.usedFallback === true || mark) {
                record('flow:ai-analysis', 'FALLBACK', `usedFallback=${body.usedFallback}${mark ? ` mark="${mark}"` : ''}`);
            } else if (!thesis) record('flow:ai-analysis', 'EMPTY', 'structuralThesis 없음');
            else if (missing.length) record('flow:ai-analysis', 'EMPTY', `로케일 결손: ${missing.join(',')}`);
            else record('flow:ai-analysis', 'AI', `${thesis.length}자 · 팩터 ${(body.factorHighlights || []).length}건 · ${body.model}`);
        }
    }

    // 6) 커맨드 심층분석 — POST 전용. 이것도 usedFallback 을 준다.
    //    ★ [2026-09-10] 이 라우트는 화면이 계산한 snapshot 을 받아야 한다. 빈 몸으로 부르면
    //      422 로 막힌다(예열이 캐시를 오염시킨 뒤 넣은 가드다). 검사기는 «실제 화면이
    //      보내는 모양»을 흉내 내야 진짜 경로를 잰다.
    {
        const snapshot = {
            session: 'CLOSED',
            signalCore: { score: 62, label: 'ACCUMULATION', rsi: 54.2, rvol: 1.1 },
            structure: { support: 218, resistance: 232, trend: 'RANGE' },
            sma: { sma20: 224.1, sma50: 219.8, sma200: 198.4, goldenCross: true },
            volatility: { ivPercentile: 38, impliedMovePct: 3.2, atrPct: 2.4 },
            flow: { netPremium: 2800000, pcRatio: 2.16, opi: 68 },
            squeeze: { probability: 18, label: 'LOW' },
            technicals: { adx: { value: 21.4, regime: 'WEAK_TREND', diPos: 24, diNeg: 19 },
                          obv: { slopePct: 1.8, divergence: 'NONE' },
                          bb: { widthPct: 4.2, percentile: 31, squeeze: false },
                          atr: { pct: 2.4 } },
        };
        const { status, body } = await get('/api/command/deep-analysis', {
            method: 'POST',
            headers: { ...UA, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticker: 'NVDA', locale: 'ko', triggerReason: 'AUDIT', snapshot }),
        });
        if (status === 422) {
            record('cmd:deep-analysis', 'HTTP', '422 — 검사기 snapshot 이 가드 기준에 못 미친다(검사기를 고칠 것)');
        } else if (status !== 200 || !body) record('cmd:deep-analysis', 'HTTP', `status ${status}`);
        else {
            const insight = pick(body.keyInsight);
            const missing = ['ko', 'en', 'ja'].filter((l) => pick(body.keyInsight, l).length < 30);
            const mark = hasFallbackMark(insight);
            if (body.usedFallback === true || mark) {
                record('cmd:deep-analysis', 'FALLBACK', `usedFallback=${body.usedFallback}${mark ? ` mark="${mark}"` : ''}`);
            } else if (!insight) record('cmd:deep-analysis', 'EMPTY', 'keyInsight 없음');
            else if (missing.length) record('cmd:deep-analysis', 'EMPTY', `로케일 결손: ${missing.join(',')}`);
            else record('cmd:deep-analysis', 'AI', `${insight.length}자 · 섹션 ${(body.sections || []).length}개 · ${body.model}`);
        }
    }

    // 7) 뉴스 다이제스트 — items[].summaryKR/EN/JP + analysisKR/EN/JP 가 AI 산출물이다.
    //    ★ 여기가 특히 조용히 틀린다: 번역이 실패하면 영어 원문이 summaryKR 에 그대로 들어앉는다
    //      (200 OK · 필드 있음 · 글자 있음). [[ai-localization-silent-english-fallback]]
    {
        const HANGUL = /[\uAC00-\uD7A3]/;
        const { status, body } = await get('/api/guardian/news-digest?locale=ko');
        const items = Array.isArray(body?.items) ? body.items : [];
        if (status !== 200) record('guardian:news-digest', 'HTTP', `status ${status}`);
        else if (!items.length) record('guardian:news-digest', 'EMPTY', '항목 0건');
        else {
            const noKo = items.filter((it) => !HANGUL.test(String(it.summaryKR || ''))).length;
            const noAnalysis = items.filter((it) => String(it.analysisKR || '').length < 20).length;
            if (noKo > 0) record('guardian:news-digest', 'FALLBACK', `${items.length}건 중 ${noKo}건이 한국어가 아니다(영어 폴백)`);
            else if (noAnalysis > 0) record('guardian:news-digest', 'EMPTY', `${items.length}건 중 ${noAnalysis}건 analysisKR 결손`);
            else record('guardian:news-digest', 'AI', `${items.length}건 · 3개국어 요약·분석 충족`);
        }
    }

    // PENDING = 「아직 만들 때가 아니다」. 실패가 아니므로 세지 않는다.
    const bad = results.filter((r) => r.verdict !== 'AI' && r.verdict !== 'PENDING');
    const pending = results.filter((r) => r.verdict === 'PENDING').length;
    const scored = results.length - pending;
    console.log(`\n── 결과: ${scored - bad.length}/${scored} 진짜 AI${pending ? ` (대기 ${pending}건 제외)` : ''} ──`);
    if (bad.length) {
        console.log('\n⚠ AI 가 아닌 자리:');
        for (const b of bad) console.log(`   ${b.verdict.padEnd(9)} ${b.surface} — ${b.detail}`);
        process.exitCode = 1;
    } else {
        console.log('전 항목 AI 생성 확인.');
    }
})().catch((e) => { console.error('검사기 자체 실패:', e.message); process.exitCode = 2; });
