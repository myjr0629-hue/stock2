import assert from 'node:assert/strict';
import { valueTokens, claimReasons, orphanNumberReasons } from '../src/lib/ai/claimChecks';
// 관문 10311133·10311136: 기간 마스킹이 공유 호출자(관심종목·순환매·모닝브리핑)에 새면 «12주 전»·«1주 전» 오기가 숫자 대조를 빠져나간다 → Tactical 옵션에서만
const raws = (t: string, o?: { tactical?: boolean }) => valueTokens(t, o).map(v => v.raw.trim());
// 공유 호출자(옵션 없음) = main 과 같다: 기간 숫자도 값
assert.ok(raws('12주 전 예상 변동 ±3.2%').includes('12'));
assert.ok(raws('1주 전 예상 변동 ±3.2%').includes('1'), '공유 호출자에서 «1주 전»의 1 은 값(main 동일)');
assert.ok(raws('1週間前の想定変動±3.2%').includes('1'));
assert.ok(raws('a week ago the move was ±3.2%').every(r => r !== 'a'));
// Tactical(tactical 옵션) = «1주 전»의 1 은 기간 표기
assert.ok(!raws('금리 인상 확률이 1주 전 9.4%에서 72%로 올랐습니다.', { tactical: true }).includes('1'));
assert.ok(!raws('利上げ確率は1週間前の9.4%から72%へ', { tactical: true }).includes('1'));
assert.ok(raws('12주 전 9.4%', { tactical: true }).includes('12'), 'Tactical 에서도 «12주 전»은 값');
// claimReasons 기본값도 마스킹 없음
assert.deepEqual(claimReasons('x', 'insight'), claimReasons('x', 'insight', {}));
// 관문 10311138: 확률 주어(chance·odds·확률·確率)·괄호 «전일 대비»도 Tactical 옵션에서만 — 공유 호출자는 main 처럼 지어낸 확률을 고아 숫자로 거절
assert.ok(orphanNumberReasons('상승 확률은 72%입니다.').length > 0, '공유: «확률 72%» 거절(main 동일)');
assert.ok(orphanNumberReasons('There is a 72% chance this stock rises.').length > 0);
assert.ok(orphanNumberReasons('上昇確率は72%です。').length > 0);
assert.deepEqual(orphanNumberReasons('다음 FOMC 금리 인상 확률은 72%입니다.', { tactical: true }), []);
assert.deepEqual(orphanNumberReasons('Markets price a 72% chance of a hike at the next FOMC.', { tactical: true }), []);
// 옵션은 호출이 끝나면 원복(다음 공유 호출에 새지 않는다)
assert.ok(orphanNumberReasons('상승 확률은 72%입니다.').length > 0, '원복');
console.log('통과 Tactical 전용 확장(기간·확률·괄호 변화량)은 옵션에서만');
