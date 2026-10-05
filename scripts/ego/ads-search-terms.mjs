/* 애플 광고 «검색어(Search Terms)» 판독 — 사람들이 앱스토어 검색창에 «실제로 친» 말 (2026-10-05 16시 회차 신설 · 읽기 전용)
 * 왜: ads-keywords.mjs 는 «우리가 입찰한 키워드» 성과만 읽는다. 일본 캠페인은 확장검색(Search Match)이 노출을 만들어(메모리 asa-broad-match-is-what-serves)
 *     «사람들이 실제로 무엇을 쳐서 탭·설치했는지»는 한 번도 읽은 적이 없다 → 일본어 글 소재·ASO 키워드·광고 키워드 추가(별도 작업)의 근거가 된다.
 * 실행: bash scripts/ego-run.sh scripts/ego/ads-search-terms.mjs 150 → ~/signum-ego-io/<KST>/ads-search-terms-result.json
 *   · 기간은 «화면에 남아 있는 기간»을 읽는다(캠페인 화면에서는 기간 선택기를 못 연다 — ads-keywords.mjs 주석). 그래서 먼저
 *     ads-periods.mjs 로 «최근 30일» 등을 고른 뒤 이 도구를 돌린다. 기간 라벨은 화면에서 읽어 함께 찍는다.
 *   · 다른 캠페인은 작업 파일 ads-search-terms-task.json {"cp":"<캠페인ID>"} (기본 = 실행 중인 일본 캠페인 2144644299)
 * 읽기 전용 — 입찰·예산·키워드·일치 유형은 절대 만지지 않는다. 탭을 못 찾으면 «판독 실패(탭)» + 보이는 항목 이름을 찍는다(0 으로 적지 않는다, MISTAKES #18).
 * 누르는 것은 «검색어» 탭 하나뿐(이동용). 입력·저장·일시정지 버튼은 건드리지 않는다.
 */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
let T = {}; try { T = JSON.parse(fs.readFileSync(await L.taskPath('ads-search-terms-task.json'), 'utf8')); } catch { /* 기본값 */ }
const CP = T.cp || '2144644299';
const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY — 대표가 브라우저를 쓰고 있다. 되찾지 않는다.'); process.exit(0); }
const page = await L.findPage(ts, /app-ads\.apple\.com/);
try { await page.goto(`https://app-ads.apple.com/cm/app/23872040/report/campaign/${CP}`, { waitUntil: 'domcontentloaded', timeout: 60000 }); } catch { /* 느려도 그려진다 */ }
await L.wait(13000);
if (/idmsa|signin/.test(await page.url())) { console.log('SESSION_EXPIRED — 대표 로그인 필요. 판독 실패'); process.exit(0); }

// 화면에 보이는 짧은 항목(탭 후보) — 이름을 모를 때 «눈으로 보는» 대신 찍는다
const shortLabels = () => page.evaluate(() => [...new Set([...document.querySelectorAll('button,a,[role=tab],li,span')]
  .filter((e) => e.offsetParent && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 60)
  .map((e) => (e.innerText || '').replace(/\s+/g, ' ').trim()).filter((t) => t && t.length <= 16))].slice(0, 80));
const tabsBefore = await shortLabels();
console.log('보이는 짧은 항목: ' + JSON.stringify(tabsBefore));

// 기간 라벨(화면에 남아 있는 기간) — 읽을 수 있으면 같이 기록한다
const period = await page.evaluate(() => {
  const t = (document.body.innerText || '');
  const m = t.match(/(오늘|어제|최근 7일|지난주|최근 30일|최근 4주|최근 12주|당월|전월|최근 3개월)[^\n]{0,40}/);
  return m ? m[0].replace(/\s+/g, ' ').trim() : null;
});
console.log('화면 기간 표시(추정): ' + JSON.stringify(period));

// ★10/5 15시 첫 실행 실측: «검색어» 탭은 캠페인 화면이 아니라 «광고 그룹» 화면 안에 있다(캠페인 화면 = 광고 그룹 표: JP-Core-Exact·JP-Intent-Broad).
//   광고 그룹 이름 링크를 «눌러서» 들어간다(이동만 — 주소 직타 금지). 기본 JP-Core-Exact, 다른 그룹은 작업 파일 {"group":"JP-Intent-Broad"}.
const GROUP = T.group || 'JP-Core-Exact';
const gclick = await L.clickText(page, new RegExp('^' + GROUP.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'), { deep: true, after: 11000 });
console.log('광고 그룹 «' + GROUP + '» 열기: ' + JSON.stringify(gclick));
if (gclick) console.log('광고 그룹 화면의 짧은 항목: ' + JSON.stringify(await shortLabels()));
const clicked = gclick ? await L.clickText(page, /^(검색어|검색 용어|검색어 보고서|검색 키워드)$/, { deep: true, after: 10000 }) : null;
console.log('검색어 탭 클릭: ' + JSON.stringify(clicked));
const out = { at: new Date().toISOString(), cp: CP, group: GROUP, period, tabsBefore, clicked: !!clicked };
if (!clicked) {
  console.log('⚠ 판독 실패(탭) — «검색어» 탭 이름을 못 찾았다. 위 «보이는 짧은 항목» 에서 실제 이름을 확인해 정규식을 고친다(0 으로 적지 않는다).');
  fs.writeFileSync(await L.taskPath('ads-search-terms-result.json'), JSON.stringify(out, null, 1)); process.exit(0);
}
const body = await page.evaluate(() => (document.body.innerText || ''));
const i = Math.max(0, body.indexOf('검색어'));
const seg = body.slice(i, i + 9000).replace(/\n+/g, ' | ');
out.tabsAfter = await shortLabels();
out.seg = seg.slice(0, 9000);
console.log('--- 원문(앞 2200자) ---\n' + seg.slice(0, 2200));
// 행 추출 — 셀 단위(10/5 15시 실측 구조): «검색어 | 출처(키워드|Search Match) | [키워드] | 입찰 | 지출 | CPA | CPT | 노출 | 탭 | 설치 | …»
//   출처가 «Search Match» 인 행은 키워드 칸이 없다. 정규식은 열이 어긋나(탭·설치 열을 잘못 잡음) 버렸다.
//   검증(MISTAKES #96): 행 합계를 광고 그룹 화면의 합계와 대조해 «같은지» 출력한다(첫 실행 JP-Core-Exact 30일: 지출 $123.34·노출 4,939·탭 63·설치 7 = 그룹 $123.35·4,938·63·7).
const cells = seg.split(' | ');
const money = (x) => (/^\$[\d.,]+$/.test(x || '') ? Number(x.replace(/[$,]/g, '')) : null);
const int = (x) => (/^[\d,]+$/.test(x || '') ? Number(x.replace(/,/g, '')) : null);
const rows = [];
for (let i = 1; i < cells.length; i++) {
  if (cells[i] !== '키워드' && cells[i] !== 'Search Match') continue;
  let j = i + 1; const kw = cells[i] === '키워드' ? cells[j++] : null;
  const [bid, spend, cpa, cpt] = [0, 1, 2, 3].map((k) => money(cells[j + k]));
  const [impr, taps, inst] = [4, 5, 6].map((k) => int(cells[j + k]));
  if ([bid, spend, impr, taps, inst].some((v) => v === null)) { out.parseSkips = (out.parseSkips || 0) + 1; continue; }
  rows.push({ term: cells[i - 1], src: cells[i], kw, bid, spend, impr, taps, inst });
}
out.rows = rows;
const sum = (rs, k) => Math.round(rs.reduce((t, r) => t + r[k], 0) * 100) / 100;
const HID = '(Low volume terms)';
const hid = rows.filter((r) => r.term === HID), named = rows.filter((r) => r.term !== HID);
console.log(`\n검색어 행 ${rows.length}개${out.parseSkips ? ' (파싱 실패 ' + out.parseSkips + ')' : ''} · 합계 지출 $${sum(rows, 'spend')} · 노출 ${sum(rows, 'impr')} · 탭 ${sum(rows, 'taps')} · 설치 ${sum(rows, 'inst')}  ← 광고 그룹 화면 합계와 대조할 것`);
console.log(`가려진 «${HID}» ${hid.length}행 = 지출 $${sum(hid, 'spend')}(${rows.length ? Math.round(100 * sum(hid, 'spend') / Math.max(0.01, sum(rows, 'spend'))) : 0}%) · 설치 ${sum(hid, 'inst')}  |  이름이 보이는 ${named.length}행 = 지출 $${sum(named, 'spend')} · 노출 ${sum(named, 'impr')} · 탭 ${sum(named, 'taps')} · 설치 ${sum(named, 'inst')}`);
for (const sname of ['키워드', 'Search Match']) { const rs = rows.filter((r) => r.src === sname); console.log(`  출처 ${sname}: ${rs.length}행 · 지출 $${sum(rs, 'spend')} · 노출 ${sum(rs, 'impr')} · 탭 ${sum(rs, 'taps')} · 설치 ${sum(rs, 'inst')}`); }
console.log('이름이 보이는 검색어(지출·노출순):');
for (const r of named.sort((a, b) => b.spend - a.spend || b.impr - a.impr).slice(0, 25))
  console.log(`  ${r.term.padEnd(20)} ${r.src.padEnd(13)} ${String(r.kw || '-').padEnd(10)} 지출 $${String(r.spend).padEnd(6)} 노출 ${String(r.impr).padEnd(5)} 탭 ${String(r.taps).padEnd(3)} 설치 ${r.inst}`);
fs.writeFileSync(await L.taskPath('ads-search-terms-result.json'), JSON.stringify(out, null, 1));
console.log('저장: ' + await L.taskPath('ads-search-terms-result.json'));
