#!/usr/bin/env node
// ============================================================================
// _publish-hour — 지금 올려도 되는 시각인가. «시청자 시간대» 로 본다.
// ----------------------------------------------------------------------------
// ⛔ 왜 생겼나 (2026-08-23)
//   테스트3 을 미국 동부 새벽 4:36 에 올렸다. 시청자가 자는 시간이다.
//   나는 시각을 보지도 않고 올렸고, 이걸 막을 장치가 없었다.
//
// ⛔ 그리고 기존 규칙이 «반대» 였다
//   게이트에 `banHours: [22,23,0]` — KST 22~01 금지 — 가 있었다 (근거 n=578).
//   그런데 KST 22~01 은 **ET 09~12** 이고, 우리 채널의 «최고 구간» 이다:
//     ET 06~12  14편 · 조회 중앙 86  ← 최고작 187·202·220 이 전부 여기
//     ET 12~18   5편 · 중앙 42
//     ET 18~24   6편 · 중앙 40
//     ET 00~06   2편 · 중앙 18   ← 11회·18회. 우리 채널 최하위
//   규칙이 우리 시간대(KST)로 쓰여 있는데 시청자는 미국(ET)에 있었다.
//   ⇒ 시각 규칙은 «시청자 시간대» 로만 의미가 있다.
//
// ⚠️ 표본이 얇다 (새벽 2편). 이 표로 「시각이 원인이다」를 증명할 수 없다.
//   그래서 «금지» 가 아니라 «경고 + 명시적 강행» 으로 만든다.
//
// 사용:
//   node scripts/_publish-hour.mjs           (hq = ET 기준)
//   SIGNUM_YT=jp node scripts/_publish-hour.mjs   (jp = JST 기준)
// 종료코드: 0 = 괜찮다 · 1 = 나쁜 시간대다
// ============================================================================

const YTW = String(process.env.SIGNUM_YT || 'hq').toLowerCase();
const TZ = { hq: 'America/New_York', jp: 'Asia/Tokyo', kr: 'Asia/Seoul' }[YTW];
const LABEL = { hq: '미국 동부', jp: '일본', kr: '한국' }[YTW];
if (!TZ) { console.error(`  ⛔ SIGNUM_YT=${YTW} 는 모르는 채널이다. hq | jp | kr 중 하나여야 한다.`); process.exit(1); }

// ⛔ 우리 채널 «실측» 기준은 미국뿐이다. 일본·한국은 표본이 없어 미국 패턴을 빌린다 — 추정이다.
//   한국 채널은 2026-08-25 개설 — 표본 0. 편수가 쌓이면 여기 숫자를 «따로» 재서 갈아끼운다.
const BAD = [0, 1, 2, 3, 4, 5];        // 시청자가 자는 시간
const BEST = [6, 7, 8, 9, 10, 11];     // 우리 최고 구간

// ⛔ 예약 업로드는 «지금» 이 아니라 «게시될 시각» 을 봐야 한다 (2026-08-24).
//   그 구분이 없어서 JST 00:01 에 올린 「14:00 게시」 건이 막혔다 — 잘못 막은 것이다.
//   --at="YYYY-MM-DD HH:MM" 은 JST/KST(둘 다 UTC+9) 기준 게시 시각이다.
const AT = (process.argv.find((a) => a.startsWith('--at=')) || '').slice(5);
const atM = AT.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
const now = atM
  ? new Date(Date.UTC(+atM[1], +atM[2] - 1, +atM[3], +atM[4] - 9, +atM[5]))
  : new Date();
if (atM) console.log(`\n  «게시 예정» 시각으로 검사한다 — ${AT} (KST/JST)`);
const hour = +new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: '2-digit', hour12: false }).format(now);
const shown = new Intl.DateTimeFormat('ko-KR', {
  timeZone: TZ, weekday: 'short', month: 'numeric', day: 'numeric',
  hour: '2-digit', minute: '2-digit', hour12: false,
}).format(now);

console.log(`\n  ${LABEL} 현재  ${shown}`);

if (BAD.includes(hour)) {
  console.log(`\n  ⛔ ${LABEL} ${hour}시 — 시청자가 자는 시간이다.`);
  console.log(`     우리 채널 실측: 이 구간에 올린 2편이 11회·18회 (채널 최하위).`);
  console.log(`     최고 구간은 ${LABEL} 06~12시 (14편 · 중앙 86회).`);
  console.log(`     ⚠️ 표본이 얇다 — 증명이 아니라 방향이다. 강행하려면 --force-hour 를 명시한다.\n`);
  process.exit(1);
}

const tag = BEST.includes(hour) ? '최고 구간' : '보통';
console.log(`  ✅ ${LABEL} ${hour}시 — ${tag}. 올려도 된다.\n`);
process.exit(0);
