/* ============================================================================
 * x-find-reply — x_reply 대상 찾기(팔로워 18만 이상 금융 대형 계정의 «최근 글»). 2026-10-04 21시 회차 신설 · 읽기 전용(클릭·입력·쓰기 없음).
 * 왜: x_reply 는 «큰 계정 최근 글을 훑는 일»이 매번 즉석 스캔(9/26 «큰 계정 최근 6시간 스캔»)이라 도구가 없었다 — 비로그인 syndication 타임라인은 429 로
 *   막혀 있고(10/4 21시 실측 4계정 전부 429), 로그인된 ego 프로필 화면 DOM 만 된다. MISTAKES #39·#49(반복 일은 첫 반복에 도구로).
 * 방법: 로그인된 x.com 의 계정 프로필을 차례로 열어 DOM 만 읽는다(프로필 머리의 팔로워 수 + 글 article 의 시각·본문·답글 수·고정/리포스트 표시).
 *   · 팔로워 18만 미만이면 후보에서 뺀다(x-reply.mjs 도 같은 이유로 거부 — memory x-reply-ranking-needs-180k-follower-root).
 *   · 고정 글·리포스트·광고·우리 계정 글·나이 maxAgeH(기본 10시간) 초과 글은 뺀다. 답글이 너무 많은 글(maxReplies, 기본 400)은 «묻힌다» 표시.
 *   · 답글 제한 글(답글 칸 없음)은 타임라인에서 알 수 없다 — x-reply.mjs 가 «답글 칸이 없다»로 거부하니 그때 다음 후보로 간다.
 * 사용: bash scripts/ego-run.sh scripts/x-find-reply.mjs 240   → ~/signum-ego-io/<KST 날짜>/x-find-reply.json
 *   선택 작업 파일 ~/signum-ego-io/<KST>/x-find-reply-task.json = {"handles":["Barchart","CNBC"],"maxAgeH":10,"maxReplies":400} (30분 안 것만)
 * 출력: 계정별 «팔로워 · 읽은 글 수 · 최신 글 나이» + 후보 표 «나이h | 답글 | 계정 | status 경로 | 본문 첫 줄» (새 글 순)
 * 다음: 후보를 골라 «그 글 내용에 맞는 검증된 데이터 한 줄»을 쓰고 x-reply.mjs(작업 파일 xr-task.json) — 숫자는 원천 조회 뒤에만(MISTAKES #5·#36).
 * ========================================================================== */
process.on('unhandledRejection', (e) => console.log('(무시)', String((e && e.message) || e).slice(0, 80)));
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fsx = (await import('node:fs')).default;
const OUT = L.ioDir() + '/x-find-reply.json';
const T0 = Date.now(); const BUDGET = 200e3;   // 계정당 약 5.4초 — 23개면 125초 안팎
// 시장 전문 계정을 앞에, 일반 뉴스 매체를 뒤에(시간 상한에 걸리면 뒤쪽이 잘린다) · @markets(블룸버그 마켓)는 최신 글이 82일 전(1969h)인 휴면이라 뺐다(10/4 21시 실측)
let HANDLES = ['StockMKTNewz', 'KobeissiLetter', 'Barchart', 'unusual_whales', 'zerohedge', 'DeItaone', 'LiveSquawk', 'financialjuice', 'Schuldensuehner',
  'TheStalwart', 'jimcramer', 'charliebilello', 'LizAnnSonders', 'elerianm', 'RyanDetrick', 'bespokeinvest', 'CNBC', 'business', 'WSJmarkets', 'Reuters', 'FT', 'MarketWatch', 'YahooFinance'];
let MAX_AGE_H = 10; let MAX_REPLIES = 400;
try { const tp = L.ioDir() + '/x-find-reply-task.json';
  if (fsx.existsSync(tp) && Date.now() - fsx.statSync(tp).mtimeMs < 30 * 60e3) {
    const t = JSON.parse(fsx.readFileSync(tp, 'utf8'));
    // ★2026-10-05 07시: 일본어 x_reply_jp 는 회차마다 «핸들을 짐작해 작업 파일에 적었다» — 10/5 06~07시에 짐작한 Reuters_co_jp(팔로워 767 = 틀린 계정)·wbs_tvtokyo(최신 글 35시간 전)·
    //   @cissan_9984(최신 글 639시간 전 = 휴면)를 헛읽었다(MISTAKES #65 — 외부 식별자 목록은 살아 있는지 매번 출력하고 목록을 고친다). 07시 실측(팔로워·최신 글 나이)으로 검증된 풀을 도구에 넣는다:
    //   시장 전문 개인(@goto_finance 81.7만·@buffett_taro 36.3만·@tesuta001 120만) → 시장 매체(@kabutan_jp 19.1만·@BloombergJapan·@nikkei·@WSJJapan·@jijicom·@ToyoKeizai·@newspicks 18.2만 — 18만 턱걸이).
    //   작업 파일 {"preset":"jp"} 한 줄이면 된다(handles 가 같이 있으면 handles 가 이긴다).
    if (t.preset === 'jp') HANDLES = ['goto_finance', 'buffett_taro', 'kabutan_jp', 'BloombergJapan', 'nikkei', 'WSJJapan', 'jijicom', 'ToyoKeizai', 'newspicks', 'tesuta001'];
    if (Array.isArray(t.handles) && t.handles.length) HANDLES = t.handles.slice(0, 30);
    if (Number(t.maxAgeH) > 0) MAX_AGE_H = Number(t.maxAgeH);
    if (Number(t.maxReplies) > 0) MAX_REPLIES = Number(t.maxReplies);
  } } catch {}
// ★«시장 관련» 표시 — 일요일 아침(10/4)엔 대형 계정 글 31건 중 시장·거시는 1/3 뿐이었다(문화·정치·소송). 표시된 것을 먼저 보여 준다(데이터 답글은 시장 글에만 의미가 있다).
const MARKET = /\b(stocks?|equit(?:y|ies)|s&p|nasdaq|dow|index|indices|yields?|treasur(?:y|ies)|bonds?|gilts?|bunds?|rates?|fed|fomc|powell|inflation|cpi|ppi|payrolls?|jobs report|unemployment|gdp|ism|pmi|earnings|guidance|ipo|oil|crude|opec\+?|brent|wti|gold (?:prices?|futures|rally|hits?|rises?|falls?)|copper|dollar index|dxy|yen|euro|tariffs?|etfs?|inflows?|outflows?|options?|volatility|vix|rally|sell-?off|slump|plunge|markets?|shares|investors?|traders?|credit|debt|deficit|recession|mag ?7|magnificent)\b|\$[A-Z]{1,5}\b/i;
// ★2026-10-05 06시: 일본 매체(@BloombergJapan·@nikkei 등)를 읽을 때 «시장 관련 ★»이 영어 정규식 하나뿐이라 일본어 시장 글(「ウォール街のAI熱狂、金利急騰が…」「長期金利は3％超え」)이 ★ 없이 38건 사이에 묻혔다 → 일본어 단어를 따로 둔다(표시만 — 고르는 건 사람). 일본어는 \b 가 없어 단어 목록으로.
const MARKET_JA = /(米国株|米株|ウォール街|ナスダック|ダウ平均|NYダウ|S&P|日経平均|株価|株式市場|株式相場|株安|株高|相場|金利|利回り|国債|債券|FRB|FOMC|利下げ|利上げ|インフレ|物価|雇用統計|決算|原油|円相場|為替|半導体|最高値|オプション|ETF|NISA|増資|売り出し)/;
// ★이미 답한 루트 글(발행기 x-reply.mjs 가 성공·시도마다 한 줄씩 남긴다) — 같은 글에 두 번 달지 않는다(MISTAKES #52 «같은 글의 중복은 반복 게시»)
const DONE = new Set();
try { const f = L.ioDir().replace(/\/[^/]+$/, '') + '/x-reply-roots.jsonl';
  if (fsx.existsSync(f)) for (const ln of fsx.readFileSync(f, 'utf8').split('\n')) { if (!ln.trim()) continue; try { DONE.add(JSON.parse(ln).root); } catch {} } } catch {}
const out = []; const accounts = [];
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts = null; try { ts = await L.takeSpaceOrExit(sp.id); } catch { console.log('USER_CONTROL'); }
if (ts) {
  await L.cleanupPages(ts, 2);
  const page = await L.findPage(ts, /x\.com/, null);
  await L.trapDialogs(page);
  for (const h of HANDLES) {
    if (Date.now() - T0 > BUDGET) { console.log('마감 — 남은 계정 건너뜀:', h); break; }
    try {
      try { await page.goto('https://x.com/' + h, { waitUntil: 'domcontentloaded' }); } catch {}
      await L.wait(5200);
      const r = await page.evaluate((hh) => {
        const body = (document.body.innerText || '').replace(/\s+/g, ' ');
        const m = body.match(/([\d.,]+)\s*([KM]?)\s*Followers/i);
        let fl = null; if (m) { const v = parseFloat(m[1].replace(/,/g, '')); fl = Math.round(v * (m[2].toUpperCase() === 'M' ? 1e6 : m[2].toUpperCase() === 'K' ? 1e3 : 1)); }
        const rows = [];
        for (const a of document.querySelectorAll('article')) {
          const tm = a.querySelector('time'); if (!tm) continue;
          const link = tm.closest('a'); const href = link ? link.getAttribute('href') : null; if (!href) continue;
          const own = new RegExp('^/' + hh + '/status/\\d+$', 'i').test(href); // 리포스트·인용 제외(작성자가 다른 글)
          const ctx = (a.querySelector('[data-testid="socialContext"]') || {}).innerText || '';
          const txtEl = a.querySelector('[data-testid="tweetText"]');
          const rep = a.querySelector('[data-testid="reply"]');
          const rl = rep ? (rep.getAttribute('aria-label') || '') : '';
          const rm = rl.match(/([\d.,]+)\s*([KM]?)\s*repl/i);
          const replies = rm ? Math.round(parseFloat(rm[1].replace(/,/g, '')) * (rm[2].toUpperCase() === 'M' ? 1e6 : rm[2].toUpperCase() === 'K' ? 1e3 : 1)) : (rep ? 0 : null);
          rows.push({ href, own, ctx: String(ctx).replace(/\s+/g, ' ').trim().slice(0, 40), at: tm.getAttribute('datetime'), replies, ad: /Ad\b|Promoted/.test((a.innerText || '').slice(-80)), txt: txtEl ? txtEl.innerText.replace(/\s+/g, ' ').slice(0, 260) : '' });
        }
        return { fl, rows };
      }, h);
      const ages = r.rows.filter((x) => x.own && x.at).map((x) => (Date.now() - Date.parse(x.at)) / 36e5).sort((a, b) => a - b);
      accounts.push({ h, followers: r.fl, read: r.rows.length, newestH: ages.length ? +ages[0].toFixed(2) : null });
      console.log(`@${h} 팔로워 ${r.fl == null ? '판독 실패' : r.fl.toLocaleString()} · 읽은 글 ${r.rows.length} · 최신 ${ages.length ? ages[0].toFixed(1) + 'h' : '-'}${r.fl != null && r.fl < 180000 ? ' · ⛔ 18만 미만(제외)' : ''}`);
      if (r.fl == null || r.fl < 180000) continue;
      for (const x of r.rows) {
        if (!x.own || !x.at) continue;
        if (/pinned/i.test(x.ctx) || /repost/i.test(x.ctx) || x.ad) continue;
        const age = (Date.now() - Date.parse(x.at)) / 36e5;
        if (!(age <= MAX_AGE_H)) continue;
        if (DONE.has(x.href)) { console.log('  (이미 답함 — 건너뜀)', x.href); continue; }
        out.push({ h, followers: r.fl, age: +age.toFixed(2), replies: x.replies, buried: x.replies != null && x.replies > MAX_REPLIES, market: MARKET.test(x.txt) || MARKET_JA.test(x.txt), status: x.href, txt: x.txt });
      }
      fsx.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), accounts, out }, null, 1));
    } catch (e) { console.log(h, '오류', String(e && e.message).slice(0, 80)); }
  }
}
fsx.writeFileSync(OUT, JSON.stringify({ at: new Date().toISOString(), accounts, out }, null, 1));
out.sort((a, b) => (b.market - a.market) || (a.age - b.age));   // 시장 관련 먼저, 그 안에서 새 글 순
console.log(`\n후보 ${out.length}건 · 시장 관련 ★ ${out.filter((o) => o.market).length}건 (최근 ${MAX_AGE_H}h · 팔로워 18만 이상 · 고정/리포스트/광고·이미 답한 글 제외) — 계정 ${accounts.length}개 읽음, 읽기 실패·제외 ${accounts.filter((a) => a.followers == null || a.followers < 180000).length}개`);
for (const o of out.slice(0, 40)) console.log(`${o.market ? '★' : ' '} ${o.age}h | 답글 ${o.replies == null ? '?' : o.replies}${o.buried ? '(묻힘)' : ''} | @${o.h} | ${o.status} | ${o.txt.slice(0, 150)}`);
