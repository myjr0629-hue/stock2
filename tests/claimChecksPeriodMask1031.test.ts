import assert from 'node:assert/strict';
import { valueTokens } from '../src/lib/ai/claimChecks';
// 관문 10311133: «N주 전» 마스킹이 공유 호출자(관심종목)에서 «12주 전»을 숫자 대조 밖으로 빼 틀린 기간이 통과 — 마스킹은 «1주 전»만
const raw = (t: string) => valueTokens(t).map(v => (v as any).raw ?? (v as any).text ?? JSON.stringify(v)).join(' ');
assert.ok(/12/.test(raw('12주 전 예상 변동 ±3.2%')), '«12주 전»의 12 는 값으로 남아야 한다');
assert.ok(/12/.test(raw('12 weeks ago the expected move was ±3.2%')), '«12 weeks ago»의 12 는 값');
assert.ok(/12/.test(raw('12週間前の想定変動±3.2%')), '«12週間前»의 12 는 값');
// Tactical «1주 전 9.4%에서 72%로»의 1 은 기간 표기라 값이 아니다(기존 의도 유지)
assert.ok(!/(^|\s|")1(\s|"|$)/.test(raw('금리 인상 확률이 1주 전 9.4%에서 72%로 올랐습니다.')), '«1주 전»의 1 은 값이 아니다');
assert.ok(!/(^|\s|")1(\s|"|$)/.test(raw('odds rose from 9.4% a week ago to 72%')));
console.log('통과 기간 마스킹 범위(1주 전만)');
