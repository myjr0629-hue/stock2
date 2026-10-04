/* ============================================================================
 * spaces-list — ego 작업공간 목록과 «lib.space() 가 고를 공간»을 읽기만 한다(점유·클릭·이동 없음).
 * 사용: bash scripts/ego-run.sh scripts/ego/spaces-list.mjs 40
 * 왜 (2026-10-04 13시): 10:16 알림 권한 프롬프트로 공간 0(mkt)이 사용자 제어가 된 뒤, lib.space() 는 같은 프로필의
 *   에이전트 공간으로 갈아타도록 고쳤지만 발행기 30여 개는 여전히 «Profile 1 의 첫 공간 + takeOverTaskSpace» 로 공간을 잡았다
 *   (대표 제어를 빼앗는다). 발행 전에 «어느 공간이 에이전트 소유인지»를 먼저 본다.
 * ========================================================================== */
const list = await listTaskSpaces();
const rows = (list || []).map((s) => ({ id: s.id, name: s.name, profileId: s.profileId, ownership: s.ownership }));
console.log('EGO_SPACES ' + JSON.stringify(rows));
const p1 = rows.filter((s) => s.profileId === 'Profile 1');
const userHeld = (s) => /user/i.test(String(s.ownership || '')) && s.ownership !== 'agent';
const pick = p1.find((s) => !userHeld(s)) || null;
console.log('PROFILE1 ' + p1.map((s) => `#${s.id}(${s.name}:${s.ownership})`).join(' · '));
console.log(pick ? `PICK #${pick.id}(${pick.name}) — lib.space() 가 쓸 공간` : 'PICK 없음 — Profile 1 공간이 모두 사용자 제어(브라우저 없는 채널로)');
