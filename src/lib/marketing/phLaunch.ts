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
    startUtc: '2026-08-26T07:00:00Z',
    endUtc:   '2026-08-27T07:00:00Z',
  },
  wim: {
    name: "Why'd It Move?",
    url: 'https://www.producthunt.com/products/why-d-it-move?launch=why-d-it-move',
    startUtc: '2026-08-30T07:00:00Z',
    endUtc:   '2026-08-31T07:00:00Z',
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
