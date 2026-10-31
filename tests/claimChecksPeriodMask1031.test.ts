import assert from 'node:assert/strict';
import { valueTokens, claimReasons } from '../src/lib/ai/claimChecks';
// 관문 10311133·10311136: 기간 마스킹이 공유 호출자(관심종목·순환매·모닝브리핑)에 새면 «12주 전»·«1주 전» 오기가 숫자 대조를 빠져나간다 → Tactical 옵션에서만
const raws = (t: string, o?: { periodMask?: boolean }) => valueTokens(t, o).map(v => v.raw.trim());
// 공유 호출자(옵션 없음) = main 과 같다: 기간 숫자도 값
assert.ok(raws('12주 전 예상 변동 ±3.2%').includes('12'));
assert.ok(raws('1주 전 예상 변동 ±3.2%').includes('1'), '공유 호출자에서 «1주 전»의 1 은 값(main 동일)');
assert.ok(raws('1週間前の想定変動±3.2%').includes('1'));
assert.ok(raws('a week ago the move was ±3.2%').every(r => r !== 'a'));
// Tactical(periodMask) = «1주 전»의 1 은 기간 표기
assert.ok(!raws('금리 인상 확률이 1주 전 9.4%에서 72%로 올랐습니다.', { periodMask: true }).includes('1'));
assert.ok(!raws('利上げ確率は1週間前の9.4%から72%へ', { periodMask: true }).includes('1'));
assert.ok(raws('12주 전 9.4%', { periodMask: true }).includes('12'), 'Tactical 에서도 «12주 전»은 값');
// claimReasons 기본값도 마스킹 없음
assert.deepEqual(claimReasons('x', 'insight'), claimReasons('x', 'insight', {}));
console.log('통과 기간 마스킹은 Tactical 옵션에서만');
