// 헤드라인 10Y 정본 — 곡선을 쓰면 변화량도 곡선에서 (macroHubProvider.unifyUs10y)
// 실행: npx ts-node -T -O '{"moduleResolution":"node","module":"commonjs"}' -P tsconfig.tsnode.json -r tsconfig-paths/register tests/unifyUs10y.test.ts
//
// 입력은 2026-09-28 23:44Z 운영 /api/market/macro 의 us10y(^TNX 필드)와 같은 시각 재무부 곡선(EC2 Redis treasury:curve).
// 옛 코드: 수준 5.24(재무부) + 변화 0.056·1.08%(^TNX) → 화면 «+1.08». 재무부 원본은 9/25 5.17 → 9/28 5.24 = +7bp.
import { unifyUs10y, type MacroFactor, type YieldCurveData } from '../src/services/macroHubProvider';
import { yieldChangeBp, fmtBp } from '../src/lib/yieldChange';

let total = 0, pass = 0;
const failures: string[] = [];
function check(name: string, cond: boolean, detail = '') {
    total++;
    if (cond) pass++;
    else { failures.push(`${name}: ${detail}`); console.log(`  ❌ ${name}: ${detail}`); }
}

const tnx: MacroFactor = {
    level: 5.24, chgPct: 1.080246913580248, chgAbs: 0.05600000000000005,
    label: 'US 10Y', source: 'YAHOO', status: 'OK', symbolUsed: '^TNX',
    marketTime: '2026-09-28T18:59:52.000Z', updatedAt: '2026-09-28T23:26:44.931Z', feedSource: 'YAHOO',
};
const curve: YieldCurveData = {
    us2y: 4.92, us10y: 5.24, spread2s10s: 0.32, trend: 'NORMAL', date: '2026-09-28', source: 'US_TREASURY',
    prevDate: '2026-09-25', prevUs10y: 5.17,
};

console.log('━━━ 1. 마감 뒤(곡선이 ^TNX 세션과 같은 날) — 수준·변화 모두 곡선 ━━━');
const u = unifyUs10y(tnx, curve, false);
check('수준 = 재무부 5.24', u.level === 5.24, String(u.level));
check('변화 = 재무부 +0.07', u.chgAbs === 0.07, String(u.chgAbs));
check('상대 % 도 곡선 기준(1.354)', u.chgPct === 1.354, String(u.chgPct));
check('화면 «+7bp»', fmtBp(yieldChangeBp(u)) === '+7bp', fmtBp(yieldChangeBp(u)));
check('출처 표기 UST:10Y / US_TREASURY', u.symbolUsed === 'UST:10Y' && u.source === 'US_TREASURY', `${u.symbolUsed}/${u.source}`);
check('신선도 필드는 그대로(라이브 점 판정용)', u.marketTime === tnx.marketTime && u.feedSource === 'YAHOO', String(u.marketTime));
check('입력 객체는 안 바뀐다', tnx.chgAbs === 0.05600000000000005 && tnx.symbolUsed === '^TNX', JSON.stringify(tnx).slice(0, 80));

console.log('━━━ 2. 장중(^TNX 세션이 더 새롭다) — ^TNX 그대로 ━━━');
const live = unifyUs10y({ ...tnx, level: 5.281, chgAbs: 0.041, chgPct: 0.782, marketTime: '2026-09-29T14:10:00.000Z' }, curve, true);
check('수준 = ^TNX', live.level === 5.281, String(live.level));
check('변화 = ^TNX(+4bp)', fmtBp(yieldChangeBp(live)) === '+4bp', fmtBp(yieldChangeBp(live)));
check('출처 ^TNX', live.symbolUsed === '^TNX', String(live.symbolUsed));

console.log('━━━ 3. 곡선이 없거나 직전 행이 없으면 예전대로 ━━━');
check('곡선 없음 → ^TNX 그대로', unifyUs10y(tnx, null, false) === tnx);
const noPrev = unifyUs10y(tnx, { ...curve, prevDate: undefined, prevUs10y: undefined }, false);
check('직전 행 없음 → 수준만 곡선', noPrev.level === 5.24 && noPrev.chgAbs === tnx.chgAbs, `${noPrev.level} ${noPrev.chgAbs}`);

console.log('━━━ 4. ^TNX 가 곡선보다 «오래된» 세션(피드 정지) — 곡선 변화량이 맞다 ━━━');
// 예전엔 금요일 ^TNX 변화(9/25 세션)가 월요일 곡선(9/28) 수준에 붙었다
const stale = unifyUs10y({ ...tnx, chgAbs: 0.01, chgPct: 0.19, marketTime: '2026-09-25T19:00:00.000Z' }, curve, false);
check('월요일 곡선 + 월요일 변화 +7bp', fmtBp(yieldChangeBp(stale)) === '+7bp', fmtBp(yieldChangeBp(stale)));

console.log();
console.log(`결과: ${pass}/${total} 통과`);
if (failures.length) { console.log(failures.join('\n')); process.exit(1); }
