/**
 * 수동 보강(1회) — 11/18~11/25 발표 종목의 «발표 전 마지막 예상 변동폭» 기록 (2026-11-26)
 *
 * 왜: 확인 목록(src/lib/earningsConfirmed.ts)이 11/9 뒤로 갱신되지 않아, 실적 반응 크론(/api/cron/earnings-actuals)이
 *   SYM·CRWD·ZS(11/23)·DELL·WDAY(11/24)·DE(11/25)·LOW(11/18)의 발표 전 예상값을 저장하지 못했다(목록에 없으면 크론이 안 본다).
 *   그래서 scripts/earnings-actuals-seed-expected.ts(10/14)와 같은 방식으로 «기준 세션(AMC 발표일 · BMO 직전 거래일)의
 *   공급사(Intrinio) EOD 체인»을 화면과 같은 정의(lib/impliedMove.atmStraddleImpliedMove — 발표 뒤 첫 만기 · 현물에 가장 가까운
 *   행사가 · 마감 호가 중간값(eodQuoteRows) 콜+풋 ÷ 기준 세션 종가)로 다시 계산해 넣는다. 기록에는 src:'eod-chain'.
 *   FMP 는 쓰지 않는다(덧입히기 금지). 체인·종가를 못 구하거나 체인 날짜가 기준 세션이 아니면 비워 둔다(추측 값 금지).
 *   월물만 있는 종목(이벤트 분리 정의)은 이 스크립트가 계산하지 않고 건너뛴다.
 *
 * 사용(키는 환경변수로만 — 저장소에 두지 않는다):
 *   INTRINIO_API_KEY=… EC2_REDIS_PROXY_KEY=… node node_modules/ts-node/dist/bin.js -r tsconfig-paths/register --transpile-only \
 *     -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' scripts/earnings-actuals-seed-expected-1126.ts [--dry] [TICKER…]
 *   이미 expected 가 있는 종목은 건드리지 않는다(seedExpected 기본). 실제 반응 기록은 그대로 둔다.
 */
import { seedExpected, intrinioCloses } from '../src/services/earningsActualsService';
import { reactionSessions, type ExpectedSnap, type ReportHour } from '../src/lib/earnings/earningsActuals';
import { atmStraddleImpliedMove, eodQuoteRows } from '../src/lib/impliedMove';
import { expiryMethod } from '../src/lib/earnings/eventMove';
import { addDaysYmd } from '../src/lib/earningsWeek';
import { getOptionChainSnapshotIntrinio, getOptionExpirationsEodIntrinio } from '../src/services/intrinioClient';

const ROWS: Array<[string, string, ReportHour]> = [
  ['LOW', '2026-11-18', 'bmo'],
  ['CRWD', '2026-11-23', 'bmo'],
  ['ZS', '2026-11-23', 'bmo'],
  ['SYM', '2026-11-23', 'amc'],
  ['DELL', '2026-11-24', 'amc'],
  ['WDAY', '2026-11-24', 'amc'],
  ['DE', '2026-11-25', 'bmo'],
];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

async function compute(ticker: string, date: string, hour: ReportHour): Promise<{ snap?: ExpectedSnap; why?: string }> {
  const rs = reactionSessions(date, hour);
  if (!rs) return { why: 'no_sessions' };
  const base = rs.base;
  const closes = await intrinioCloses(ticker, addDaysYmd(base, -4), base);
  const spot = closes.find((c) => c.date === base)?.close;
  if (!(spot && spot > 0)) return { why: `no_base_close(${base})` };
  const listed = await getOptionExpirationsEodIntrinio(ticker, addDaysYmd(base, -1));
  if (!listed) return { why: 'expirations_failed' };
  const expiries = [...new Set(listed.filter((e) => ISO.test(e)))].sort();
  const head = expiries.find((e) => (hour === 'bmo' ? e >= date : e > date));
  if (!head) return { why: 'no_post_expiry' };
  const method = expiryMethod(head) === 'weekly' ? 'weekly' : expiries.some((e) => expiryMethod(e) === 'weekly') ? 'monthly' : null;
  if (!method) return { why: `monthly_only(${head}) — 이벤트 분리 정의라 건너뜀` };
  const resp = await getOptionChainSnapshotIntrinio(ticker, { expiration: head, underlyingPrice: spot, date: base });
  if (!resp || resp.partial || resp.vendorFailed || resp.expirationsMissing?.length || resp.expirationsTruncated?.length) return { why: 'chain_failed' };
  const rows = (resp.results || []).filter((c: any) => c?.details?.expiration_date === head);
  const dates = [...new Set(rows.map((c: any) => c?._intrinio?.date))];
  if (!rows.length) return { why: `chain_empty(${head})` };
  if (dates.length !== 1 || dates[0] !== base) return { why: `chain_date(${dates.join(',')})_not_${base}` };
  // 기준 세션 마감 시점 기준으로 «살아 있는 만기»를 본다(지난 만기 LOW 11/20 도 그 세션엔 살아 있었다)
  const im = atmStraddleImpliedMove(eodQuoteRows(rows), spot, { expiry: head, chainDate: base, nowMs: Date.parse(`${base}T20:30:00Z`) });
  if (!im || im.basis !== 'eod' || im.session !== base || !(im.pct > 0)) return { why: 'no_straddle' };
  return {
    snap: {
      pct: im.pct, method, straddlePct: im.pct, expiry: head, session: base, basis: 'eod',
      strike: im.strike, straddle: im.straddle, spot, capturedAt: Date.now(), src: 'eod-chain',
    },
  };
}

(async () => {
  const dry = process.argv.includes('--dry');
  const only = process.argv.slice(2).filter((a) => /^[A-Z]{1,5}$/.test(a));
  for (const [ticker, date, hour] of ROWS) {
    if (only.length && !only.includes(ticker)) continue;
    const r = await compute(ticker, date, hour).catch((e) => ({ why: `error(${String(e?.message || e).slice(0, 60)})` } as { snap?: ExpectedSnap; why?: string }));
    if (!r.snap) { console.log(`${ticker} ${date} ${hour}: 건너뜀 — ${r.why}`); continue; }
    const s = r.snap;
    const line = `${ticker} ${date} ${hour}: ±${s.pct}% (${s.method} · 만기 ${s.expiry} · 행사가 ${s.strike} · 스트래들 $${s.straddle} / 종가 $${s.spot} · 세션 ${s.session})`;
    if (dry) { console.log(`[dry] ${line}`); continue; }
    console.log(line, '→', await seedExpected({ ticker, date, hour }, s as ExpectedSnap & { method: NonNullable<ExpectedSnap['method']> }));
  }
})().catch((e) => { console.error(e instanceof Error ? e.message : 'failed'); process.exit(1); });
