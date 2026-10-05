/* 지식iN — 답변 0건 질문을 찾는다(선점 = 영구 1등). 읽기 전용(검색 목록만 읽는다 — 클릭·글쓰기 없음).
 * 실행: bash scripts/ego-run.sh scripts/ego/kin-find.mjs 200   (선택 작업 파일: ~/signum-ego-io/<KST>/kin-task.json)
 *   {"queries":["검색어",…], "maxAns":0, "thin":1}   · queries 를 주면 그 질의만 돈다 · maxAns = 후보 기준(기본 0) · thin = «얇은 문» 참고 기준(기본 1)
 * ★2026-10-05 20시 회차: 옛 코드는 질의를 `process.env.Q` 로 받았는데 ego 스크립트엔 셸 환경변수가 가지 않는다(memory ego-scripts-ignore-shell-env)
 *   → 덮어쓰기가 한 번도 안 먹어 10/4·10/5 재스캔이 늘 «이미 답변 5~9개로 찬 일반어 4개»만 읽었다(후보 0 반복 = naver_kin 이 «실행»에 남는 한 갈래).
 *   그래서 ① 질의·한도를 작업 파일로 받고 ② 기본 질의에 «우리 앱만 답할 수 있는 좁은 말»(맥스페인·감마·풋콜)을 더하고
 *   ③ 답변 수 분포를 찍어 «없음»(분포에 0 이 없다)과 «못 읽음»(null·결과 0)을 가른다. */
import fs from 'node:fs';
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY'); process.exit(0); }
const page = await L.findPage(ts, /kin\.naver\.com/);
const BASE = ['미국주식 앱', '프리마켓', '미국주식 실적발표', '나스닥 지수 보는법'];
const NICHE = ['옵션 맥스페인', '감마 익스포저', '옵션 만기일 주가', '풋콜 비율', '미국주식 시세 앱 추천', '서학개미 앱'];
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(await L.taskPath('kin-task.json'), 'utf8')); } catch { /* 작업 파일 없음 = 기본 */ }
const queries = Array.isArray(cfg.queries) && cfg.queries.length ? cfg.queries : BASE.concat(NICHE);
const maxAns = Number.isFinite(cfg.maxAns) ? cfg.maxAns : 0;
const thin = Number.isFinite(cfg.thin) ? cfg.thin : 1;
console.log(`질의 ${queries.length}개 · 후보 기준 답변 ≤${maxAns} · 얇은 문(참고) ≤${thin} · 작업 파일 ${Array.isArray(cfg.queries) ? '사용' : '없음(기본)'}`);
const out = [], dist = {};
let unread = 0, emptyQ = 0, sideTotal = 0;
for (const q of queries) {
  await page.goto('https://kin.naver.com/search/list.naver?query=' + encodeURIComponent(q) + '&sort=date'); await L.wait(5000);
  const res = await page.evaluate(() => {
    const all = [...document.querySelectorAll('li')].map(li => {
      const a = li.querySelector('a[href*="detail.naver"]'); if (!a) return null;
      const t = (li.innerText || '').replace(/\s+/g, ' ').trim();
      // ★2026-10-04 17시: 결과 줄이 «답변수 4 UP 0 | 답변 <작성자>» 로 바뀌어 옛 정규식(/답변\s*(\d+)/)이 전부 null 을 돌려줬다(후보=0 이 «없음»이 아니라 «못 읽음» — 17:11 DOM 덤프로 확인). «답변수 N» 을 먼저 본다.
      const ans = (t.match(/답변수\s*(\d+)/) || t.match(/답변\s*(\d+)/) || [])[1];
      // ★2026-10-05 20시: 검색 결과 줄은 «등록 날짜(2026.10.05.)» 를 갖고, 사이드바 «오늘의 인기 질문»(파란장미 꽃말 등 무관한 5개·날짜 없음)은 안 갖는다 → 날짜로 가른다(사이드바가 «못 읽음 23» 으로 잡혔다).
      const dt = (t.match(/\d{4}\.\d{2}\.\d{2}/) || [])[0] || null;
      return { t: t.slice(0, 70), href: a.getAttribute('href'), ans: ans == null ? null : Number(ans), dt };
    }).filter(Boolean);
    return { rows: all.filter(r => r.dt).slice(0, 12), side: all.filter(r => !r.dt).length };
  });
  const rows = res.rows; sideTotal += res.side;
  if (!rows.length) emptyQ++;
  for (const r of rows) { if (r.ans == null) unread++; else { const k = r.ans >= 3 ? '3+' : String(r.ans); dist[k] = (dist[k] || 0) + 1; } }
  const hit = rows.filter(r => r.ans != null && r.ans <= maxAns);
  const thinRows = rows.filter(r => r.ans != null && r.ans > maxAns && r.ans <= thin);
  console.log(`[${q}] 결과 ${rows.length} · 답변≤${maxAns} ${hit.length}` + (thinRows.length ? ` · 얇은(≤${thin}) ${thinRows.length}` : ''));
  for (const r of hit.slice(0, 3)) { console.log('   후보: ' + r.ans + '답변 ' + r.t + ' | ' + (r.href || '').slice(0, 80)); out.push({ q, ...r }); }
  for (const r of thinRows.slice(0, 2)) console.log('   얇은: ' + r.ans + '답변 ' + r.t + ' | ' + (r.href || '').slice(0, 80));
  if (!hit.length && !thinRows.length && rows.length) console.log('   (최신 3건) ' + rows.slice(0, 3).map(r => `${r.ans}답변 ${r.t.slice(0, 34)}`).join(' / '));
}
console.log('답변 수 분포(질문 수) ' + JSON.stringify(dist) + ' · 못 읽음 ' + unread + ' · 사이드바(무시) ' + sideTotal + ' · 결과 0 인 질의 ' + emptyQ + '/' + queries.length
  + (unread || emptyQ === queries.length ? '  ⚠ 못 읽음 있음 — «후보 0» 을 «없음»으로 적지 않는다' : '  (못 읽음 0 → 후보 0 은 «없음»)'));
console.log('후보=' + out.length);
