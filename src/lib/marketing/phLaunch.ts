// ============================================================================
// Product Hunt 런치 — 날짜 게이트 + 링크 단일 출처
// ----------------------------------------------------------------------------
// 왜 사이트에 배너를 다나:
//   PH 는 «하루»만 순위를 매긴다. 그날 우리 사이트에 오는 사람을 PH 로 보내면
//   업보트 → 순위 상승 → PH 피드 노출 → 다시 우리 쪽 트래픽, 이라는 고리가 돈다.
//   런치 당일에만 도는 고리라 «자동으로 뜨고 자동으로 사라져야» 한다.
//   사람이 켜고 끄기로 하면 반드시 잊는다.
//
// ⚠️ PH 하루는 미국 태평양시 00:01~23:59 다. UTC 창으로 환산해 박아둔다.
//    (PDT = UTC-7 → 그날 07:00Z 부터 다음날 07:00Z)
//
// ★ 날짜를 «일요일»로 통일한 근거 (2026-08-22 PH 리더보드 실측):
//     순위      일요일 8/16    수요일 8/19
//     5위         217표          188표
//     8위          54표          137표
//     10위         22표          120표
//     12위         11표            —
//   상위 1~5위 문턱은 수요일이 높지만, 그건 팔로워 0인 우리에겐 닿지 않는 숫자다.
//   실제로 결정하는 건 «우리가 닿을 수 있는 8~12위 구간»이고,
//   일요일은 7위 아래로 절벽처럼 떨어진다(22표면 10위, 11표면 12위).
//   수요일은 10위도 120표를 요구한다.
//   → 수십 표 규모의 콜드 런치는 일요일이 압도적으로 유리하다.
//   처음엔 메인 앱(SIGNUM)을 «트래픽이 많은 평일»에 뒀는데, 실측이 그걸 뒤집었다.
//
// ★ 2차 실측 — «토요일도 된다» (요일을 더 넓혀서 다시 셈):
//     순위    토 8/22   일 8/16   월 8/17   수 8/19
//     5위      104      217      172      188
//     8위       75       54      149      137
//     10위      69       22      123      120
//   주말(토·일)이 평일의 절반 이하다. 일요일만 쓰면 자동으로 7일 간격이 되는데,
//   그건 «선택»이 아니라 «부작용»이었다 — 토요일을 쓰면 2주 → 8일로 줄어든다.
//   WIM 을 9/6 → 8/29(토)로 당겼다. SIGNUM 은 8/30(일) 유지:
//   우리 예상 득표(수십 표) 구간에서 일요일이 토요일보다 낫고(8위 54 vs 75),
//   메인 앱이므로 더 좋은 쪽을 준다.
// ⚠️ 업보트를 «부탁»하는 문구는 PH 금지 사항이다(계정 제재).
//    "우리 오늘 PH 에 올라왔습니다" 까지만 쓴다.
// ============================================================================
export type PhApp = 'signum' | 'undercurrent' | 'wim';

type Launch = { url: string; startUtc: string; endUtc: string; name: string };

export const PH_LAUNCHES: Record<PhApp, Launch> = {
  undercurrent: {
    name: 'Undercurrent',
    url: 'https://www.producthunt.com/products/undercurrent?launch=undercurrent',
    startUtc: '2026-08-23T07:00:00Z',
    endUtc:   '2026-08-24T07:00:00Z',
  },
  signum: {
    name: 'SIGNUM HQ',
    url: 'https://www.producthunt.com/products/signum-hq?launch=signum-hq',
    startUtc: '2026-08-30T07:00:00Z',
    endUtc:   '2026-08-31T07:00:00Z',
  },
  wim: {
    name: "Why'd It Move?",
    url: 'https://www.producthunt.com/products/why-d-it-move?launch=why-d-it-move',
    startUtc: '2026-08-29T07:00:00Z',
    endUtc:   '2026-08-30T07:00:00Z',
  },
};

/** 지금이 그 앱의 런치 당일인가. 아니면 null. */
export function activeLaunch(app: PhApp, now: Date = new Date()): Launch | null {
  const l = PH_LAUNCHES[app];
  const t = now.getTime();
  return t >= Date.parse(l.startUtc) && t < Date.parse(l.endUtc) ? l : null;
}

/** 홈처럼 «아무 앱이나» 걸릴 수 있는 자리는 오늘 열려 있는 것 하나를 준다. */
export function anyActiveLaunch(now: Date = new Date()): (Launch & { app: PhApp }) | null {
  for (const app of Object.keys(PH_LAUNCHES) as PhApp[]) {
    const l = activeLaunch(app, now);
    if (l) return { ...l, app };
  }
  return null;
}

export const LABEL: Record<string, { live: string; cta: string }> = {
  en: { live: 'We are live on Product Hunt today', cta: 'See the launch' },
  ko: { live: '오늘 프로덕트헌트에 올라왔습니다', cta: '런치 보러가기' },
  ja: { live: '本日 Product Hunt に掲載されています', cta: 'ローンチを見る' },
};
