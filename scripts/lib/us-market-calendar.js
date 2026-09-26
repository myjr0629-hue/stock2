'use strict';
// 미국 증시 달력 — 마케팅·데이터셋 스크립트(CommonJS)용 공용본.
// 정본은 src/lib/marketCalendar.ts 다. 휴장 목록은 매년 거기와 «함께» 갱신한다.
//
// 왜 공용본인가 (2026-09-27):
//   ① mkt-plan 이 주말에도 github 스냅샷을 «실행 1순위»로 배정했다(새 마감이 없는데).
//   ② 스냅샷 도구가 날짜를 «지금 UTC − 4시간»으로만 정해, 공개 데이터셋에 토요일 파일
//      2026-09-19.json 이 올라갔다(내용은 금요일 9/18 값과 같다 — SPY 762.96). 랜딩의
//      JSON-LD 에도 «2026-09-19 snapshot»으로 실려 구글 데이터셋 검색에 나갔다.
//   둘 다 «휴장을 달력으로 판정하지 않은» 같은 종류다. 달력 판정을 한 곳에 둔다.
const US_HOLIDAYS = new Set([
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
  '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31',
  '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24',
]);

const etParts = (ms, o) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', ...o })
  .formatToParts(new Date(ms)).map((x) => [x.type, x.value]));

/** 'YYYY-MM-DD' 가 거래가 없는 날(주말·휴장)인가 — 날짜 문자열만 본다(타임존 변환 없음) */
function isNonTradingDay(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
  if (!m) return false;
  if (US_HOLIDAYS.has(ymd)) return true;
  const dow = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay();
  return dow === 0 || dow === 6;
}

const addDays = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

/** ET 벽시계 hh:mm → UTC ms (EDT 로 놓고 ET 시각이 한 시간 빠르면 EST) */
function etWallToUtcMs(ymd, hh, mm = 0) {
  const [y, m, d] = ymd.split('-').map(Number);
  let t = Date.UTC(y, m - 1, d, hh + 4, mm);
  if (Number(etParts(t, { hour: '2-digit', hourCycle: 'h23' }).hour) === hh - 1) t += 3600e3;
  return t;
}

/** 이미 끝난 가장 최근 정규장 마감(16:00 ET). 조기폐장일(13:00)도 16:00 으로 본다 — 늦게 열릴 뿐 틀리게 열리지 않는다 */
function lastUsClose(nowMs = Date.now()) {
  const p = etParts(nowMs, { year: 'numeric', month: '2-digit', day: '2-digit' });
  let ymd = `${p.year}-${p.month}-${p.day}`;
  for (let i = 0; i < 14; i++, ymd = addDays(ymd, -1)) {
    if (isNonTradingDay(ymd)) continue;
    const t = etWallToUtcMs(ymd, 16);
    if (t <= nowMs) return { ms: t, ymd };
  }
  return { ms: 0, ymd: null };
}
const lastUsCloseMs = (nowMs = Date.now()) => lastUsClose(nowMs).ms;

function nextTradingDay(ymd) { let d = addDays(ymd, 1); for (let i = 0; i < 14 && isNonTradingDay(d); i++) d = addDays(d, 1); return d; }

/**
 * 옵션 구조 스냅샷을 «지금» 찍어도 되는가, 된다면 어느 거래일 날짜로.
 * 창 = 마지막 정규장 마감 ~ 다음 거래일 04:00 ET(프리마켓 시작 — 그 무렵 미결제약정도 새 날 것으로 바뀐다).
 * 그 밖(세션 중·프리마켓)에 찍으면 값이 «다음 세션» 것이라 날짜와 값이 어긋난다 → 거부.
 */
function snapshotWindow(nowMs = Date.now()) {
  const lc = lastUsClose(nowMs);
  if (!lc.ymd) return { ok: false, ymd: null, reason: '최근 14일 안에 정규장 마감이 없다(달력 확인)' };
  const nd = nextTradingDay(lc.ymd);
  const ndStart = etWallToUtcMs(nd, 4);
  if (nowMs >= ndStart) return { ok: false, ymd: null, reason: `다음 세션(${nd}) 진행 중 — 값이 ${lc.ymd} 마감 것이 아니다. ${nd} 16:00 ET 뒤에 실행` };
  return { ok: true, ymd: lc.ymd, reason: `${lc.ymd} 마감 뒤 ~ ${nd} 04:00 ET 전` };
}

module.exports = { US_HOLIDAYS, isNonTradingDay, lastUsClose, lastUsCloseMs, nextTradingDay, snapshotWindow, etWallToUtcMs };
