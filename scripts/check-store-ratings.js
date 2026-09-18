#!/usr/bin/env node
/**
 * Play 스토어 별점·리뷰·다운로드를 «브라우저 없이» 읽는다.
 *
 * 왜: 2026-09-19 실측으로 확정한 병목이 «별점 0» 이다.
 *   Play 노출 2,190 → 등록정보 열람 약 11(0.5%) → 열면 61% 설치.
 *   붐비는 결과 줄에서 별 없는 앱은 건너뛰어진다(애플광고 US 도 노출 138에 탭 0).
 *   2026-09-19 배포한 리뷰 요청 수정(사용일 2·7일 + 앱 실행 4회째, 하루 1회)이 이 숫자를 움직이는 레버다.
 *   **이 스크립트의 출력이 그 수정의 성적표다.**
 *
 * 왜 브라우저가 아닌가: 대표가 taskspace 를 잡으면 브라우저 검증이 통째로 멈춘다(2026-09-19 실제로 멈췄다).
 *   가장 중요한 지표를 그 의존에 묶어 두지 않는다. Play 상세 페이지는 curl 로 읽힌다.
 *
 *   node scripts/check-store-ratings.js          # 표
 *   node scripts/check-store-ratings.js --json   # 기계용
 * 종료코드 0 = 정상 · 1 = 세 앱 모두 별점 0 (아직 고리가 안 풀렸다는 신호)
 */
const APPS = [
  ['SIGNUM HQ', 'com.signumhq.app'],
  ['Undercurrent', 'com.signumhq.undercurrent'],
  ["Why'd It Move?", 'com.signumhq.wim'],
];
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const asJson = process.argv.includes('--json');

// Play 상세 페이지의 통계는 <div class="ClM7O">값</div><div class="g1rdde">라벨</div> 쌍이다.
// 별점이 생기면 같은 자리에 «4.5» / «star» 쌍이 늘어난다 — 라벨을 열쇠로 쓴다.
const STAT = /<div class="ClM7O">([^<]{1,20})<\/div><div class="g1rdde">([^<]{1,30})<\/div>/g;

async function one(name, id) {
  const url = `https://play.google.com/store/apps/details?id=${id}&hl=en&gl=US`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } });
    if (!r.ok) return { name, id, error: `HTTP ${r.status}` };
    const html = await r.text();
    if (html.length < 50000) return { name, id, error: `본문이 너무 짧다(${html.length}) — 차단/리다이렉트 의심` };
    const stats = {};
    for (const m of html.matchAll(STAT)) stats[m[2].trim()] = m[1].trim();
    // 별점은 라벨이 «star»/«reviews» 로 오거나, 값 옆 aria 로 온다. 없으면 없는 것이다.
    const star = Object.entries(stats).find(([k]) => /star/i.test(k));
    const reviews = Object.entries(stats).find(([k]) => /review/i.test(k));
    const downloads = Object.entries(stats).find(([k]) => /download/i.test(k));
    return {
      name, id, len: html.length,
      rating: star ? star[1] : null,
      reviews: reviews ? reviews[1] : null,
      downloads: downloads ? downloads[1] : null,
      stats,
    };
  } catch (e) { return { name, id, error: e.message.slice(0, 60) }; }
}

(async () => {
  const rows = [];
  for (const [n, id] of APPS) rows.push(await one(n, id));
  if (asJson) { console.log(JSON.stringify({ at: new Date().toISOString(), rows }, null, 1)); }
  else {
    console.log('Play 스토어 별점 — 브라우저 없이 읽음');
    for (const r of rows) {
      if (r.error) { console.log(`  ✗ ${r.name.padEnd(15)} ${r.error}`); continue; }
      const star = r.rating || '없음';
      const mark = r.rating ? '★' : '·';
      console.log(`  ${mark} ${r.name.padEnd(15)} 별점 ${String(star).padEnd(8)} 리뷰 ${String(r.reviews || '없음').padEnd(10)} 다운로드 ${r.downloads || '?'}`);
    }
    const none = rows.filter((r) => !r.error && !r.rating).length;
    console.log(`\n별점이 붙은 앱 ${rows.filter((r) => r.rating).length} / ${rows.length}`);
    if (none === rows.length) {
      console.log('⚠ 세 앱 모두 별점 0 — 노출→열람 0.5% 의 고리가 아직 안 풀렸다.');
      console.log('  리뷰 요청 수정은 2026-09-19 배포됨(사용일 2·7일 + 앱 실행 4회째, 하루 1회).');
    }
  }
  if (rows.filter((r) => r.rating).length === 0) process.exit(1);
})();
