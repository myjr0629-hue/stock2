/**
 * 수동 보강(1회) — 10/13 발표 6종목의 «발표 전 마지막 예상 변동폭» 기록 (2026-10-14)
 *
 * 왜: 실적 «실제 반응» 기록 크론(/api/cron/earnings-actuals)은 발표 «전»에 화면이 읽던 값을 저장해 두는데,
 *   이 기능이 배포되기 전에 발표가 끝난 종목(JPM·JNJ·C·GS·UNH·WFC, 10/13 장전)은 그 저장이 없었다.
 *   그래서 «그 세션(10/12 마감) 공급사 EOD 체인»을 화면과 «같은 정의»(lib/impliedMove.atmStraddleImpliedMove —
 *   첫 만기 10/16 · 현물에 가장 가까운 행사가 한 개 · 콜·풋 중간값 합 ÷ 10/12 종가)로 다시 계산해 넣는다.
 *   검증: 같은 방법이 10/13 에 실제로 나갔던 값(예약 글 숫자 게이트 기록 out/s13-*·s12-* meta.json)을 그대로 재현했다 —
 *   JPM 3.16→3.2(당시 3.2) · JNJ 3.58→3.6(당시 3.6) · C 4.05→4.0(당시 4.0). 나머지 GS·UNH·WFC 는 같은 방법의 계산값이다.
 *   기록에는 src:'eod-chain' 으로 남아 «화면 저장본에서 읽은 값(page)»과 구분된다.
 *
 * 사용: EC2_REDIS_PROXY_KEY=<키> node_modules/.bin/ts-node -r tsconfig-paths/register --transpile-only -O '{"module":"commonjs","moduleResolution":"node","esModuleInterop":true}' scripts/earnings-actuals-seed-expected.ts [--dry]
 *   이미 값이 있는 종목은 건드리지 않는다. 실제 반응 기록은 그대로 둔다. 비밀값은 저장소에 두지 않는다 — 키는 환경변수로만.
 */
import { seedExpected } from '../src/services/earningsActualsService';
import type { ExpectedSnap } from '../src/lib/earnings/earningsActuals';

const BASE = { expiry: '2026-10-16', session: '2026-10-12', basis: 'eod' as const, src: 'eod-chain' as const };
// [티커, 예상 변동폭 %(소수 1자리), ATM 행사가, 스트래들 $, 10/12 종가 $]
const ROWS: Array<[string, number, number, number, number]> = [
  ['JPM', 3.2, 335, 10.58, 334.3],
  ['JNJ', 3.6, 262.5, 9.45, 263.73],
  ['C', 4.0, 132, 5.34, 131.92],
  ['GS', 4.2, 895, 37.1, 893.95],
  ['UNH', 6.7, 377.5, 25.47, 378.52],
  ['WFC', 4.6, 83, 3.8, 83.32],
];

(async () => {
  const dry = process.argv.includes('--dry');
  for (const [ticker, pct, strike, straddle, spot] of ROWS) {
    const snap: ExpectedSnap = { ...BASE, pct, strike, straddle, spot, capturedAt: Date.now() };
    if (dry) { console.log(`[dry] ${ticker} ±${pct}% (${strike} · $${straddle} / $${spot})`); continue; }
    console.log(ticker, await seedExpected({ ticker, date: '2026-10-13', hour: 'bmo' }, snap));
  }
})().catch((e) => { console.error(e); process.exit(1); });
