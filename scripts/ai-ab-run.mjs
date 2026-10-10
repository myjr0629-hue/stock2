#!/usr/bin/env node
/**
 * 사다리 품질 비교 실행기 — 운영이 캡처해 둔 «실제 입력» 을 현행과 Haiku 5.5 로 나란히 돌려 용도별 표를 낸다.
 * (서버 쪽은 /api/admin/ai-ab 이 한다. 이 스크립트는 그 요청을 순서대로 보내고 숫자를 모을 뿐이다.)
 *
 * 사용 (비밀은 환경변수로만 — 인자·파일·로그에 쓰지 않는다):
 *   CRON_SECRET=… node scripts/ai-ab-run.mjs --purposes CrossSector,SectorHeadlines,EarningsBrief,IntelSnapshot,MorningBriefing,FlowAI,GuardianTranslate
 *   옵션  --base https://www.signumhq.com   --effort low|medium|high   --thinking disabled   --max 12 (용도당 최대 입력 수)
 *         --skip-legacy (현행 호출 생략: 프롬프트 변형만 볼 때)   --suffix-file 파일 (Haiku 5.5 system 끝에 덧붙일 지시문)
 *         --max-tokens 8000 (캡처된 상한 대신)
 *   --list 만 주면 용도별로 캡처된 입력 수·언어만 본다.
 *
 * 출력: 용도마다 한 줄 표(쌍 수 · 현행/5.5 가드 통과 · p50/p95 · 출력 토큰 · 호출당 비용) + 가드 실패 사유 + 5.5 응답 잘림/거절 수.
 * AWS 분당 10건 한도 때문에 요청 사이 간격을 둔다(--gap 초, 기본 7). 한 요청은 서버에서 최대 5건(60초 한도 안).
 */
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : def; };
const base = String(opt('base', 'https://www.signumhq.com')).replace(/\/$/, '');
const secret = process.env.CRON_SECRET;
if (!secret) { console.error('CRON_SECRET 환경변수가 필요하다 (운영 Vercel 환경변수 → 임시 파일로 읽고 끝나면 삭제).'); process.exit(2); }
const purposes = String(opt('purposes', '')).split(',').map((s) => s.trim()).filter(Boolean);
const effort = String(opt('effort', 'low'));
const thinking = opt('thinking', undefined);
const maxPer = Number(opt('max', 12));
const gapMs = Number(opt('gap', 7)) * 1000;
const skipLegacy = opt('skip-legacy', false) === true;
const maxTokens = Number(opt('max-tokens', 0)) || undefined;
const suffixFile = opt('suffix-file', undefined);
const suffix = suffixFile && suffixFile !== true ? (await import('node:fs')).readFileSync(suffixFile, 'utf8') : undefined;

const post = async (body) => {
    const r = await fetch(`${base}/api/admin/ai-ab`, { method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    return r.json();
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]; };
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const f1 = (x) => (x == null ? '-' : (Math.round(x * 10) / 10).toString());
const f4 = (x) => (x == null ? '-' : x.toFixed(5));

if (opt('list', false) === true) {
    const all = purposes.length ? purposes : ['FlowAI', 'DeepAnalysis', 'Guardian', 'GuardianTranslate', 'NewsDigest', 'UC', 'UCTranslate', 'WIM', 'Disclosures', 'SectorHeadlines', 'CrossSector', 'EarningsBrief', 'IntelAnalysis', 'IntelSnapshot', 'MorningBriefing', 'TickerNews'];
    for (const p of all) { const r = await post({ purpose: p, list: true }); console.log(p.padEnd(18), String(r.captured).padStart(3), JSON.stringify(r.byLocale), r.newestAt || ''); }
    process.exit(0);
}
if (!purposes.length) { console.error('--purposes 가 필요하다 (또는 --list)'); process.exit(2); }

for (const purpose of purposes) {
    const rows = [];
    let from = 0;
    let captured = 0;
    while (rows.length < maxPer) {
        let r;
        try { r = await post({ purpose, from, count: 3, effort, ...(thinking ? { thinking } : {}), ...(skipLegacy ? { skipLegacy: true } : {}), ...(suffix ? { h55SystemSuffix: suffix } : {}), ...(maxTokens ? { maxTokens } : {}) }); }
        catch (e) { console.error(`  ${purpose} from=${from}: ${e.message}`); break; }
        captured = r.captured;
        rows.push(...r.results);
        if (r.next == null || !r.results.length) break;
        from = r.next;
        await sleep(gapMs);
    }
    if (!rows.length) { console.log(`\n## ${purpose}: 캡처된 입력 ${captured}건 — 비교할 것이 없다 (캡처가 켜져 있었는지, 그 시간에 해당 크론·화면이 돌았는지 확인)`); continue; }
    const both = rows.filter((x) => x.legacy.ok && x.h55.ok);
    const lg = skipLegacy ? rows : both;
    const lPass = lg.filter((x) => x.legacy.gate?.ok).length;
    const hPass = (skipLegacy ? rows.filter((x) => x.h55.ok) : both).filter((x) => x.h55.gate?.ok).length;
    const reasons = (side) => { const m = {}; for (const x of rows) for (const re of (x[side].gate?.reasons || [])) m[re.replace(/[:=].*$/, '')] = (m[re.replace(/[:=].*$/, '')] || 0) + 1; return JSON.stringify(m); };
    const ms = (side) => rows.filter((x) => x[side].ok).map((x) => x[side].ms);
    const out = (side) => rows.filter((x) => x[side].ok).map((x) => x[side].usage?.output || 0);
    const cost = (side) => rows.filter((x) => x[side].ok).map((x) => x[side].costUsd || 0);
    const cut = rows.filter((x) => x.h55.stop === 'max_tokens').length;
    const ref = rows.filter((x) => x.h55.refusal).length;
    console.log(`\n## ${purpose} — 캡처 ${captured}건 중 ${rows.length}건 · 양쪽 응답 ${both.length}쌍 · effort=${effort}${thinking ? ' thinking=' + thinking : ''}${suffix ? ' +suffix' : ''}`);
    console.log(`  가드 통과  현행 ${skipLegacy ? '-' : `${lPass}/${lg.length}`}  |  5.5 ${hPass}/${skipLegacy ? rows.filter((x) => x.h55.ok).length : both.length}`);
    console.log(`  응답 시간  현행 p50 ${f1(pct(ms('legacy'), 0.5) / 1000)}s p95 ${f1(pct(ms('legacy'), 0.95) / 1000)}s  |  5.5 p50 ${f1(pct(ms('h55'), 0.5) / 1000)}s p95 ${f1(pct(ms('h55'), 0.95) / 1000)}s`);
    console.log(`  출력 토큰  현행 ${f1(avg(out('legacy')))}  |  5.5 ${f1(avg(out('h55')))}    호출당 비용  현행 $${f4(avg(cost('legacy')))}  |  5.5 $${f4(avg(cost('h55')))}`);
    console.log(`  실패 사유  현행 ${reasons('legacy')}  |  5.5 ${reasons('h55')}    5.5 잘림 ${cut} · 거절 ${ref}`);
    const errs = rows.filter((x) => !x.legacy.ok && !skipLegacy).map((x) => x.legacy.error).filter(Boolean);
    if (errs.length) console.log(`  현행 호출 오류 ${errs.length}건 예: ${errs[0]}`);
}
