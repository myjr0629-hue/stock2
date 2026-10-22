/**
 * 공유 전에 기기·계정·IP·전체 몫을 원자적으로 확보한다.
 * 기존 등록 API를 재사용해 토큰을 확정하므로, 완료 뒤 등록은 추가 차감 없는 멱등 재요청이다.
 * 실패·응답 유실은 클라이언트에서 일반 공유한다. 예약 몫을 자동 반환하지 않는다.
 */
export { POST } from '../issue/route';
export const dynamic = 'force-dynamic';
