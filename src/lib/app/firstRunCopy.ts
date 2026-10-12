// ============================================================================
// 첫 실행 «가치 먼저» — 새 단계의 화면 글자 (2026-10-12)
// ----------------------------------------------------------------------------
// 법적 고지 단계의 글(AppFirstRunOnboarding COPY)은 한 글자도 바꾸지 않는다 — 이 파일은 «새 단계»(가치·알림)의 글만 가진다.
// 규칙(시험 tests/firstRunValue.test.ts 가 고정):
//   · 금융 공통어(Put Floor · Max Pain · Call Wall)는 한·일 화면에서도 번역하지 않는다(대표 10/8).
//   · 투자 권유·예측·수익 약속 문구 없음(매수·매도·추천·목표가·예측·전망 / buy·sell·recommend·forecast·will / 買い·売り·推奨·予測·見通し).
//   · 면책·출처 표기를 새로 덧붙이지 않는다(약관으로 처리) — 알림 단계의 안내문은 «옛 2/2 단계의 글 그대로»(AppFirstRunOnboarding COPY.alertBody).
//   · 실적 줄·옵션 반영 변동폭 줄의 글은 앱 실적 화면·내 종목 칩과 같은 말(lib/app/firstRunValue · lib/earnings/earningsImplied).
//   · 알림 설명은 «실제로 오는 알림»만: 모닝 브리프·장마감 리포트(시장 전체 요약) — 종목별 알림이 아니다(내 종목 알림은 미출시).
// ============================================================================

import type { WlLocale } from '@/lib/app/watchlistInsights';

export interface FirstRunCopy {
  value: {
    /** «{n} / {total} · 내 종목» — 번호는 부르는 쪽이 채운다 */
    stepLabel: (n: number, total: number) => string;
    title: string;
    subtitle: string;
    searchPh: string;
    searchLabel: string;
    popular: string;
    counter: (n: number, max: number) => string;
    full: string;
    searchBusy: string;
    searchNone: string;
    searchFail: string;
    empty: string;
    /** 지도 읽는 법 한 줄의 «가격» 말 */
    price: string;
    mapAria: string;
    loading: string;
    remove: (t: string) => string;
    cta: (n: number) => string;
    ctaNone: string;
    skip: string;
    aiAria: string;
  };
  notif: {
    /** 번호 없이 «선택 · 알림» — 법적 고지 «1 / 2»와 가치 «2 / 2» 뒤에 오는 건너뛸 수 있는 마지막 화면 */
    stepLabel: () => string;
    title: string;
    subtitle: string;
    rows: Array<{ icon: string; title: string; text: string }>;
    /** 옛 2/2 알림 단계의 안내문 — 글자 그대로 */
    notice: string;
    noticeTitle: string;
    allow: string;
    later: string;
  };
}

const KO: FirstRunCopy = {
  value: {
    stepLabel: (n, total) => `${n} / ${total} · 내 종목`,
    title: '관심 종목을 골라 보세요',
    subtitle: '1~3개를 고르면 오늘의 옵션 지형이 바로 나옵니다.',
    searchPh: '종목명 또는 티커',
    searchLabel: '종목 검색',
    popular: '인기 종목',
    counter: (n, max) => `${n}/${max} 선택`,
    full: `최대 3개까지 고를 수 있어요`,
    searchBusy: '찾는 중…',
    searchNone: '결과가 없습니다. 종목명이나 티커를 다시 확인해 주세요.',
    searchFail: '검색하지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
    empty: '종목을 고르면 Put Floor–Max Pain–Call Wall 사이 지금 위치가 여기에 나옵니다.',
    price: '가격',
    mapAria: '옵션 지형 지도',
    loading: '불러오는 중',
    remove: (t) => `${t} 빼기`,
    cta: (n) => `내 종목에 ${n}개 담기`,
    ctaNone: '종목을 골라 주세요',
    skip: '건너뛰기',
    aiAria: 'AI 생성 문구',
  },
  notif: {
    stepLabel: () => '선택 · 알림',
    title: '아침 브리프와 마감 요약을 알림으로 받아 볼까요?',
    subtitle: '장마감 리포트와 주요 시장 브리핑이 생성되면 알림을 받을 수 있습니다.',
    rows: [
      { icon: '🌅', title: '모닝 브리프', text: '리스크와 매크로 요약' },
      { icon: '📊', title: '장마감 리포트', text: '섹터 및 핵심 종목 브리핑' },
    ],
    noticeTitle: '리포트 알림',
    notice: '알림은 정보 제공 목적의 리마인더입니다. 개인화된 투자 추천이나 매매 신호가 아니며, 언제든 기기 설정에서 변경할 수 있습니다.',
    allow: '알림 받기',
    later: '나중에',
  },
};

const EN: FirstRunCopy = {
  value: {
    stepLabel: (n, total) => `${n} / ${total} · My stocks`,
    title: 'Pick your stocks',
    subtitle: 'Pick 1–3 and see today’s options map right away.',
    searchPh: 'Company or ticker',
    searchLabel: 'Search stocks',
    popular: 'Popular',
    counter: (n, max) => `${n}/${max} selected`,
    full: 'Up to 3 stocks',
    searchBusy: 'Searching…',
    searchNone: 'No matches. Check the company name or ticker.',
    searchFail: 'Search failed. Please try again in a moment.',
    empty: 'Pick a stock to see where it sits between Put Floor, Max Pain and Call Wall.',
    price: 'Price',
    mapAria: 'Options map',
    loading: 'Loading',
    remove: (t) => `Remove ${t}`,
    cta: (n) => `Add ${n} to My Watchlist`,
    ctaNone: 'Pick a stock',
    skip: 'Skip',
    aiAria: 'AI-generated',
  },
  notif: {
    stepLabel: () => 'Optional · Notifications',
    title: 'Get the morning brief and closing report as alerts?',
    subtitle: 'Get notified when closing reports and major market briefings are generated.',
    rows: [
      { icon: '🌅', title: 'Morning Brief', text: 'Risk and macro summaries' },
      { icon: '📊', title: 'Closing Report', text: 'Sector and key ticker briefings' },
    ],
    noticeTitle: 'Report Alerts',
    notice: 'Notifications are informational reminders. They are not personalized investment recommendations or trading signals, and can be changed in settings at any time.',
    allow: 'Turn on alerts',
    later: 'Not now',
  },
};

const JA: FirstRunCopy = {
  value: {
    stepLabel: (n, total) => `${n} / ${total} · マイ銘柄`,
    title: '気になる銘柄を選んでください',
    subtitle: '1〜3銘柄を選ぶと、今日のオプションの地形がすぐに表示されます。',
    searchPh: '銘柄名またはティッカー',
    searchLabel: '銘柄を検索',
    popular: '人気銘柄',
    counter: (n, max) => `${n}/${max} 選択`,
    full: '最大3銘柄まで',
    searchBusy: '検索中…',
    searchNone: '結果がありません。銘柄名かティッカーをご確認ください。',
    searchFail: '検索できませんでした。しばらくしてからもう一度お試しください。',
    empty: '銘柄を選ぶと、Put Floor・Max Pain・Call Wallの間での現在位置がここに表示されます。',
    price: '価格',
    mapAria: 'オプションの地形マップ',
    loading: '読み込み中',
    remove: (t) => `${t}を外す`,
    cta: (n) => `${n}銘柄をマイ銘柄に追加`,
    ctaNone: '銘柄を選んでください',
    skip: 'スキップ',
    aiAria: 'AI生成',
  },
  notif: {
    stepLabel: () => '任意 · 通知',
    title: '朝のブリーフと引け後の要約を通知で受け取りますか？',
    subtitle: '引け後レポートや主要な市場ブリーフィングが生成されたときに通知を受け取れます。',
    rows: [
      { icon: '🌅', title: 'モーニングブリーフ', text: 'リスクとマクロの要約' },
      { icon: '📊', title: 'クロージングレポート', text: 'セクターと主要銘柄のブリーフィング' },
    ],
    noticeTitle: 'レポート通知',
    notice: '通知は情報提供目的のリマインダーです。個別の投資推奨や取引シグナルではなく、いつでも端末設定で変更できます。',
    allow: '通知を受け取る',
    later: '後で',
  },
};

const BY_LOC: Record<WlLocale, FirstRunCopy> = { ko: KO, en: EN, ja: JA };
export const firstRunCopy = (loc: WlLocale): FirstRunCopy => BY_LOC[loc] ?? EN;
