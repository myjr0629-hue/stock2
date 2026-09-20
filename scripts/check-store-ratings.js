#!/usr/bin/env node
/**
 * Play + App Store 별점·리뷰를 «브라우저 없이» 읽는다.
 *
 * ★2026-09-20 정정: 이 스크립트가 Play 만 보고 「세 앱 모두 별점 0」이라고 찍어 왔는데 «틀렸다».
 *   애플 lookup API(무인증)로 재니 SIGNUM 은 US·KR 각 ★5(1건), UC 는 KR ★5(1건)이 이미 있었다.
 *   애플 평점은 «스토어프런트별»이라 한 나라만 보면 0 으로 보인다 → us·kr·jp 를 다 읽는다.
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
  ['SIGNUM HQ', 'com.signumhq.app', '6783130444'],
  ['Undercurrent', 'com.signumhq.undercurrent', '6788779895'],
  ["Why'd It Move?", 'com.signumhq.wim', '6794356135'],
];
// 애플 평점은 스토어프런트별로 따로 쌓인다 — 판매 상위 3개국을 다 읽어야 «있다/없다»가 정확하다.
const APPLE_CC = ['us', 'kr', 'jp'];

// itunes lookup: 무인증·무브라우저. averageUserRating 은 «전 버전 누계», ...ForCurrentVersion 은 현재 버전.
async function apple(id) {
  const out = {};
  for (const cc of APPLE_CC) {
    try {
      const r = await fetch(`https://itunes.apple.com/lookup?id=${id}&country=${cc}`, { headers: { 'User-Agent': UA } });
      const j = await r.json();
      const a = (j.results || [])[0];
      out[cc] = a ? { ver: a.version, avg: a.averageUserRating || 0, n: a.userRatingCount || 0 } : { error: 'no result' };
    } catch (e) { out[cc] = { error: String(e.message).slice(0, 40) }; }
  }
  return out;
}
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const asJson = process.argv.includes('--json');

// Play 상세 페이지의 통계는 <div class="ClM7O">값</div><div class="g1rdde">라벨</div> 쌍이다.
// 별점이 생기면 같은 자리에 «4.5» / «star» 쌍이 늘어난다 — 라벨을 열쇠로 쓴다.
const STAT = /<div class="ClM7O">([^<]{1,20})<\/div><div class="g1rdde">([^<]{1,30})<\/div>/g;

async function one(name, id, appleId) {
  const url = `https://play.google.com/store/apps/details?id=${id}&hl=en&gl=US`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' } });
    if (!r.ok) return { name, id, error: `HTTP ${r.status}` };
    const html = await r.text();
    if (html.length < 50000) return { name, id, error: `본문이 너무 짧다(${html.length}) — 차단/리다이렉트 의심` };
    const stats = {};
    for (const m of html.matchAll(STAT)) stats[m[2].trim()] = m[1].trim();
    // 별점은 라벨이 «star»/«reviews» 로 오거나, 값 옆 aria 로 온다. 없으면 없는 것이다.
    // ★2026-09-20 수리. 예전 코드는 ClM7O/g1rdde 쌍에서 «star/review» 라벨을 찾았는데,
    //   그 자리엔 «다운로드»만 남아 있다 — 별점 111만개인 Investing.com 도 «없음»으로 나왔다.
    //   즉 이 검사기는 «어떤 앱의 별점도» 못 읽고 있었다. 결론(우리 앱 0)이 맞았어도 근거는 무효였다.
    //   Play 는 별점을 세 군데로 준다. 가장 단단한 JSON-LD 를 쓴다.
    const rv = /"ratingValue"\s*:\s*"?([0-9.]+)/.exec(html);
    const rc = /"ratingCount"\s*:\s*"?([0-9]+)/.exec(html);
    const star = rv ? [null, Number(rv[1]).toFixed(1)] : null;
    const reviews = rc ? [null, Number(rc[1]).toLocaleString()] : null;
    const downloads = Object.entries(stats).find(([k]) => /download|다운로드/i.test(k));
    return {
      name, id, len: html.length,
      rating: star ? star[1] : null,
      reviews: reviews ? reviews[1] : null,
      downloads: downloads ? downloads[1] : null,
      stats,
      apple: await apple(appleId),
    };
  } catch (e) { return { name, id, error: e.message.slice(0, 60), apple: await apple(appleId) }; }
}

// ★검사기는 «양성 대조군»으로 시험한다 — 2026-09-20 에 이걸 안 해서 «못 읽는 검사기»를 며칠 썼다.
const CONTROL = ['com.fusionmedia.investing', 'Investing.com(별점이 «있어야» 하는 앱)'];

(async () => {
  const rows = [];
  for (const [n, id, aid] of APPS) rows.push(await one(n, id, aid));
  const ctl = await one(CONTROL[1], CONTROL[0], '0');
  if (asJson) { console.log(JSON.stringify({ at: new Date().toISOString(), rows }, null, 1)); }
  else {
    console.log('스토어 별점 — 브라우저 없이 읽음 (Play + App Store us/kr/jp)');
    for (const r of rows) {
      if (r.error) { console.log(`  ✗ ${r.name.padEnd(15)} ${r.error}`); continue; }
      const star = r.rating || '없음';
      const mark = r.rating ? '★' : '·';
      console.log(`  ${mark} ${r.name.padEnd(15)} Play 별점 ${String(star).padEnd(8)} 리뷰 ${String(r.reviews || '없음').padEnd(8)} 다운로드 ${r.downloads || '?'}`);
      const ap = r.apple || {};
      const cells = APPLE_CC.map((cc) => {
        const a = ap[cc] || {};
        if (a.error) return `${cc} ✗`;
        return `${cc} ${a.n > 0 ? '★' + a.avg + '(' + a.n + ')' : '0'}`;
      }).join(' · ');
      const ver = (ap.us && ap.us.ver) || (ap.kr && ap.kr.ver) || '?';
      console.log(`    ${' '.repeat(16)}App Store v${String(ver).padEnd(7)} ${cells}`);
    }
    const hasAny = (r) => !!r.rating || APPLE_CC.some((cc) => (r.apple?.[cc]?.n || 0) > 0);
    const withStars = rows.filter(hasAny).length;
    console.log(`\n별점이 «어느 스토어에든» 붙은 앱 ${withStars} / ${rows.length}`);
    const playZero = rows.filter((r) => !r.error && !r.rating).length;
    if (playZero === rows.length) console.log('· Play 는 여전히 3앱 0 — 안드로이드 쪽 고리가 아직 안 풀렸다.');
    for (const r of rows) {
      if (!hasAny(r)) console.log(`⚠ ${r.name} — 두 스토어 전부 0. 리뷰 요청 경로부터 확인할 것.`);
    }
  }
  if (!asJson) {
    console.log(ctl.rating ? `\n· 대조군 ${CONTROL[1]}: ★${ctl.rating} · 리뷰 ${ctl.reviews} → 검사기 정상`
                           : `\n⛔ 대조군(${CONTROL[1]})에서도 별점을 못 읽었다 — 위 «별점 없음»은 «앱의 사실»이 아니라 «검사기 고장»이다.`);
  }
  const anyStar = rows.some((r) => !!r.rating || APPLE_CC.some((cc) => (r.apple?.[cc]?.n || 0) > 0));
  if (!anyStar) process.exit(1);
})();
