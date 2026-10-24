/* ============================================================================
 * App Store Connect «앱 분석» 자동 판독 — 읽기 전용 (대표 10/14 «애플은 로그인했다 · 전방위적으로 설치를 늘려줘라»)
 *   scripts/hud/refresh.js 가 하루 2회(09:40·17:40 KST) ego-run.sh 로 돌린다. 모델 없음. 수동: bash scripts/ego-run.sh scripts/hud/asc-read.mjs 300
 *
 * 무엇을 읽나(전부 ASC 웹 «분석» 이 쓰는 API 와 같은 요청 — 로그인된 ego 세션의 쿠키로, 화면에 보이는 값과 같다)
 *   · 소스 유형별(App Store 검색·탐색·앱 추천·웹 추천) 노출 · 제품 페이지 조회 · 첫 다운로드(units) · 총 다운로드 — 하루 단위 30일
 *   · 국가별 첫 다운로드·제품 페이지 조회(storefront, 한국어 이름) · 플랫폼 · 한국/일본/미국 × 소스 · 웹 추천 × 국가
 *   · 캠페인(ct) 별 노출·조회·첫 다운로드  — 스마트링크가 붙이는 ct 토큰(예: clien)이 여기 나온다
 *   · 웹 추천 도메인·앱 추천 목록(sources/list) — ⚠ 애플 개인정보 임계값 미달이면 «빈 목록»(meetsThreshold=false) 이다. 0 이 아니라 «안 보임».
 *   · 구독 프로모션(오퍼 코드 포함) 시작 수 — subscription-events-offerStarts (일별·오퍼별·국가별·소스별)
 *   · 맞춤 제품 페이지(CPP) 조회·다운로드·전환(5명 미만이면 meetsThreshold=false) · 제품 페이지 최적화(PPO) 테스트 목록·결과
 *
 * 정직 원칙
 *   · 로그인 화면이면 «SIGNIN» 한 줄로 끝낸다(비밀번호·2단계 인증은 입력하지 않는다). 판독 실패는 0 이 아니라 error 로 적는다.
 *   · 애플 하루 = UTC. 오늘(UTC) 값은 0 으로 올 뿐 «집계 전»이다 → latestDay = 노출·조회·다운로드 중 하나라도 >0 인 마지막 날(오늘 제외).
 *   · 읽기 전용 — 클릭은 왼쪽 메뉴 «소스» 한 번뿐(분석 API 요청 모양·헤더를 얻기 위해). 입력·저장·제출 없음. 가로챈 헤더 값은 출력·저장하지 않는다.
 *   · 공간: 0(mkt) 우선, 3·5 는 쓰지 않는다. 대표가 쥔(사용자 제어) 공간은 되찾지 않는다.
 *
 * 출력: 마지막 줄 «ASC_DATA {json}» — refresh.js 가 읽어 ~/signum-ego-io/hud-asc.json 에 쓴다. (이 스크립트도 오늘 ego-io 폴더에 asc-analytics.json 사본을 남긴다)
 * ========================================================================== */
process.on('unhandledRejection', (e) => console.log('(무시)', String((e && e.message) || e).slice(0, 80)));
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const T0 = Date.now(); const el = () => Math.round((Date.now() - T0) / 1000) + 's';
const log = (...a) => console.log(`[${el()}]`, ...a);
const APP_ID = '6783130444';             // 공개 값(스토어 주소의 id)
const DAYS = 30;                          // 하루 단위로 읽는 일수(UTC)
const out = (o) => { try { fs.writeFileSync(L.ioDir() + '/asc-analytics.json', JSON.stringify(o)); } catch { /* 사본 저장 실패 무시 */ } console.log('ASC_DATA ' + JSON.stringify(o)); };
const R = { at: Date.now(), appId: APP_ID, ok: false, error: null, fails: [] };

// ── 공간: 관제 전용 에이전트 공간(hud-reader) — 공간 0 이 사용자 제어여도 읽는다. 대표 공간은 건드리지 않는다(2026-10-24) ─────────
const pickSpace = () => L.hudSpace();
const ts = await pickSpace();
if (!ts) { console.log('SPACE_BUSY — 관제 전용 공간(hud-reader)을 쓸 수 없다(사용자 제어로 넘어갔거나 생성 실패). 되찾지 않는다.'); R.error = 'SPACE_BUSY'; out(R); process.exit(0); }
log('공간', ts.spaceId);

let page = null, mine = false;
try { page = await ts.newPage(); mine = true; }
catch (e) { log('새 탭 실패(' + String(e.message).slice(0, 60) + ') → 기존 ASC 탭을 쓴다'); page = await L.findPage(ts, /appstoreconnect\.apple\.com/, null); }
const closePage = async () => { if (mine) { try { await page.close(); } catch { /* 닫기 실패 무시 */ } } };

try {
    // ── 1. 분석 «개요» 를 열고(로그인 판정) 왼쪽 «소스» 를 눌러 분석 API 요청의 헤더를 얻는다 ──────────
    await page.goto(`https://appstoreconnect.apple.com/apps/${APP_ID}/analytics/overview?dateSpec=d30`).catch(() => {});
    let loaded = false, url = '';
    for (let i = 0; i < 20; i++) {                       // ASC 는 느리다(첫 그림까지 10~20초 실측)
        await L.wait(3000);
        url = String(await page.url());
        if (/idmsa\.apple\.com|\/login|signin|authResult/i.test(url)) break;
        const n = await page.evaluate(() => document.body.innerText.length).catch(() => 0);
        if (n > 500) { loaded = true; break; }
    }
    if (/idmsa\.apple\.com|\/login|signin|authResult/i.test(url)) {
        console.log('SIGNIN — App Store Connect 로그인 화면(세션 만료). 비밀번호·2단계 인증은 입력하지 않는다 — 대표 재로그인 필요.');
        R.error = 'SIGNIN'; out(R); await closePage(); process.exit(0);
    }
    if (!loaded) {
        const txt = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 160)).catch(() => '');
        if (/로그인|Sign In|Apple ID/i.test(txt)) { console.log('SIGNIN — 화면에 로그인 문구: ' + txt.slice(0, 80)); R.error = 'SIGNIN'; out(R); await closePage(); process.exit(0); }
        R.error = 'NOT_LOADED: ' + url.replace(/\?.*/, '') + ' · ' + txt.slice(0, 80); out(R); await closePage(); process.exit(0);
    }
    log('열림', url.replace(/\?.*/, ''));
    await page.evaluate(() => {
        window.__log = [];
        const of = window.fetch;
        window.fetch = async function (u, o) { const res = await of.apply(this, arguments); try { const url = String((u && u.url) || u); if (/analytics\/api\/v1\/data\/timeseries/.test(url)) window.__log.push({ url, h: o && o.headers }); } catch { /* 가로채기 실패는 무시 */ } return res; };
    });
    let h0 = null;
    for (let k = 0; k < 3 && !h0; k++) {
        try { await L.clickText(page, /^소스$|^Sources$/, { tags: 'a,button,span,div', after: 9000 }); } catch (e) { log('소스 클릭 실패 ' + String(e.message).slice(0, 60)); await L.wait(4000); }
        h0 = (await page.evaluate(() => window.__log || []).catch(() => []))[0] || null;
    }
    if (!h0) { R.error = 'NO_HEADERS — 분석 API 요청 가로채기 실패(화면 구조 변경 또는 로그인 만료 의심) — «판독 실패», 0 이 아니다'; out(R); await closePage(); process.exit(0); }

    // ── 2. API 호출 도우미 — 호출마다 evaluate 한 번(15초 제한) + 브라우저 쪽 12초 중단 ───────────
    const api = async (path, body) => {
        const t0 = Date.now();
        const r = await page.evaluate(async (a) => {
            try {
                const r = await fetch(a.path, { method: a.body ? 'POST' : 'GET', headers: a.h, credentials: 'include', body: a.body ? JSON.stringify(a.body) : undefined, signal: AbortSignal.timeout(12000) });
                const t = await r.text();
                if (r.status !== 200) return { __err: r.status + ' ' + t.slice(0, 160).replace(/\s+/g, ' ') };
                try { return JSON.parse(t); } catch { return { __err: '200 이지만 JSON 아님: ' + t.slice(0, 60) }; }
            } catch (e) { return { __err: 'ex ' + String(e).slice(0, 60) }; }
        }, { path, body, h: h0.h }).catch((e) => ({ __err: 'evaluate ' + String(e.message).slice(0, 80) }));
        r.__ms = Date.now() - t0; return r;
    };
    const TS = '/analytics/api/v1/data/timeseries', SL = '/analytics/api/v1/data/sources/list', DM = '/analytics/api/v1/data/app/detail/measures', DD = '/analytics/api/v1/data/app/detail/dimensions';
    const utc = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
    const days = []; for (let n = DAYS - 1; n >= 0; n--) days.push(utc(n));
    const rng = (a, b) => ({ frequency: 'day', startTime: utc(a) + 'T00:00:00Z', endTime: utc(b) + 'T00:00:00Z' });
    const R30 = rng(DAYS - 1, 0);
    R.days = days; R.today = days[days.length - 1];

    // 묶음 실행: 동시에 5개씩, 실패는 한 번 더(순차) — 이름 붙은 작업 목록 {name: () => api(...)}
    const runAll = async (jobs) => {
        const names = Object.keys(jobs), res = {};
        for (let i = 0; i < names.length; i += 5) {
            const part = names.slice(i, i + 5);
            const vs = await Promise.all(part.map((n) => jobs[n]()));
            part.forEach((n, k) => { res[n] = vs[k]; });
        }
        for (const n of names) if (res[n].__err && !/^4\d\d/.test(res[n].__err)) { const v = await jobs[n](); if (!v.__err) res[n] = v; }   // 4xx 는 다시 해도 같다
        for (const n of names) if (res[n].__err) R.fails.push(n + ': ' + res[n].__err.slice(0, 120));
        return res;
    };
    // 시계열 그룹 결과 → [{key,title,tot,v:[일별(days 순서)]}]
    const align = (g, m) => { const map = {}; (g.data || []).forEach((x) => { map[String(x.date || '').slice(0, 10)] = Number(x[m]) || 0; }); return days.map((d) => map[d] || 0); };
    const grp = (v, m) => (v.__err ? null : (v.results || []).map((g) => { const vals = align(g, m); return { key: g.group && g.group.key != null ? String(g.group.key) : '', title: g.group && g.group.title ? String(g.group.title) : '', tot: vals.reduce((a, b) => a + b, 0), v: vals }; }));
    const grpLive = (a) => (a ? a.filter((x) => x.tot > 0) : a);
    const G = (m, dim, extra = {}, limit = 12) => () => api(TS, { adamId: [APP_ID], measures: [m], ...R30, ...extra, group: { metric: m, dimension: dim, rank: 'DESCENDING', limit } });
    const F = (k, ...o) => ({ dimensionFilters: [{ dimensionKey: k, optionKeys: o }] });

    log('판독 시작(30일 · UTC ' + days[0] + '~' + days[days.length - 1] + ')');
    const A = await runAll({
        tot_units: () => api(TS, { adamId: [APP_ID], measures: ['units'], ...R30 }),
        tot_total: () => api(TS, { adamId: [APP_ID], measures: ['totalDownloads'], ...R30 }),
        tot_pv: () => api(TS, { adamId: [APP_ID], measures: ['pageViewUnique'], ...R30 }),
        src_units: G('units', 'source'), src_pv: G('pageViewUnique', 'source'), src_impr: G('impressionsTotalUnique', 'source'),
        store_units: G('units', 'storefront', {}, 200), store_pv: G('pageViewUnique', 'storefront', {}, 200),
        plat_units: G('units', 'platform', {}, 6),
        kr_src: G('units', 'source', F('storefront', '143466')), jp_src: G('units', 'source', F('storefront', '143462')), us_src: G('units', 'source', F('storefront', '143441')),
        web_store: G('units', 'storefront', F('source', 'WebRef'), 200),
        camp_units: G('units', 'campaignId'), camp_pv: G('pageViewUnique', 'campaignId'), camp_impr: G('impressionsTotal', 'campaignId'),
    });
    const series = (v, m) => (v.__err || !v.results || !v.results[0]) ? null : align(v.results[0], m);
    R.total = { units: series(A.tot_units, 'units'), totalDownloads: series(A.tot_total, 'totalDownloads'), pageViewUnique: series(A.tot_pv, 'pageViewUnique') };
    R.bySource = { units: grp(A.src_units, 'units'), pageViewUnique: grp(A.src_pv, 'pageViewUnique'), impressions: grp(A.src_impr, 'impressionsTotalUnique') };
    R.byStore = { units: grpLive(grp(A.store_units, 'units')), pageViewUnique: grpLive(grp(A.store_pv, 'pageViewUnique')) };
    R.byPlatform = grpLive(grp(A.plat_units, 'units'));
    R.byCountrySource = { KR: grp(A.kr_src, 'units'), JP: grp(A.jp_src, 'units'), US: grp(A.us_src, 'units') };
    R.webRefByStore = grpLive(grp(A.web_store, 'units'));
    R.campaigns = { units: grpLive(grp(A.camp_units, 'units')), pageViewUnique: grpLive(grp(A.camp_pv, 'pageViewUnique')), impressions: grpLive(grp(A.camp_impr, 'impressionsTotal')) };
    // 집계된 마지막 날(오늘 UTC 제외) — 소스별 노출·조회·첫 다운로드 합 중 하나라도 >0
    const lastIdx = (() => {
        const sumAt = (i) => ['units', 'pageViewUnique', 'impressions'].reduce((a, k) => a + ((R.bySource[k] || []).reduce((b, g) => b + (g.v[i] || 0), 0)), 0);
        for (let i = days.length - 2; i >= 0; i--) if (sumAt(i) > 0) return i;
        return -1;
    })();
    R.latestDay = lastIdx >= 0 ? days[lastIdx] : null;
    R.yesterdayUtc = days[days.length - 2];
    R.sourceOk = !!(R.bySource.units && R.bySource.pageViewUnique && R.total.units);
    log('소스 읽음 ok=' + R.sourceOk + ' · 집계된 마지막 날(UTC) ' + R.latestDay);

    // ── 3. 추천 도메인·앱·캠페인 목록 / 오퍼 시작 / CPP / PPO ──────────────────────────────
    const lmeasures = ['impressionsTotal', 'totalDownloads', 'proceeds', 'sessions'];
    const B = await runAll({
        dom30: () => api(SL, { adamId: [APP_ID], measures: lmeasures, dimension: 'domainReferrer', ...R30, limit: 25 }),
        dom3: () => api(SL, { adamId: [APP_ID], measures: lmeasures, dimension: 'domainReferrer', ...rng(3, 0), limit: 25 }),
        app30: () => api(SL, { adamId: [APP_ID], measures: lmeasures, dimension: 'appReferrer', ...R30, limit: 25 }),
        camp30: () => api(SL, { adamId: [APP_ID], measures: lmeasures, dimension: 'campaignId', ...R30, limit: 25 }),
        offer_day: () => api(DM, { adamId: [APP_ID], ...R30, measures: ['subscription-events-offerStarts'], dimensionFilters: [] }),
        offer_id: () => api(DD, { adamId: [APP_ID], measure: 'subscription-events-offerStarts', dimensions: ['offerId'], dimensionFilters: [], ...R30, limit: 10, hideEmptyValues: true }),
        offer_store: () => api(DD, { adamId: [APP_ID], measure: 'subscription-events-offerStarts', dimensions: ['storefront'], dimensionFilters: [], ...R30, limit: 10, hideEmptyValues: true }),
        offer_src: () => api(DD, { adamId: [APP_ID], measure: 'subscription-events-offerStarts', dimensions: ['source'], dimensionFilters: [], ...R30, limit: 10, hideEmptyValues: true }),
        cpp_list: () => api('/analytics/api/v1/app-info/' + APP_ID + '/cpp'),
        ab_list: () => api('/analytics/api/v1/app-info/' + APP_ID + '/ab-tests'),
    });
    const lst = (v) => v.__err ? { error: v.__err.slice(0, 120) } : { meetsThreshold: v.meetsThreshold !== false && (v.results || []).length > 0, rows: (v.results || []).map((r) => ({ key: r.campaignId || r.domainReferrer || r.appReferrer || r.domain || r.key || '', impressions: r.data && r.data.impressionsTotal ? r.data.impressionsTotal.value : null, downloads: r.data && r.data.totalDownloads ? r.data.totalDownloads.value : null, sessions: r.data && r.data.sessions ? r.data.sessions.value : null })) };
    R.domainReferrer = { d30: lst(B.dom30), d3: lst(B.dom3) };
    R.appReferrer = lst(B.app30);
    R.campaignList = lst(B.camp30);
    const od = B.offer_day.__err ? null : (B.offer_day.results || [])[0];
    const offerDaily = days.map((d) => {
        const x = od && (od.data || []).find((y) => String(y.date).slice(0, 10) === d);
        const value = x && (typeof x.value === 'number' || typeof x.value === 'string' && /^\d+$/.test(x.value)) ? Number(x.value) : null;
        return od && od.meetsThreshold !== false && Number.isSafeInteger(value) && value >= 0 ? value : null;
    });
    R.offers = od ? {
        total: od.total, meetsThreshold: od.meetsThreshold !== false,
        daily: offerDaily, dailyObserved: offerDaily.map((v) => v !== null),
        byOffer: B.offer_id.__err ? null : ((B.offer_id.results || [])[0] || { data: [] }).data.map((x) => ({ key: String(x.key), value: x.value })),
        byStore: B.offer_store.__err ? null : ((B.offer_store.results || [])[0] || { data: [] }).data.map((x) => ({ key: String(x.key), value: x.value })),
        bySource: B.offer_src.__err ? null : ((B.offer_src.results || [])[0] || { data: [] }).data.map((x) => ({ key: String(x.key), value: x.value })),
    } : { error: B.offer_day.__err ? B.offer_day.__err.slice(0, 120) : '결과 없음' };

    // CPP — 목록 + 30일 조회·다운로드·전환(5명 미만이면 meetsThreshold=false → 0 이 아니라 «안 보임»)
    const cpps = B.cpp_list.__err ? [] : (B.cpp_list.results || []);
    const cppJobs = {}; cpps.forEach((c) => { cppJobs[c.id] = () => api(DM, { adamId: [APP_ID], ...R30, measures: ['pageViewCount', 'totalDownloads', 'conversionRate'], dimensionFilters: [{ dimensionKey: 'productPage', optionKeys: [c.id] }] }); });
    const C = await runAll(cppJobs);
    R.cpp = cpps.map((c) => {
        const v = C[c.id] || { __err: 'no result' }; const get = (m) => (v.__err ? null : (v.results || []).find((x) => x.measure === m) || null);
        const pv = get('pageViewCount'), dl = get('totalDownloads'), cr = get('conversionRate');
        return { id: c.id, name: c.name, active: c.active !== false, error: v.__err ? v.__err.slice(0, 100) : null, meetsThreshold: !!(pv && pv.meetsThreshold), pageViews: pv ? pv.total : null, downloads: dl ? dl.total : null, conversion: cr ? cr.total : null };
    });
    // PPO — 테스트 목록 + 각 테스트 결과(원래 vs 변형: 노출·전환·향상·신뢰도·판정)
    const tests = B.ab_list.__err ? [] : (B.ab_list.results || []);
    const abJobs = {}; tests.forEach((t) => { abJobs[t.testId] = () => api('/analytics/api/v1/ab-tests/' + t.testId + '?baseline=default'); });
    const P = await runAll(abJobs);
    R.ppo = tests.map((t) => {
        const v = P[t.testId] || { __err: 'no result'};
        return { id: t.testId, name: t.testName, status: t.status, start: String(t.startDate || '').slice(0, 10), end: String(t.endDate || '').slice(0, 10), error: v.__err ? v.__err.slice(0, 100) : null,
            treatments: v.__err ? [] : (v.treatments || []).map((x) => ({ id: x.id, name: x.name, impressions: x.uniqueImpressions, conv: x.conversionRate ? x.conversionRate.central : null, convLo: x.conversionRate ? x.conversionRate.lower : null, convHi: x.conversionRate ? x.conversionRate.upper : null,
                improvement: x.improvement ? x.improvement.central : null, confidence: x.confidence, outcome: x.outcome })) };
    });

    R.ok = R.sourceOk;
    if (!R.ok) R.error = 'SOURCE_EMPTY — 소스별 시계열을 못 읽었다: ' + R.fails.filter((f) => /^(tot_|src_)/.test(f)).join(' | ').slice(0, 200);
    log('끝 ok=' + R.ok + ' · 실패 호출 ' + R.fails.length + '건' + (R.fails.length ? ' → ' + R.fails.slice(0, 3).join(' | ') : ''));
} catch (e) { R.error = 'EXCEPTION ' + String(e && e.message || e).slice(0, 200); log('오류', R.error); }
await closePage();
out(R);
