// 공개 캠페인 정의(닫힌 목록) — 서버(campaign.ts)와 운영 스크립트(scripts/gift-campaign.mjs)가 함께 읽는다. 2026-11-01.
// 값을 바꾸면 운영 배포가 필요하다. 켜고 끄기는 Upstash 스위치 키(<접두>:camp:<id>:on)로만 한다.
//   day     OS별 하루(KST) 새 배정 상한
//   total   OS별 캠페인 전체 새 배정 상한
//   reserve OS별 선물 몫 — 유효 재고가 이 수 이하이면 캠페인 새 배정 중단(친구 선물은 계속)
//   ipDay   IP(정규화·HMAC)당 하루 새 배정 상한
//   endsAt  새 배정 마감(ms) — 이 시각부터 배정 0(이미 받은 코드 복구는 계속)
const GIFT_CAMPAIGNS = Object.freeze({
  'weekend-1101': Object.freeze({
    id: 'weekend-1101',
    day: Object.freeze({ ios: 40, android: 20 }),
    total: Object.freeze({ ios: 600, android: 300 }),
    reserve: Object.freeze({ ios: 20, android: 10 }),
    ipDay: 5,
    // 11/30(KST)까지 받을 수 있다.
    endsAt: Date.parse('2026-12-01T00:00:00+09:00'),
  }),
});
module.exports = { GIFT_CAMPAIGNS };
