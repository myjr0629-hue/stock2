'use client';

// ============================================================================
// Undercurrent — spin-off PROTOTYPE (news × money)  [v3: app-like views]
// ----------------------------------------------------------------------------
// COMPLETELY ISOLATED route + fresh bright-editorial system (NOT SIGNUM dark).
//
// v3 (user direction):
//  - VIEW TRANSITIONS, not one flat page: bottom tab bar (홈/괴리/큰손/스토리),
//    each tab a distinct full view + slide-up DETAIL view per story.
//  - DEEPER fusion: detail view translates our raw signals into plain bands
//    (off-exchange share, put/call insurance, squeeze pressure) + option level
//    map (support/magnet/resistance vs price) — all client-side from real data.
//  - Freshness: relative-time badges (방금/N시간 전) on every story.
//  - Ads designed in: native ad slots in lists; DETAIL deep-layer gated by a
//    REWARDED unlock (30s video) — the reward IS our unique money data (worth
//    watching for); interstitial reserved at view transitions (not in proto).
//    Hero story's deep layer is free (taste of the reward).
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ADS_LIVE, adsAvailable, initAds, showHomeBanner, maybeShowInterstitial, showRewarded } from './ads';

type Locale = 'ko' | 'en' | 'ja';
const normLocale = (l: unknown): Locale => (l === 'en' || l === 'ja' ? l : 'ko');

const T: Record<Locale, Record<string, string>> = {
  ko: {
    tagline: '뉴스 뒤에서 움직이는 돈',
    tabHome: '홈', tabDiv: '괴리', tabWhale: '큰손', tabStories: '스토리',
    pulseTitle: '지금 시장 기류',
    pulseB: '강세', pulseC: '경계', pulseD: '괴리',
    bullish: '돈: 강세', cautious: '돈: 경계', neutral: '돈: 중립',
    divergence: '뉴스 ≠ 돈',
    moneyTitle: '돈의 움직임',
    filingsTitle: '회사가 직접 밝힌 것', filingsSub: '언론이 아닌 SEC 공식 문서(8-K)에 회사가 스스로 적어낸 사실',
    secDiv: '괴리 시그널', secDivSub: '뉴스와 돈이 반대로 움직이는 곳',
    secWhale: '큰손 레이더', secWhaleSub: '기관이 장외에서 조용히 움직인 비중',
    whaleEmpty: '지금은 두드러진 장외 큰손 움직임이 없어요. 데이터는 장중에 계속 갱신됩니다.',
    secStories: '오늘의 스토리', secStoriesSub: '돈의 반응과 함께 읽는 뉴스',
    connected: '연결된 흐름', more: '더 보기',
    share: '공유', shareCopied: '링크가 복사되었어요', viewTicker: '이 종목 전체 보기', backdropNow: '지금 시장',
    pxToday: '오늘', pxSince: '보도 후',
    offExchange: '장외 거래 비중',
    deepTitle: '심층 머니 레이어',
    deepLockedTitle: '이 종목의 심층 데이터',
    deepLockedDesc: '기관 장외 비중 · 풋/콜 보험 · 스퀴즈 압력 · 옵션 가격 지도',
    unlockBtn: '심층 데이터 열기',
    unlockNote: '지금은 무료로 열람할 수 있어요',
    sigOff: '기관 장외 거래', sigPcr: '하락 보험(풋/콜)', sigSq: '스퀴즈 압력',
    bandNormal: '보통', bandHigh: '높음', bandVeryHigh: '매우 높음',
    pcrCall: '콜 우위 · 강세 성향', pcrBal: '균형', pcrPut: '풋 우위 · 방어적',
    sqLow: '낮음', sqMid: '중간', sqHigh: '높음',
    levels: '옵션 가격 지도', lvFloor: '방어선', lvMagnet: '자석', lvWall: '저항선', lvNow: '현재', ucDeeper: 'SIGNUM에서 전체 옵션 구조 →',
    ad: '광고 · 스폰서', adNative: '네이티브 광고 자리 — 콘텐츠와 같은 결',
    back: '뒤로', source: '출처',
    justNow: '방금 전', minAgo: '분 전', hrAgo: '시간 전', dayAgo: '일 전',
    breaking: '속보', breakingCenter: '속보 센터',
    breakingSub: '최근 2시간 내 새 소식',
    breakingEmpty: '지금은 새 속보가 없어요.',
    pushSoon: '속보 푸시 알림은 곧 제공될 예정이에요.',
    topics: '지금 토픽',
    edMorning: '모닝 에디션', edAfternoon: '애프터눈 에디션', edEvening: '이브닝 에디션',
    tabMacro: '매크로',
    macroTitle: '세계 → 시장', macroSub: '시장을 흔드는 거시·지정학 속보',
    macroReadTitle: '지금 매크로 기류',
    riskOn: '위험선호', riskOff: '위험회피', mixed: '혼재',
    ctx10Y: '10년물 금리', ctxFed: '동결 확률', ctxFG: '공포·탐욕', ctxFomc: 'FOMC까지', ctxNasdaq: '나스닥', ctxDow: '다우',
    macroTeaser: '시장을 흔드는 큰 그림',
    tabSearch: '검색',
    searchPh: '티커 검색 (예: NVDA)',
    popular: '인기 티커', recent: '최근 검색',
    tickerReadTitle: '지금 이 종목의 돈', tickerNews: '이 종목의 뉴스',
    searchEmpty: '검색 결과가 없어요. 티커를 확인해 주세요.',
    searchBusy: '종목의 돈을 읽는 중…',
    storiesAll: '전체',
    loading: '돈의 흐름을 읽는 중…',
    error: '불러오지 못했어요. 잠시 후 다시 시도해 주세요.',
    disclaimer: '교육·정보 목적의 시장 데이터입니다. 투자 조언이 아니며 정확성을 보장하지 않습니다.',
    covRead: '읽음', covToday: '오늘의 에디션',
    closeDoneTitle: '오늘 치 끝!', closeDoneSub: '가볍게 닫으셔도 됩니다 — 새 소식은 다음 에디션에 담아둘게요.',
    closeProgress: '아직 안 읽은 카드가 있어요', closeNext: '다음 에디션',
    moreBrowse: '더 둘러보기',
    sbTitle: '괴리 스코어보드', sbSub: '뉴스와 돈이 갈렸을 때, 사흘 뒤 누가 맞았나',
    sbMoney: '돈', sbNews: '뉴스', sbFlat: '무승부', sbTracking: '추적 중',
    sbMoneyWin: '돈이 맞았다', sbNewsWin: '뉴스가 맞았다', sbFlatRes: '무승부',
    sbEmpty: '괴리 시그널을 추적하기 시작했어요. 첫 판정은 시그널 발생 3거래일 뒤에 나옵니다.',
    sbD3: 'D+3 판정',
    jdTitle: '이번 주 심판일', jdSub: '예정된 실적 발표 — 이야기가 숫자로 검증되는 날',
    jdEarnings: '실적 발표', jdToday: '오늘', jdTomorrow: '내일',
    insiderTitle: '내부자 매매 · 최근 30일',
    insiderBuys: '매수', insiderSells: '매도', insiderNetBuy: '순매수', insiderNetSell: '순매도',
    unlockFreeBtn: '오늘 첫 열람 무료 · 바로 열기',
    unlockFreeNote: '하루 한 종목은 광고 없이 열립니다',
    unlockAdBtn: '광고 보고 무료로 열기',
    adLoading: '광고 불러오는 중…',
    stTitle: '설정',
    stLang: '언어', stLangSub: '앱 표시 언어',
    stNotif: '속보 푸시 알림', stNotifSub: '곧 제공될 예정이에요', stSoon: '준비 중',
    stRate: '앱 평가하기', stRateSub: '별점 한 번이 큰 힘이 됩니다',
    stPolicy: '약관 및 정책',
    stPrivacy: '개인정보처리방침', stTerms: '이용약관',
    stVersion: '버전',
  },
  en: {
    tagline: 'The money moving behind the news',
    tabHome: 'Home', tabDiv: 'Diverge', tabWhale: 'Whales', tabStories: 'Stories',
    pulseTitle: 'Market undercurrent now',
    pulseB: 'Bullish', pulseC: 'Cautious', pulseD: 'Diverging',
    bullish: 'Money: bullish', cautious: 'Money: cautious', neutral: 'Money: neutral',
    divergence: 'News ≠ Money',
    moneyTitle: 'What the money is doing',
    filingsTitle: 'Straight from the company', filingsSub: 'Facts the company itself filed with the SEC (8-K) — not the press',
    secDiv: 'Divergence signals', secDivSub: 'Where news and money point opposite ways',
    secWhale: 'Whale radar', secWhaleSub: 'Institutional off-exchange share',
    whaleEmpty: 'No standout off-exchange activity right now. Data refreshes through the session.',
    secStories: "Today's stories", secStoriesSub: 'News read together with the money',
    connected: 'Connected flows', more: 'See all',
    share: 'Share', shareCopied: 'Link copied', viewTicker: 'See all on this ticker', backdropNow: 'The market now',
    pxToday: 'today', pxSince: 'since the news',
    offExchange: 'off-exchange share',
    deepTitle: 'Deep money layer',
    deepLockedTitle: 'Deep data for this ticker',
    deepLockedDesc: 'Institutional share · put/call insurance · squeeze · option price map',
    unlockBtn: 'Open the deep data',
    unlockNote: 'Free to open for now',
    sigOff: 'Institutional off-exchange', sigPcr: 'Downside insurance (put/call)', sigSq: 'Squeeze pressure',
    bandNormal: 'Normal', bandHigh: 'High', bandVeryHigh: 'Very high',
    pcrCall: 'Call-heavy · bullish lean', pcrBal: 'Balanced', pcrPut: 'Put-heavy · defensive',
    sqLow: 'Low', sqMid: 'Medium', sqHigh: 'High',
    levels: 'Option price map', lvFloor: 'Floor', lvMagnet: 'Magnet', lvWall: 'Wall', lvNow: 'Now', ucDeeper: 'Full options structure in SIGNUM →',
    ad: 'Ad · Sponsored', adNative: 'Native ad slot — matches content style',
    back: 'Back', source: 'Source',
    justNow: 'just now', minAgo: 'm ago', hrAgo: 'h ago', dayAgo: 'd ago',
    breaking: 'Breaking', breakingCenter: 'Breaking center',
    breakingSub: 'New in the last 2 hours',
    breakingEmpty: 'No fresh breaking news right now.',
    pushSoon: 'Breaking push alerts are coming soon.',
    topics: 'Topics now',
    edMorning: 'Morning edition', edAfternoon: 'Afternoon edition', edEvening: 'Evening edition',
    tabMacro: 'Macro',
    macroTitle: 'World → Market', macroSub: 'Macro & geopolitical news shaking markets',
    macroReadTitle: 'Macro undercurrent now',
    riskOn: 'Risk-on', riskOff: 'Risk-off', mixed: 'Mixed',
    ctx10Y: '10Y yield', ctxFed: 'Hold odds', ctxFG: 'Fear & Greed', ctxFomc: 'To FOMC', ctxNasdaq: 'NASDAQ', ctxDow: 'Dow',
    macroTeaser: 'The big picture moving markets',
    tabSearch: 'Search',
    searchPh: 'Search ticker (e.g. NVDA)',
    popular: 'Popular tickers', recent: 'Recent',
    tickerReadTitle: 'The money on this name now', tickerNews: 'News on this name',
    searchEmpty: 'No results. Check the ticker.',
    searchBusy: 'Reading the money on this name…',
    storiesAll: 'All',
    loading: 'Reading the money flow…',
    error: 'Could not load. Please try again shortly.',
    disclaimer: 'Educational market information only. Not investment advice; accuracy not guaranteed.',
    covRead: 'read', covToday: "Today's edition",
    closeDoneTitle: "You're all caught up", closeDoneSub: 'Feel free to close the app — fresh stories land in the next edition.',
    closeProgress: 'A few cards left to read', closeNext: 'Next edition',
    moreBrowse: 'Keep browsing',
    sbTitle: 'Divergence scoreboard', sbSub: 'When news and money split — who was right 3 days later',
    sbMoney: 'Money', sbNews: 'News', sbFlat: 'Draw', sbTracking: 'Tracking',
    sbMoneyWin: 'Money was right', sbNewsWin: 'News was right', sbFlatRes: 'Draw',
    sbEmpty: 'Now tracking divergence signals. First verdicts arrive 3 trading days after each signal.',
    sbD3: 'D+3 verdict',
    jdTitle: "This week's judgment days", jdSub: 'Scheduled earnings — where the story meets the numbers',
    jdEarnings: 'Earnings', jdToday: 'Today', jdTomorrow: 'Tomorrow',
    insiderTitle: 'Insider trades · last 30 days',
    insiderBuys: 'buys', insiderSells: 'sells', insiderNetBuy: 'net buying', insiderNetSell: 'net selling',
    unlockFreeBtn: "Today's first unlock is free · open now",
    unlockFreeNote: 'One ticker a day opens without an ad',
    unlockAdBtn: 'Watch an ad to unlock free',
    adLoading: 'Loading ad…',
    stTitle: 'Settings',
    stLang: 'Language', stLangSub: 'App display language',
    stNotif: 'Breaking push alerts', stNotifSub: 'Coming soon', stSoon: 'Soon',
    stRate: 'Rate the app', stRateSub: 'A quick rating helps a lot',
    stPolicy: 'Legal',
    stPrivacy: 'Privacy Policy', stTerms: 'Terms of Service',
    stVersion: 'Version',
  },
  ja: {
    tagline: 'ニュースの裏で動くお金',
    tabHome: 'ホーム', tabDiv: '乖離', tabWhale: '大口', tabStories: 'ストーリー',
    pulseTitle: 'いまの市場の底流',
    pulseB: '強気', pulseC: '警戒', pulseD: '乖離',
    bullish: 'マネー: 強気', cautious: 'マネー: 警戒', neutral: 'マネー: 中立',
    divergence: 'ニュース ≠ マネー',
    moneyTitle: 'お金の動き',
    filingsTitle: '企業が自ら明かしたこと', filingsSub: '報道ではなくSEC公式文書(8-K)に企業自身が記した事実',
    secDiv: '乖離シグナル', secDivSub: 'ニュースとお金が逆方向の銘柄',
    secWhale: '大口レーダー', secWhaleSub: '機関投資家の場外取引シェア',
    whaleEmpty: '今、目立った場外の大口の動きはありません。データは取引時間中に更新されます。',
    secStories: '今日のストーリー', secStoriesSub: 'お金の反応と一緒に読むニュース',
    connected: 'つながる流れ', more: 'すべて見る',
    share: 'シェア', shareCopied: 'リンクをコピーしました', viewTicker: 'この銘柄をすべて見る', backdropNow: 'いまの市場',
    pxToday: '本日', pxSince: '報道後',
    offExchange: '場外取引シェア',
    deepTitle: 'ディープ・マネーレイヤー',
    deepLockedTitle: 'この銘柄のディープデータ',
    deepLockedDesc: '機関シェア · プット/コール保険 · スクイーズ · オプション価格マップ',
    unlockBtn: 'ディープデータを開く',
    unlockNote: '今は無料でご覧いただけます',
    sigOff: '機関の場外取引', sigPcr: '下落保険(プット/コール)', sigSq: 'スクイーズ圧力',
    bandNormal: '普通', bandHigh: '高い', bandVeryHigh: '非常に高い',
    pcrCall: 'コール優勢 · 強気', pcrBal: '均衡', pcrPut: 'プット優勢 · 防御的',
    sqLow: '低い', sqMid: '中間', sqHigh: '高い',
    levels: 'オプション価格マップ', lvFloor: '防衛線', lvMagnet: '磁石', lvWall: '抵抗線', lvNow: '現在', ucDeeper: 'SIGNUMで全オプション構造 →',
    ad: '広告 · スポンサー', adNative: 'ネイティブ広告枠 — コンテンツと同じトーン',
    back: '戻る', source: '出典',
    justNow: 'たった今', minAgo: '分前', hrAgo: '時間前', dayAgo: '日前',
    breaking: '速報', breakingCenter: '速報センター',
    breakingSub: '直近2時間の新着',
    breakingEmpty: 'いまは新しい速報がありません。',
    pushSoon: '速報プッシュ通知は近日提供予定です。',
    topics: 'いまのトピック',
    edMorning: 'モーニング版', edAfternoon: 'アフタヌーン版', edEvening: 'イブニング版',
    tabMacro: 'マクロ',
    macroTitle: '世界 → 市場', macroSub: '市場を揺らすマクロ・地政学ニュース',
    macroReadTitle: 'いまのマクロ底流',
    riskOn: 'リスクオン', riskOff: 'リスクオフ', mixed: '混在',
    ctx10Y: '10年債利回り', ctxFed: '据え置き確率', ctxFG: '恐怖・強欲', ctxFomc: 'FOMCまで', ctxNasdaq: 'ナスダック', ctxDow: 'ダウ',
    macroTeaser: '市場を動かす大きな流れ',
    tabSearch: '検索',
    searchPh: 'ティッカー検索 (例: NVDA)',
    popular: '人気ティッカー', recent: '最近の検索',
    tickerReadTitle: 'いまこの銘柄のお金', tickerNews: 'この銘柄のニュース',
    searchEmpty: '結果がありません。ティッカーをご確認ください。',
    searchBusy: 'この銘柄のマネーを読み取り中…',
    storiesAll: 'すべて',
    loading: 'マネーフローを読み取り中…',
    error: '読み込めませんでした。しばらくして再試行してください。',
    disclaimer: '教育・情報目的の市場データです。投資助言ではなく、正確性は保証されません。',
    covRead: '既読', covToday: '今日のエディション',
    closeDoneTitle: '今日の分はおしまい', closeDoneSub: 'アプリを閉じても大丈夫 — 新しい話は次のエディションでお届けします。',
    closeProgress: 'まだ読んでいないカードがあります', closeNext: '次のエディション',
    moreBrowse: 'もっと見る',
    sbTitle: '乖離スコアボード', sbSub: 'ニュースとお金が割れた時、3日後どちらが正しかったか',
    sbMoney: 'マネー', sbNews: 'ニュース', sbFlat: '引き分け', sbTracking: '追跡中',
    sbMoneyWin: 'マネーが正しかった', sbNewsWin: 'ニュースが正しかった', sbFlatRes: '引き分け',
    sbEmpty: '乖離シグナルの追跡を開始しました。最初の判定はシグナルから3営業日後に出ます。',
    sbD3: 'D+3判定',
    jdTitle: '今週の審判日', jdSub: '決算発表の予定 — 物語が数字で検証される日',
    jdEarnings: '決算発表', jdToday: '今日', jdTomorrow: '明日',
    insiderTitle: 'インサイダー売買 · 直近30日',
    insiderBuys: '買い', insiderSells: '売り', insiderNetBuy: '純買い', insiderNetSell: '純売り',
    unlockFreeBtn: '本日最初の閲覧は無料 · 今すぐ開く',
    unlockFreeNote: '1日1銘柄は広告なしで開けます',
    unlockAdBtn: '広告を見て無料で開く',
    adLoading: '広告を読み込み中…',
    stTitle: '設定',
    stLang: '言語', stLangSub: 'アプリの表示言語',
    stNotif: '速報プッシュ通知', stNotifSub: '近日提供予定です', stSoon: '準備中',
    stRate: 'アプリを評価する', stRateSub: '評価が大きな励みになります',
    stPolicy: '規約とポリシー',
    stPrivacy: 'プライバシーポリシー', stTerms: '利用規約',
    stVersion: 'バージョン',
  },
};

const C = {
  bg: '#F6F3ED', card: '#FFFFFF', ink: '#17191E', sub: '#5C6470', faint: '#9AA1AB',
  line: 'rgba(23,25,30,0.08)',
  emerald: '#0B8A5C', emeraldBg: '#E4F3EC', emeraldDeep: '#07553A',
  amber: '#B45309', amberBg: '#FBEEDC',
  neutral: '#5C6470', neutralBg: '#EEECE6',
  diverge: '#C2410C', divergeBg: '#FDE8DC',
  shadow: '0 10px 30px rgba(23,25,30,0.07)',
};

// All edition/date logic is US-market (ET) based, so KO/JP readers see the SAME
// edition boundary and calendar day as the market — not their local clock. Without
// this a Seoul user at 01:00 KST (≈12:00 ET) saw "Morning edition" on the wrong day.
function etNow(): { hour: number; isoDate: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour12: false, hour: '2-digit',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  let hour = parseInt(get('hour'), 10);
  if (hour === 24) hour = 0; // Intl can emit '24' at ET midnight
  return { hour, isoDate: `${get('year')}-${get('month')}-${get('day')}` };
}

// Bottom-nav line icons (inherit stroke from the parent <svg>). Keyed by Tab.
const TAB_ICONS: Record<string, React.ReactElement> = {
  home: <><path d="M3 9.5 12 3l9 6.5V20a1 1 0 0 1-1 1h-4v-6H8v6H4a1 1 0 0 1-1-1z" /></>,
  macro: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3c2.5 2.4 3.8 5.6 3.8 9s-1.3 6.6-3.8 9c-2.5-2.4-3.8-5.6-3.8-9S9.5 5.4 12 3z" /></>,
  div: <><circle cx="6" cy="18" r="2.4" /><circle cx="18" cy="6" r="2.4" /><path d="M6 15.6V8a2 2 0 0 1 2-2h7.6" /><path d="m13 4 2.8 2L13 8" /></>,
  whale: <><path d="M18 20V9" /><path d="M12 20V4" /><path d="M6 20v-6" /></>,
  stories: <><path d="M3 5a1 1 0 0 1 1-1h5a2.5 2.5 0 0 1 2.5 2.5V20a2 2 0 0 0-2-2H4a1 1 0 0 1-1-1z" /><path d="M21 5a1 1 0 0 0-1-1h-5a2.5 2.5 0 0 0-2.5 2.5V20a2 2 0 0 1 2-2h5a1 1 0 0 0 1-1z" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20.5 20.5-4-4" /></>,
};

interface Money {
  darkPoolPct: number | null; oiPcr: number | null; volumePcr: number | null;
  squeezeScore: number | null; maxPain: number | null; callWall: number | null;
  putFloor: number | null; price: number | null;
}
interface Card {
  ticker: string; tag: string | null; plainTitle: string; whyItMatters: string | null;
  moneyRead: string | null; moneyMood: 'bullish' | 'cautious' | 'neutral';
  divergence: boolean; hasMoneyData: boolean; money: Money;
  image: string | null; source: string | null; url: string | null; publishedAt: string | null;
}
interface Feed {
  success: boolean;
  pulse?: { bullish: number; cautious: number; neutral: number; divergences: number };
  cards?: Card[];
}
type Tab = 'home' | 'macro' | 'div' | 'whale' | 'stories' | 'search';

interface MacroCard {
  tag: string | null; plainTitle: string; whyItMatters: string | null;
  marketImpact: 'risk-on' | 'risk-off' | 'mixed'; impactNote: string | null;
  image: string | null; source: string | null; url: string | null; publishedAt: string | null;
}
interface MacroResult {
  success: boolean;
  context: {
    nasdaq?: number | null; nasdaqChangePct?: number | null;
    dow?: number | null; dowChangePct?: number | null;
    yield10Y: number | null; yield10YChange: number | null;
    fedNoChange: number | null; fedHike: number | null; fedEase: number | null;
    daysUntilFomc: number | null; fearGreed: number | null; fearGreedRating: string | null;
  };
  macroRead: string | null;
  cards: MacroCard[];
}

interface TickerResult {
  success: boolean;
  ticker: string;
  money: Money;
  hasMoneyData: boolean;
  tickerRead: string | null;
  cards: Card[];
}

const POPULAR_TICKERS = ['NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMZN', 'META', 'GOOGL', 'AMD', 'PLTR', 'COIN'];
const RECENT_KEY = 'uc_recent_tickers';

function moodStyle(mood: Card['moneyMood']) {
  if (mood === 'bullish') return { color: C.emerald, bg: C.emeraldBg, arrow: '↑' };
  if (mood === 'cautious') return { color: C.amber, bg: C.amberBg, arrow: '↓' };
  return { color: C.neutral, bg: C.neutralBg, arrow: '–' };
}

function freshness(iso: string | null, t: Record<string, string>): { label: string; fresh: boolean } | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const min = Math.floor(ms / 60000);
  if (min < 2) return { label: t.justNow, fresh: true };
  if (min < 60) return { label: `${min}${t.minAgo}`, fresh: true };
  const hr = Math.floor(min / 60);
  if (hr < 24) return { label: `${hr}${t.hrAgo}`, fresh: hr <= 6 };
  return { label: `${Math.floor(hr / 24)}${t.dayAgo}`, fresh: false };
}

function FreshBadge({ iso, t }: { iso: string | null; t: Record<string, string> }) {
  const f = freshness(iso, t);
  if (!f) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 750 as any,
      color: f.fresh ? C.emerald : C.faint,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: f.fresh ? C.emerald : C.faint, display: 'inline-block' }} />
      {f.label}
    </span>
  );
}

function MoodBadge({ mood, t, small }: { mood: Card['moneyMood']; t: Record<string, string>; small?: boolean }) {
  const s = moodStyle(mood);
  const label = mood === 'bullish' ? t.bullish : mood === 'cautious' ? t.cautious : t.neutral;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: small ? 10.5 : 12, fontWeight: 700, color: s.color, background: s.bg,
      padding: small ? '3px 8px' : '5px 10px', borderRadius: 999, whiteSpace: 'nowrap',
    }}>
      <span aria-hidden>{s.arrow}</span>{label}
    </span>
  );
}

function DivBadge({ t, small }: { t: Record<string, string>; small?: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      fontSize: small ? 10 : 11.5, fontWeight: 800, color: '#fff', background: C.diverge,
      padding: small ? '3px 8px' : '5px 10px', borderRadius: 999, letterSpacing: '0.02em', whiteSpace: 'nowrap',
    }}>
      {t.divergence}
    </span>
  );
}

// ── real company symbol shown before the ticker (branding icon via our own
//    proxy /api/undercurrent/logo; the raw URL needs our API key). Monogram
//    fallback keeps layout identical when a name has no logo. ──
function TickerLogo({ ticker, size = 18 }: { ticker: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const box = {
    width: size, height: size, minWidth: size, minHeight: size, borderRadius: '50%',
    flexShrink: 0, overflow: 'hidden', background: '#fff', border: `1px solid ${C.line}`,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  } as const;
  if (failed) {
    return (
      <span aria-hidden style={{ ...box, background: C.neutralBg, color: C.sub, fontSize: Math.round(size * 0.52), fontWeight: 900, lineHeight: 1 }}>
        {ticker[0]}
      </span>
    );
  }
  return (
    <span aria-hidden style={box}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/undercurrent/logo?t=${ticker}`} alt=""
        onError={() => setFailed(true)}
        style={{ width: '78%', height: '78%', objectFit: 'contain', display: 'block' }}
      />
    </span>
  );
}

function ImpactBadge({ impact, t }: { impact: MacroCard['marketImpact']; t: Record<string, string> }) {
  const s = impact === 'risk-on'
    ? { label: t.riskOn, color: C.emerald, bg: C.emeraldBg }
    : impact === 'risk-off'
      ? { label: t.riskOff, color: '#fff', bg: C.diverge }
      : { label: t.mixed, color: C.neutral, bg: C.neutralBg };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', fontSize: 10.5, fontWeight: 800,
      color: s.color, background: s.bg, padding: '3px 9px', borderRadius: 999, whiteSpace: 'nowrap',
    }}>{s.label}</span>
  );
}

function SectionHead({ title, sub, color }: { title: string; sub: string; color: string }) {
  return (
    <div style={{ margin: '22px 2px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 3, background: color, display: 'inline-block' }} />
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 850 as any, letterSpacing: '-0.02em' }}>{title}</h2>
      </div>
      <div style={{ fontSize: 12.5, color: C.faint, fontWeight: 550 as any, marginTop: 3, marginLeft: 16 }}>{sub}</div>
    </div>
  );
}

function NativeAdSlot({ t }: { t: Record<string, string> }) {
  return (
    <div style={{
      marginTop: 11, background: C.card, borderRadius: 18, border: `1px dashed rgba(23,25,30,0.18)`,
      padding: 14, display: 'flex', gap: 12, alignItems: 'center',
    }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: C.neutralBg, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', color: C.faint, marginBottom: 3 }}>{t.ad.toUpperCase()}</div>
        <div style={{ fontSize: 13, fontWeight: 650 as any, color: C.sub }}>{t.adNative}</div>
      </div>
    </div>
  );
}

// ── deep money layer (the rewarded-unlock content) ──
function bandOff(v: number, t: Record<string, string>) {
  return v > 50 ? { label: t.bandVeryHigh, color: C.diverge } : v >= 30 ? { label: t.bandHigh, color: C.amber } : { label: t.bandNormal, color: C.emerald };
}
function bandPcr(v: number, t: Record<string, string>) {
  return v > 1.2 ? { label: t.pcrPut, color: C.amber } : v < 0.8 ? { label: t.pcrCall, color: C.emerald } : { label: t.pcrBal, color: C.neutral };
}
function bandSq(v: number, t: Record<string, string>) {
  return v > 60 ? { label: t.sqHigh, color: C.diverge } : v >= 20 ? { label: t.sqMid, color: C.amber } : { label: t.sqLow, color: C.emerald };
}

function SignalRow({ name, value, band }: { name: string; value: string; band: { label: string; color: string } }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderBottom: `1px solid ${C.line}` }}>
      <span style={{ fontSize: 12.5, color: C.sub, fontWeight: 600 }}>{name}</span>
      <span style={{ marginLeft: 'auto', fontSize: 13.5, fontWeight: 850 as any, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <span style={{ fontSize: 10.5, fontWeight: 800, color: band.color, background: `${band.color}18`, padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap' }}>{band.label}</span>
    </div>
  );
}

function LevelMap({ m, t }: { m: Money; t: Record<string, string> }) {
  const pts = [
    { key: 'floor', label: t.lvFloor, v: m.putFloor, color: C.emerald },
    { key: 'magnet', label: t.lvMagnet, v: m.maxPain, color: C.neutral },
    { key: 'wall', label: t.lvWall, v: m.callWall, color: C.amber },
    { key: 'now', label: t.lvNow, v: m.price, color: C.ink },
  ].filter((p) => typeof p.v === 'number' && (p.v as number) > 0) as { key: string; label: string; v: number; color: string }[];
  if (pts.length < 3) return null;
  const vals = pts.map((p) => p.v);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const pos = (v: number) => 6 + ((v - min) / span) * 88; // %
  const levels = pts.filter((p) => p.key !== 'now');
  const now = pts.find((p) => p.key === 'now');
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', color: C.sub, marginBottom: 16 }}>{t.levels.toUpperCase()}</div>
      <div style={{ position: 'relative', height: now ? 64 : 48 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 21, height: 4, borderRadius: 99, background: 'linear-gradient(90deg, #DDEEE5, #EEECE6, #F3E3D2)' }} />
        {levels.map((p) => (
          <div key={p.key} style={{ position: 'absolute', left: `${pos(p.v)}%`, top: 0, transform: 'translateX(-50%)', textAlign: 'center' }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, color: p.color, whiteSpace: 'nowrap' }}>{p.label}</div>
            <div style={{ width: 9, height: 9, borderRadius: '50%', background: p.color, margin: '6px auto 3px' }} />
            <div style={{ fontSize: 9.5, fontWeight: 750 as any, color: C.sub, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>${Math.round(p.v)}</div>
          </div>
        ))}
        {now && (
          <>
            {/* current-price marker sits ON the track; its label lives on its own
                row below so it can never collide with a nearby level's text */}
            <div style={{ position: 'absolute', left: `${pos(now.v)}%`, top: 17, transform: 'translateX(-50%)' }}>
              <div style={{ width: 13, height: 13, borderRadius: '50%', background: now.color, boxShadow: '0 0 0 4px rgba(23,25,30,0.12)' }} />
            </div>
            <div style={{
              position: 'absolute', top: 46,
              left: `clamp(0%, calc(${pos(now.v)}% - 34px), calc(100% - 68px))`,
              width: 68, textAlign: 'center',
              fontSize: 10, fontWeight: 850 as any, color: now.color, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
            }}>
              {now.label} ${Math.round(now.v)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DeepLayer({ c, t }: { c: Card; t: Record<string, string> }) {
  const m = c.money || ({} as Money);
  const pcr = m.oiPcr ?? m.volumePcr;
  return (
    <div style={{ marginTop: 4 }}>
      {typeof m.darkPoolPct === 'number' && (
        <SignalRow name={t.sigOff} value={`${Math.round(m.darkPoolPct)}%`} band={bandOff(m.darkPoolPct, t)} />
      )}
      {typeof pcr === 'number' && (
        <SignalRow name={t.sigPcr} value={pcr.toFixed(2)} band={bandPcr(pcr, t)} />
      )}
      {typeof m.squeezeScore === 'number' && (
        <SignalRow name={t.sigSq} value={String(Math.round(m.squeezeScore))} band={bandSq(m.squeezeScore, t)} />
      )}
      <LevelMap m={m} t={t} />
      {/* UC → SIGNUM: soft "go deeper" for users already viewing the options layer.
          One-way + minimal per the portfolio verdict — never a promo card. */}
      <a
        href="https://www.signumhq.com/app?from=uc_ticker"
        target="_blank"
        rel="noopener noreferrer"
        style={{ display: 'block', marginTop: 16, textAlign: 'center', fontSize: 11, fontWeight: 700, color: C.sub, textDecoration: 'none', letterSpacing: '0.01em' }}
      >
        {t.ucDeeper}
      </a>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
export default function UndercurrentPage() {
  const params = useParams();
  const router = useRouter();
  const loc = normLocale((params as any)?.locale);
  const t = T[loc];

  // [SHELL] device-locale bootstrap — the native shell always opens /en/…;
  // route once to the user's saved or device language (mirrors app-view).
  useEffect(() => {
    try {
      const saved = localStorage.getItem('undercurrent.locale');
      const dev = (navigator.language || 'en').slice(0, 2).toLowerCase();
      const want = saved && ['ko', 'en', 'ja'].includes(saved) ? saved
        : ['ko', 'en', 'ja'].includes(dev) ? dev : 'en';
      if (want !== loc) {
        // Router navigation only — window.location is treated as a top-level
        // navigation by Capacitor and opens an in-app Safari (SIGNUM lesson).
        router.replace(`/${want}/undercurrent${window.location.search}`);
      } else {
        localStorage.setItem('undercurrent.locale', loc);
      }
    } catch { /* storage unavailable */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // [SHELL] Android hardware back: detail → settings → breaking sheet → minimize.
  const backStateRef = useRef<{ detail: boolean; breaking: boolean; settings: boolean }>({ detail: false, breaking: false, settings: false });
  useEffect(() => {
    let remove: (() => void) | undefined;
    (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const isNative = require('@capacitor/core').Capacitor.isNativePlatform();
        if (!isNative) return;
        const AppMod: any = await import('@capacitor/app');
        const h = await AppMod.App.addListener('backButton', () => {
          if (backStateRef.current.detail) { setDetail(null); if (adsAvailable()) maybeShowInterstitial(); return; }
          if (backStateRef.current.settings) { setShowSettings(false); return; }
          if (backStateRef.current.breaking) { setShowBreaking(false); return; }
          AppMod.App.minimizeApp();
        });
        remove = () => { try { h.remove(); } catch { /* noop */ } };
      } catch { /* web */ }
    })();
    return () => { remove?.(); };
  }, []);

  const [feed, setFeed] = useState<Feed | null>(null);
  const [err, setErr] = useState(false);
  const [tab, setTab] = useState<Tab>('home');
  const [detail, setDetail] = useState<Card | null>(null);
  // 8-K official filings per ticker — "회사가 직접 밝힌 것" card in the detail view.
  // null = not loaded yet; [] = loaded, none (section hidden). Reuses the shared
  // /api/stocks/disclosures endpoint (12h server cache, ETF-skip).
  const [filings, setFilings] = useState<Record<string, { date: string; label: Record<string, string>; summary: Record<string, string>; highImpact: boolean }[]>>({});
  // Insider Form-4 summary per ticker — the "회사·내부자의 행동" second layer
  const [insiders, setInsiders] = useState<Record<string, { buyCount: number; sellCount: number; net30d: number; latest: { name: string; title: string; code: string; value: number; date: string } | null } | null>>({});
  useEffect(() => {
    const tk = detail?.ticker;
    if (!tk || filings[tk]) return;
    let alive = true;
    fetch(`/api/stocks/disclosures?t=${tk}&insider=1`)
      .then((r) => (r.ok ? r.json() : { events: [] }))
      .then((j) => {
        if (!alive) return;
        setFilings((f) => ({ ...f, [tk]: Array.isArray(j?.events) ? j.events.slice(0, 3) : [] }));
        setInsiders((m) => ({ ...m, [tk]: j?.insider && (j.insider.buyCount || j.insider.sellCount) ? j.insider : null }));
      })
      .catch(() => { if (alive) setFilings((f) => ({ ...f, [tk]: [] })); });
    return () => { alive = false; };
  }, [detail?.ticker]); // eslint-disable-line react-hooks/exhaustive-deps
  // Quiet price strip for the detail sheet: current price + day% + "% since the news"
  // (reference = first bar after publishedAt — see /api/undercurrent/price). Editorial,
  // no live ticks; cleared on story switch so a previous ticker's price never flashes.
  const [detailPx, setDetailPx] = useState<{ price: number; dayPct: number | null; sincePct: number | null } | null>(null);
  useEffect(() => {
    setDetailPx(null);
    const tk = detail?.ticker;
    if (!tk) return;
    let alive = true;
    const q = detail?.publishedAt ? `&since=${encodeURIComponent(detail.publishedAt)}` : '';
    fetch(`/api/undercurrent/price?t=${tk}${q}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j?.success || typeof j.price !== 'number') return;
        setDetailPx({ price: j.price, dayPct: typeof j.dayPct === 'number' ? j.dayPct : null, sincePct: typeof j.sincePct === 'number' ? j.sincePct : null });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [detail?.ticker, detail?.publishedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const [unlocked, setUnlocked] = useState<Record<string, boolean>>({});
  const [shareToast, setShareToast] = useState(false); // clipboard-fallback confirmation
  // ── ticker search state ──
  const [searchQ, setSearchQ] = useState('');
  const lastSearchRef = useRef(''); // guards the _stale bg-refresh swap against a newer search
  const [searchRes, setSearchRes] = useState<TickerResult | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchErr, setSearchErr] = useState<'' | 'empty' | 'fail'>('');
  const [recents, setRecents] = useState<string[]>([]);
  const [storyTag, setStoryTag] = useState<string>(''); // '' = all (stories tab browse chips)
  const [macro, setMacro] = useState<MacroResult | null>(null);
  const [showBreaking, setShowBreaking] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  // keep the hardware-back handler's view of open layers current
  useEffect(() => { backStateRef.current = { detail: !!detail, breaking: showBreaking, settings: showSettings }; }, [detail, showBreaking, showSettings]);

  // [iOS] while a bottom sheet is open, LOCK the body — otherwise touches inside
  // the sheet rubber-band the page behind it and it settles displaced downward
  // (reported: masthead pushed down after opening 설정). Standard fixed-body lock
  // with scroll restore on close.
  const sheetOpen = showSettings || showBreaking;
  useEffect(() => {
    if (!sheetOpen) return;
    const y = window.scrollY;
    const b = document.body.style;
    const prev = { position: b.position, top: b.top, left: b.left, right: b.right, overflow: b.overflow };
    b.position = 'fixed'; b.top = `-${y}px`; b.left = '0'; b.right = '0'; b.overflow = 'hidden';
    return () => {
      b.position = prev.position; b.top = prev.top; b.left = prev.left; b.right = prev.right; b.overflow = prev.overflow;
      window.scrollTo(0, y);
    };
  }, [sheetOpen]);

  // ── [REVIEW] native in-app rating (official OS sheet — StoreKit / Play Core).
  // NEVER incentivized (store policy); asked at natural high points only, and
  // the OS itself decides whether the sheet actually appears.
  const [canRate, setCanRate] = useState(false);
  useEffect(() => {
    try {
      const cap = (window as any).Capacitor;
      setCanRate(!!(cap?.isNativePlatform?.() && cap?.Plugins?.InAppReview));
    } catch { /* web */ }
  }, []);
  const requestReview = () => {
    try {
      const cap = (window as any).Capacitor;
      const p = cap?.Plugins?.InAppReview;
      if (cap?.isNativePlatform?.() && p?.requestReview) { p.requestReview().catch(() => {}); }
    } catch { /* noop */ }
  };

  useEffect(() => {
    let dead = false;
    const KEY = `uc.swr.macro.${loc}`;
    setMacro(null);      // drop previous locale's macro; repaint from THIS locale below
    // [SWR] paint last session's macro instantly (backdrop/tab never wait on gen).
    try {
      const s = localStorage.getItem(KEY);
      if (s) {
        const c = JSON.parse(s);
        const okAge = Date.now() - Date.parse(c?.generatedAt || 0) < 24 * 60 * 60 * 1000;
        if (c?.success && okAge) setMacro(c);
      }
    } catch { /* ignore */ }

    const bgRefresh = () => {
      fetch(`/api/undercurrent/macro?locale=${loc}&refresh=1`)
        .then((r) => r.json())
        .then((d) => {
          if (dead || !d?.success) return;
          setMacro(d);
          try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* quota */ }
        })
        .catch(() => { /* keep what we have */ });
    };

    fetch(`/api/undercurrent/macro?locale=${loc}`)
      .then((r) => r.json())
      .then((d) => {
        if (dead || !d?.success) return;
        setMacro(d);
        try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* quota */ }
        if (d._stale) bgRefresh();
      })
      .catch(() => { /* macro section simply hidden on failure */ });
    return () => { dead = true; };
  }, [loc]);

  useEffect(() => {
    try { setRecents(JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')); } catch { /* noop */ }
  }, []);

  const runSearch = (raw: string) => {
    const tk = raw.trim().toUpperCase();
    if (!/^[A-Z]{1,5}$/.test(tk)) return;
    lastSearchRef.current = tk;
    setSearchQ(tk); setSearchBusy(true); setSearchErr(''); setSearchRes(null);
    // [SWR] freshen a logically-stale ticker in the background (won't block the result,
    // and only swaps in if the user hasn't searched something else since).
    const bgRefreshTicker = () => {
      fetch(`/api/undercurrent/ticker?t=${tk}&locale=${loc}&refresh=1`)
        .then((r) => r.json())
        .then((d2) => {
          if (lastSearchRef.current === tk && d2?.success && (d2.cards?.length || d2.hasMoneyData)) setSearchRes(d2);
        })
        .catch(() => { /* keep what we have */ });
    };
    fetch(`/api/undercurrent/ticker?t=${tk}&locale=${loc}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.success && (d.cards?.length || d.hasMoneyData)) {
          setSearchRes(d);
          setRecents((prev) => {
            const next = [tk, ...prev.filter((x) => x !== tk)].slice(0, 8);
            try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* noop */ }
            return next;
          });
          if (d._stale) bgRefreshTicker();
        } else {
          setSearchErr('empty');
        }
      })
      .catch(() => setSearchErr('fail'))
      .finally(() => setSearchBusy(false));
  };

  useEffect(() => {
    let dead = false;
    const KEY = `uc.swr.feed.${loc}`;
    setErr(false);       // clear any prior error so it can't stick across loc-change / remount
    setFeed(null);       // drop the previous locale's cards; repaint from THIS locale below
    // [SWR] instant-paint from last session so the user never faces a blank/20s wait.
    let painted = false;
    try {
      const s = localStorage.getItem(KEY);
      if (s) {
        const c = JSON.parse(s);
        // only paint reasonably-fresh cache (< 24h) — never flash week-old content
        const okAge = Date.now() - Date.parse(c?.generatedAt || 0) < 24 * 60 * 60 * 1000;
        if (c?.cards?.length && okAge) { setFeed(c); painted = true; }
      }
    } catch { /* ignore */ }

    // background regen when the server served a logically-stale copy (refresh=1 →
    // this request owns its own serverless lifetime, so the ~20s gen completes safely).
    const bgRefresh = () => {
      fetch(`/api/undercurrent/feed?locale=${loc}&limit=12&refresh=1`)
        .then((r) => r.json())
        .then((d) => {
          if (dead || !d?.success || !d.cards?.length) return;
          setFeed(d);
          try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* quota */ }
        })
        .catch(() => { /* keep what we have */ });
    };

    fetch(`/api/undercurrent/feed?locale=${loc}&limit=12`)
      .then((r) => r.json())
      .then((d) => {
        if (dead) return;
        if (!d?.success || !d.cards?.length) { if (!painted) setErr(true); return; }
        setFeed(d);
        try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* quota */ }
        // Deep links (?tab=div|whale|stories, ?open=TICKER) — used by future push
        // notifications and by the simulator verification loop (no tap injection).
        try {
          const sp = new URLSearchParams(window.location.search);
          const tabP = sp.get('tab');
          if (tabP === 'macro' || tabP === 'div' || tabP === 'whale' || tabP === 'stories' || tabP === 'search') setTab(tabP);
          const openP = (sp.get('open') || '').toUpperCase();
          if (openP) {
            const found = (d.cards || []).find((c: Card) => c.ticker === openP);
            if (found) setDetail(found);
          }
          const tP = (sp.get('t') || '').toUpperCase();
          if (tP && /^[A-Z]{1,5}$/.test(tP)) { setTab('search'); runSearch(tP); }
          if (sp.get('settings') === '1') setShowSettings(true);
        } catch { /* noop */ }
        if (d._stale) bgRefresh(); // freshen for this and the next visitor
      })
      .catch(() => { if (!dead && !painted) setErr(true); });
    return () => { dead = true; };
  }, [loc]);

  const dateStr = useMemo(() => {
    const tag = loc === 'ko' ? 'ko-KR' : loc === 'ja' ? 'ja-JP' : 'en-US';
    // ET calendar day (see etNow) — matches the edition boundary the market runs on.
    return new Date().toLocaleDateString(tag, { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'America/New_York' });
  }, [loc]);

  const cards = feed?.cards || [];
  const hero = cards.find((c) => c.divergence) || cards[0];
  const divCards = cards.filter((c) => c.divergence);
  // 큰손: strong off-exchange (>=40) first; if none clear the bar, still show the day's top
  // off-exchange names so the radar is never blank when money data exists (rich, not empty).
  const whaleAll = [...cards]
    .filter((c) => c.money?.darkPoolPct != null)
    .sort((a, b) => (b.money?.darkPoolPct ?? 0) - (a.money?.darkPoolPct ?? 0));
  const whaleStrong = whaleAll.filter((c) => (c.money?.darkPoolPct ?? 0) >= 40);
  const whaleCards = whaleStrong.length ? whaleStrong : whaleAll.slice(0, 6);
  const connected = (base: Card | null) =>
    base ? cards.filter((c) => c.ticker !== base.ticker && (c.moneyMood === base.moneyMood || (c.divergence && base.divergence))).slice(0, 3) : [];

  // ── breaking (fresh ≤ 2h across stories + macro) · topics (tag counts) · edition ──
  const BREAKING_MIN = 120;
  const ageMin = (iso: string | null) => {
    if (!iso) return Infinity;
    const ms = Date.now() - new Date(iso).getTime();
    return Number.isFinite(ms) && ms >= 0 ? ms / 60000 : Infinity;
  };
  const breaking: { title: string; publishedAt: string | null; kind: 'story' | 'macro'; card?: Card }[] = [
    ...cards.filter((c) => ageMin(c.publishedAt) <= BREAKING_MIN).map((c) => ({ title: c.plainTitle, publishedAt: c.publishedAt, kind: 'story' as const, card: c })),
    ...(macro?.cards || []).filter((m) => ageMin(m.publishedAt) <= BREAKING_MIN).map((m) => ({ title: m.plainTitle, publishedAt: m.publishedAt, kind: 'macro' as const })),
  ].sort((a, b) => ageMin(a.publishedAt) - ageMin(b.publishedAt)).slice(0, 6);

  const topics = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of cards) if (c.tag) counts.set(c.tag, (counts.get(c.tag) || 0) + 1);
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [cards]);

  const edition = useMemo(() => {
    const h = etNow().hour;
    return h < 11 ? t.edMorning : h < 17 ? t.edAfternoon : t.edEvening;
  }, [t]);

  // ── [EDITION] finishable daily edition: a FIXED set with an end state ──
  // (research-validated format: Espresso/Yahoo News Digest/Finimize). The home
  // tab shows exactly these items + a closing card; the full feed lives in
  // the Stories tab. Read state persists per (local date, edition slot).
  const editionSlot = useMemo(() => {
    const h = etNow().hour;
    return h < 11 ? 'am' : h < 17 ? 'pm' : 'ev';
  }, []);
  // ET date so read-state resets at ET midnight (same day the edition is keyed to).
  const editionKey = `uc.ed.read.${etNow().isoDate}.${editionSlot}`;
  const [readMap, setReadMap] = useState<Record<string, boolean>>({});
  useEffect(() => {
    try { setReadMap(JSON.parse(localStorage.getItem(editionKey) || '{}')); } catch { /* fresh */ }
  }, [editionKey]);
  const editionItems = useMemo(() => {
    if (!cards.length) return [] as Card[];
    const rest = cards.filter((c) => c !== hero);
    const base = [hero, ...rest.slice(0, 4)].filter(Boolean) as Card[];
    const divExtra = divCards.find((c) => !base.includes(c));
    return divExtra ? [...base, divExtra] : base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);
  const readCount = editionItems.filter((c) => readMap[c.ticker]).length;
  const editionDone = editionItems.length > 0 && readCount >= editionItems.length;
  const markRead = (c: Card) => {
    if (!editionItems.some((e) => e.ticker === c.ticker) || readMap[c.ticker]) return;
    const next = { ...readMap, [c.ticker]: true };
    setReadMap(next);
    try { localStorage.setItem(editionKey, JSON.stringify(next)); } catch { /* full */ }
  };
  const nextEditionLabel = editionSlot === 'am' ? t.edAfternoon : editionSlot === 'pm' ? t.edEvening : t.edMorning;

  // finishing an edition is the natural high point — ask for a rating on the
  // 2nd and 7th finished edition (counted once per edition), native only
  useEffect(() => {
    if (!editionDone) return;
    try {
      const flag = `uc.ed.doneflag.${editionKey}`;
      if (localStorage.getItem(flag)) return;
      localStorage.setItem(flag, '1');
      const n = (parseInt(localStorage.getItem('uc.ed.doneCount') || '0', 10) || 0) + 1;
      localStorage.setItem('uc.ed.doneCount', String(n));
      if (n === 2 || n === 7) setTimeout(requestReview, 1400);
    } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editionDone, editionKey]);

  // ── [SCOREBOARD] divergence trust loop: who was right 3 days later ──
  const [scoreboard, setScoreboard] = useState<any>(null);
  useEffect(() => {
    fetch('/api/undercurrent/scoreboard')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j?.success) setScoreboard(j); })
      .catch(() => {});
  }, []);

  // ── [JUDGMENT] this week's scheduled earnings (reason to come back) ──
  const [judgment, setJudgment] = useState<{ ticker: string; date: string }[]>([]);
  useEffect(() => {
    fetch('/api/undercurrent/judgment')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (Array.isArray(j?.events)) setJudgment(j.events); })
      .catch(() => {});
  }, []);

  // ── [GATE] deep layer: hero free + ONE free unlock per day, ads beyond ──
  // (retention-first: no verified evidence that hard rewarded gates work in
  // content apps, so the first daily unlock is frictionless)
  const dayKey = new Date().toISOString().slice(0, 10);
  const [freeUsed, setFreeUsed] = useState(true);
  useEffect(() => {
    try { setFreeUsed(!!localStorage.getItem(`uc.freeUnlock.${dayKey}`)); } catch { /* keep true */ }
  }, [dayKey]);
  const consumeUnlock = (ticker: string) => {
    if (!freeUsed) {
      try { localStorage.setItem(`uc.freeUnlock.${dayKey}`, ticker); } catch { /* ignore */ }
      setFreeUsed(true);
    }
    setUnlocked((u) => ({ ...u, [ticker]: true }));
  };

  // Free by TICKER, not object identity — an SWR feed swap replaces card objects, so
  // `c === hero` would re-lock the hero's already-open deep layer mid-read.
  const isFree = (c: Card) => !!hero && c.ticker === hero.ticker; // hero's deep layer is the free taste
  const isOpen = (c: Card) => isFree(c) || unlocked[c.ticker];

  const openDetail = (c: Card) => { setDetail(c); markRead(c); window.scrollTo(0, 0); };
  // leaving a story is the ONE acceptable interstitial moment (never mid-read);
  // ads.ts enforces session grace / min gap / daily cap, so this is a no-op most of the time
  const closeDetail = () => { setDetail(null); if (adsAvailable()) maybeShowInterstitial(); };

  // [INTERCONNECT] jump from a story to that ticker's full entity view (its own
  // deep money layer + all its news) — the hub link of the web.
  const gotoTicker = (tk: string) => { setDetail(null); setTab('search'); window.scrollTo(0, 0); runSearch(tk); };

  // [SHARE] the divergence card is the viral unit. Web Share API (works in iOS
  // WKWebView / Android WebView on a user gesture); clipboard + toast fallback.
  const shareCard = async (c: Card) => {
    const url = `https://www.signumhq.com/${loc}/undercurrent?open=${c.ticker}`;
    const lead = c.divergence ? `${t.divergence} · ${c.ticker}` : c.ticker;
    const body = (c.moneyRead || c.whyItMatters || '').trim();
    const text = `${c.plainTitle}\n\n💰 ${lead}${body ? `\n${body}` : ''}\n\n— Undercurrent`;
    try {
      if (typeof navigator !== 'undefined' && (navigator as any).share) {
        await (navigator as any).share({ title: c.plainTitle, text, url });
        return;
      }
    } catch { return; /* user cancelled the native sheet — not an error */ }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setShareToast(true);
      window.setTimeout(() => setShareToast(false), 1800);
    } catch { /* no clipboard access — silently ignore */ }
  };

  // ── [ADS] init + anchored banner once per session (native shell only) ──
  useEffect(() => {
    if (!adsAvailable()) return;
    initAds().then((ok) => { if (ok) showHomeBanner(62); });
  }, []);

  // rewarded unlock — beyond the daily free one, the deep layer is earned by an ad
  const [adBusy, setAdBusy] = useState(false);
  const unlockWithAd = (ticker: string) => {
    if (adBusy) return;
    setAdBusy(true);
    showRewarded()
      .then((ok) => { if (ok) setUnlocked((u) => ({ ...u, [ticker]: true })); })
      .finally(() => setAdBusy(false));
  };

  // ── shared story row (num/read: edition checklist mode) ──
  const StoryRow = ({ c, num, read }: { c: Card; num?: number; read?: boolean }) => (
    <button type="button" onClick={() => openDetail(c)} style={{
      font: 'inherit', textAlign: 'left', cursor: 'pointer', width: '100%',
      marginTop: 11, background: C.card, borderRadius: 18, border: `1px solid ${read ? 'rgba(11,61,44,0.25)' : C.line}`,
      boxShadow: C.shadow, padding: 14, display: 'flex', gap: 13, alignItems: 'flex-start',
      opacity: read ? 0.82 : 1,
    }}>
      {typeof num === 'number' && (
        <span style={{
          flexShrink: 0, width: 24, height: 24, borderRadius: '50%', marginTop: 2,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 900, color: '#fff',
          background: read ? C.emeraldDeep : C.ink,
        }}>{read ? '✓' : num}</span>
      )}
      {c.image && (
        <div style={{ width: 92, height: 74, flexShrink: 0, borderRadius: 12, overflow: 'hidden', background: '#E8E4DC' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={c.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5, flexWrap: 'wrap' }}>
          <TickerLogo ticker={c.ticker} size={16} />
          <span style={{ fontSize: 10.5, fontWeight: 800, color: C.faint }}>{c.tag ? `${c.tag} · ` : ''}{c.ticker}</span>
          <FreshBadge iso={c.publishedAt} t={t} />
          {c.divergence && <DivBadge t={t} small />}
        </div>
        <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, lineHeight: 1.35, letterSpacing: '-0.01em' }}>{c.plainTitle}</h3>
        {c.moneyRead && (
          <p style={{
            margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.55, color: C.sub,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{c.moneyRead}</p>
        )}
        <div style={{ marginTop: 8 }}><MoodBadge mood={c.moneyMood} t={t} small /></div>
      </div>
    </button>
  );

  // ── shared footer: disclaimer + legal links (router nav only — top-level
  //    navigation would kick the Capacitor shell into in-app Safari) ──
  const linkBtnStyle = {
    font: 'inherit', cursor: 'pointer', background: 'none', border: 'none', padding: 0,
    fontSize: 11, fontWeight: 750 as any, color: C.sub, textDecoration: 'underline', textUnderlineOffset: 2,
  } as const;
  const UcFooter = () => (
    <footer style={{ marginTop: 22 }}>
      <div style={{ fontSize: 11, lineHeight: 1.6, color: C.faint, fontStyle: 'italic' }}>{t.disclaimer}</div>
      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => router.push(`/${loc}/undercurrent/privacy`)} style={linkBtnStyle}>{t.stPrivacy}</button>
        <button type="button" onClick={() => router.push(`/${loc}/undercurrent/terms`)} style={linkBtnStyle}>{t.stTerms}</button>
        <span style={{ marginLeft: 'auto', fontSize: 10.5, color: C.faint, fontWeight: 600 }}>Undercurrent 1.0.0 · SIGNUM HQ, LLC</span>
      </div>
    </footer>
  );

  // ── DETAIL VIEW (slide-up page) ──
  if (detail) {
    const c = detail;
    const open = isOpen(c);
    const conn = connected(c);
    return (
      <div className="uc-slideup" style={{ minHeight: '100vh', background: C.bg, color: C.ink, fontFamily: "-apple-system,'SF Pro Display','Segoe UI',sans-serif" }}>
        <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 18px calc(46px + env(safe-area-inset-bottom))' }}>
          <header style={{
            position: 'sticky', top: 0, zIndex: 40, margin: '0 -18px', padding: '12px 18px',
            paddingTop: 'calc(12px + env(safe-area-inset-top))',
            background: 'rgba(246,243,237,0.9)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
            display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${C.line}`,
          }}>
            <button type="button" onClick={closeDetail} aria-label={t.back} style={{
              font: 'inherit', cursor: 'pointer', borderRadius: '50%',
              appearance: 'none', WebkitAppearance: 'none', boxSizing: 'border-box', padding: 0,
              width: 34, height: 34, minWidth: 34, minHeight: 34, maxWidth: 34, maxHeight: 34,
              aspectRatio: '1 / 1', flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              background: C.card, border: `1px solid ${C.line}`, fontSize: 17, fontWeight: 800, color: C.ink,
            }}>←</button>
            {/* tappable ticker = hub link to the full entity view (interconnect) */}
            <button type="button" onClick={() => gotoTicker(c.ticker)} aria-label={`${c.ticker} ${t.viewTicker}`} style={{
              font: 'inherit', cursor: 'pointer', background: 'none', border: 'none', padding: 0,
              display: 'inline-flex', alignItems: 'center', gap: 7,
            }}>
              <TickerLogo ticker={c.ticker} size={20} />
              <span style={{ fontSize: 14, fontWeight: 900 }}>{c.ticker}</span>
            </button>
            <FreshBadge iso={c.publishedAt} t={t} />
            <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <MoodBadge mood={c.moneyMood} t={t} small />
              <button type="button" onClick={() => shareCard(c)} aria-label={t.share} style={{
                font: 'inherit', cursor: 'pointer', borderRadius: '50%',
                appearance: 'none', WebkitAppearance: 'none', boxSizing: 'border-box', padding: 0,
                width: 34, height: 34, minWidth: 34, minHeight: 34, maxWidth: 34, maxHeight: 34,
                aspectRatio: '1 / 1', flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: C.card, border: `1px solid ${C.line}`,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
                  <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
                </svg>
              </button>
            </span>
          </header>

          {/* quiet price strip — the money's live scoreboard for this story:
              current price · today% · "% since the news" (divergence, live) */}
          {detailPx && (
            <div style={{
              marginTop: 12, display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap',
              background: C.card, border: `1px solid ${C.line}`, borderRadius: 13,
              padding: '9px 13px', boxShadow: C.shadow, fontVariantNumeric: 'tabular-nums',
            }}>
              <span style={{ fontSize: 16.5, fontWeight: 900, letterSpacing: '-0.01em' }}>
                ${detailPx.price >= 1000 ? detailPx.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : detailPx.price.toFixed(2)}
              </span>
              {detailPx.dayPct != null && (
                <span style={{ fontSize: 12, fontWeight: 800, color: detailPx.dayPct >= 0 ? C.emerald : C.diverge }}>
                  {detailPx.dayPct >= 0 ? '+' : ''}{detailPx.dayPct.toFixed(2)}%
                  <span style={{ marginLeft: 3, fontWeight: 700, color: C.faint }}>{t.pxToday}</span>
                </span>
              )}
              {detailPx.sincePct != null && (
                <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 700, color: C.faint }}>
                  {t.pxSince}{' '}
                  <span style={{ fontWeight: 900, color: detailPx.sincePct >= 0 ? C.emerald : C.diverge }}>
                    {detailPx.sincePct >= 0 ? '+' : ''}{detailPx.sincePct.toFixed(2)}%
                  </span>
                </span>
              )}
            </div>
          )}

          {c.image && (
            <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', marginTop: 14, aspectRatio: '16/8', background: '#E8E4DC' }}>
              <span aria-hidden style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44, fontWeight: 900, letterSpacing: '0.04em', color: 'rgba(23,25,30,0.10)' }}>{c.ticker}</span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
              {c.divergence && <div style={{ position: 'absolute', left: 12, top: 12 }}><DivBadge t={t} /></div>}
            </div>
          )}

          <h1 style={{ margin: '14px 0 0', fontSize: 21.5, fontWeight: 900, lineHeight: 1.3, letterSpacing: '-0.015em' }}>{c.plainTitle}</h1>
          {c.whyItMatters && <p style={{ margin: '9px 0 0', fontSize: 14.5, lineHeight: 1.7, color: C.sub }}>{c.whyItMatters}</p>}
          {c.source && (
            <div style={{ marginTop: 8, fontSize: 11.5, color: C.faint, fontWeight: 600 }}>{t.source} · {c.source}</div>
          )}

          {/* [INTERCONNECT] explicit hub link: jump to this ticker's full entity view */}
          <button type="button" onClick={() => gotoTicker(c.ticker)} style={{
            font: 'inherit', cursor: 'pointer', marginTop: 12,
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: C.card, border: `1px solid ${C.line}`, boxShadow: C.shadow,
            borderRadius: 999, padding: '8px 14px',
          }}>
            <TickerLogo ticker={c.ticker} size={16} />
            <span style={{ fontSize: 12.5, fontWeight: 800, color: C.ink }}>{c.ticker} · {t.viewTicker}</span>
            <span style={{ fontSize: 12.5, fontWeight: 800, color: C.emerald }}>→</span>
          </button>

          {/* money read */}
          {c.moneyRead && (
            <div style={{ marginTop: 16, background: C.card, borderRadius: 18, border: `1px solid ${C.line}`, boxShadow: C.shadow, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.09em', color: moodStyle(c.moneyMood).color, marginBottom: 6 }}>
                {t.moneyTitle.toUpperCase()}
              </div>
              <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.7, fontWeight: 550 as any }}>{c.moneyRead}</p>
            </div>
          )}

          {/* official 8-K filings — "회사가 직접 밝힌 것": the company's own SEC
              record, set against the press story above and the money read. Hidden
              entirely when the ticker has no recent filings. */}
          {((filings[c.ticker]?.length ?? 0) > 0 || insiders[c.ticker]) && (
            <div style={{ marginTop: 14, background: C.card, borderRadius: 18, border: `1px solid ${C.line}`, boxShadow: C.shadow, padding: '14px 16px 15px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 13 }}>📜</span>
                <span style={{ fontSize: 13.5, fontWeight: 850 as any }}>{t.filingsTitle}</span>
              </div>
              <div style={{ marginTop: 3, fontSize: 11, color: C.faint, fontWeight: 600 }}>{t.filingsSub}</div>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(filings[c.ticker] || []).map((ev, i) => (
                  <div key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                    <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 34 }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: C.faint, fontVariantNumeric: 'tabular-nums' }}>{ev.date.slice(5).replace('-', '/')}</div>
                      <div style={{
                        marginTop: 3, fontSize: 8.5, fontWeight: 900, padding: '2px 5px', borderRadius: 6,
                        color: ev.highImpact ? '#fff' : C.sub,
                        background: ev.highImpact ? C.diverge : '#ECE8E0',
                      }}>{(ev.label[loc] || ev.label.en || '').split('·')[0].trim()}</div>
                    </div>
                    <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, fontWeight: 550 as any }}>
                      {ev.summary[loc] || ev.summary.en}
                    </p>
                  </div>
                ))}
                {/* insider Form-4 line — what executives did with their own money */}
                {insiders[c.ticker] && (() => {
                  const ins = insiders[c.ticker]!;
                  const netBuy = ins.net30d >= 0;
                  return (
                    <div style={{ borderTop: `1px dashed ${C.line}`, paddingTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: C.faint }}>{t.insiderTitle}</span>
                      <span style={{
                        fontSize: 10.5, fontWeight: 900, padding: '2px 8px', borderRadius: 999,
                        color: netBuy ? '#fff' : C.diverge,
                        background: netBuy ? C.emeraldDeep : C.divergeBg,
                      }}>{netBuy ? t.insiderNetBuy : t.insiderNetSell}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 700, color: C.sub }}>
                        {t.insiderBuys} {ins.buyCount} · {t.insiderSells} {ins.sellCount}
                        {ins.latest ? ` · ${ins.latest.title || ins.latest.name} ${ins.latest.code === 'P' ? '▲' : '▼'} $${(Math.abs(ins.latest.value) / 1e6).toFixed(1)}M` : ''}
                      </span>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* deep layer — the rewarded content */}
          <div style={{ marginTop: 14, background: C.card, borderRadius: 18, border: `1px solid ${C.line}`, boxShadow: C.shadow, padding: '14px 16px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 8, height: 8, borderRadius: 3, background: C.ink }} />
              <span style={{ fontSize: 13.5, fontWeight: 850 as any }}>{t.deepTitle}</span>
            </div>
            {open ? (
              <DeepLayer c={c} t={t} />
            ) : (
              <div style={{ position: 'relative', marginTop: 10 }}>
                <div style={{ filter: 'blur(7px)', pointerEvents: 'none', opacity: 0.6 }}>
                  <DeepLayer c={c} t={t} />
                </div>
                <div style={{
                  position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 8, textAlign: 'center',
                }}>
                  <div style={{ fontSize: 14, fontWeight: 850 as any }}>{t.deepLockedTitle}</div>
                  <div style={{ fontSize: 11.5, color: C.sub, fontWeight: 600, maxWidth: 260 }}>{t.deepLockedDesc}</div>
                  {(() => {
                    // free daily unlock → direct; beyond it, rewarded ad when the
                    // native ad stack is live; graceful direct unlock otherwise
                    const viaAd = freeUsed && adsAvailable();
                    return (
                      <>
                        <button type="button" disabled={adBusy} onClick={() => (viaAd ? unlockWithAd(c.ticker) : consumeUnlock(c.ticker))} style={{
                          font: 'inherit', cursor: 'pointer', marginTop: 4,
                          fontSize: 13.5, fontWeight: 800, color: '#fff',
                          background: freeUsed ? C.ink : C.emeraldDeep,
                          border: 'none', padding: '11px 18px', borderRadius: 12,
                          opacity: adBusy ? 0.6 : 1,
                        }}>
                          {!freeUsed ? `✓ ${t.unlockFreeBtn}` : viaAd ? (adBusy ? t.adLoading : `▶ ${t.unlockAdBtn}`) : `▶ ${t.unlockBtn}`}
                        </button>
                        <div style={{ fontSize: 10, color: C.faint }}>{freeUsed ? t.unlockNote : t.unlockFreeNote}</div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* connected flows */}
          {conn.length > 0 && (
            <>
              <SectionHead title={t.connected} sub={t.secStoriesSub} color={C.ink} />
              {conn.map((x) => <StoryRow key={x.ticker} c={x} />)}
            </>
          )}

          <UcFooter />
        </div>
        {shareToast && (
          <div style={{
            position: 'fixed', left: '50%', bottom: 'calc(30px + env(safe-area-inset-bottom))',
            transform: 'translateX(-50%)', zIndex: 80, background: C.ink, color: '#fff',
            fontSize: 12.5, fontWeight: 800, padding: '10px 16px', borderRadius: 999, boxShadow: C.shadow,
          }}>{t.shareCopied}</div>
        )}
        <style>{CSS_ANIM}</style>
      </div>
    );
  }

  // ── TAB VIEWS ──
  const TabBar = () => (
    <nav style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 60,
      // frosted glass: translucent so the feed shows through + heavy blur & saturation.
      // (was 0.92 white = effectively opaque, so the blur never read as glass.)
      background: 'rgba(252,250,246,0.72)',
      backdropFilter: 'blur(22px) saturate(180%)', WebkitBackdropFilter: 'blur(22px) saturate(180%)',
      borderTop: '1px solid rgba(23,25,30,0.06)', boxShadow: '0 -6px 26px rgba(23,25,30,0.06)',
      display: 'flex', paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {([
        { k: 'home', label: t.tabHome, dot: null },
        { k: 'macro', label: t.tabMacro, dot: macro?.cards?.length || null },
        { k: 'div', label: t.tabDiv, dot: divCards.length || null },
        { k: 'whale', label: t.tabWhale, dot: whaleCards.length || null },
        { k: 'stories', label: t.tabStories, dot: null },
        { k: 'search', label: t.tabSearch, dot: null },
      ] as { k: Tab; label: string; dot: number | null }[]).map((m) => {
        const active = tab === m.k;
        const col = active ? C.emerald : C.faint;
        return (
          <button key={m.k} type="button" onClick={() => { setTab(m.k); window.scrollTo(0, 0); }} style={{
            font: 'inherit', cursor: 'pointer', flex: 1, position: 'relative',
            padding: '9px 0 7px', background: 'none', border: 'none', color: col,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            transition: 'color 0.18s ease',
          }}>
            {/* active indicator bar */}
            <span style={{
              position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
              width: active ? 20 : 0, height: 2.5, borderRadius: 2, background: C.emerald,
              transition: 'width 0.2s ease', opacity: active ? 1 : 0,
            }} />
            <span style={{ position: 'relative', display: 'inline-flex' }}>
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth={active ? 2.3 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {TAB_ICONS[m.k]}
              </svg>
              {m.dot ? (
                <span style={{
                  position: 'absolute', top: -5, right: -9, fontSize: 8.5, fontWeight: 900, color: '#fff',
                  background: m.k === 'div' ? C.diverge : C.emerald, borderRadius: 999,
                  minWidth: 15, textAlign: 'center', padding: '1px 4px', lineHeight: 1.3,
                  border: '1.5px solid rgba(252,250,246,0.9)',
                }}>{m.dot}</span>
              ) : null}
            </span>
            <span style={{ fontSize: 10, fontWeight: active ? 800 : 600, letterSpacing: '0.01em' }}>{m.label}</span>
          </button>
        );
      })}
    </nav>
  );

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.ink, fontFamily: "-apple-system,'SF Pro Display','Segoe UI',sans-serif" }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 18px calc(84px + env(safe-area-inset-bottom))' }}>

        {/* masthead — two clean rows: (logo · wordmark · bell) / (tagline ─ date · edition).
            The old single-row layout squeezed the by-line into a wrap and stacked the
            date column beside the bell — cluttered on narrow screens. */}
        <header style={{ paddingTop: 'calc(20px + env(safe-area-inset-top))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* 40px box / 30px mark — the white box + border made the old 22px mark read
                too small next to the 21px wordmark. */}
            <span style={{ width: 40, height: 40, borderRadius: 12, background: '#FCFAF6', border: `1px solid ${C.line}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/undercurrent-symbol.svg" alt="Undercurrent" style={{ width: 30, height: 30 }} />
            </span>
            {/* wordmark + attribution STACKED (was inline → "by SIGNUM HQ" clipped on
                narrow phones once the two round buttons claimed their width). */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0, overflow: 'hidden' }}>
              <span style={{ fontSize: 21, fontWeight: 900, letterSpacing: '-0.03em', whiteSpace: 'nowrap', lineHeight: 1.02 }}>Undercurrent</span>
              <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', color: C.faint, whiteSpace: 'nowrap', marginTop: 2 }}>BY SIGNUM HQ</span>
            </div>
            <button type="button" onClick={() => setShowSettings(true)} aria-label={t.stTitle} style={{
              borderRadius: '50%', cursor: 'pointer', marginLeft: 'auto',
              appearance: 'none', WebkitAppearance: 'none', boxSizing: 'border-box', padding: 0,
              width: 36, height: 36, minWidth: 36, minHeight: 36, maxWidth: 36, maxHeight: 36,
              aspectRatio: '1 / 1',
              background: C.card, border: `1px solid ${C.line}`, boxShadow: C.shadow,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            <button type="button" onClick={() => setShowBreaking(true)} aria-label={t.breakingCenter} style={{
              position: 'relative', borderRadius: '50%', cursor: 'pointer',
              appearance: 'none', WebkitAppearance: 'none', boxSizing: 'border-box', padding: 0,
              width: 36, height: 36, minWidth: 36, minHeight: 36, maxWidth: 36, maxHeight: 36,
              aspectRatio: '1 / 1',
              background: C.card, border: `1px solid ${C.line}`, boxShadow: C.shadow,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.7 21a2 2 0 0 1-3.4 0" />
              </svg>
              {breaking.length > 0 && (
                <span style={{ position: 'absolute', top: 6, right: 7, width: 8, height: 8, borderRadius: '50%', background: C.diverge, border: '1.5px solid #fff' }} className="mbz-pulse" />
              )}
            </button>
          </div>
          {/* flexWrap (not ellipsis-squeeze): the EN tagline is long, so on narrow screens
              the date·edition block wraps to its own right-aligned line instead of
              truncating the tagline to "The money mov…". ko/ja stay one line. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: '2px 10px', marginTop: 5, paddingLeft: 50 }}>
            <span style={{ fontSize: 12.5, color: C.sub, fontWeight: 500, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.tagline}</span>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: C.faint, whiteSpace: 'nowrap', flexShrink: 0, marginLeft: 'auto' }}>
              {dateStr}
              <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '0.06em', color: C.faint, background: C.neutralBg, borderRadius: 5, padding: '1px 4px', margin: '0 3px', verticalAlign: '1px' }}>ET</span>
              <span style={{ opacity: 0.45, margin: '0 1px' }}>·</span> <span style={{ color: C.emerald, fontWeight: 800, letterSpacing: '0.04em' }}>{edition}</span>
            </span>
          </div>
        </header>

        {/* loading / error */}
        {!feed && !err && (
          <div aria-label={t.loading}>
            <div className="uc-skel" style={{ height: 44, borderRadius: 16, marginTop: 14 }} />
            <div className="uc-skel" style={{ height: 74, borderRadius: 18, marginTop: 12 }} />
            <div className="uc-skel" style={{ aspectRatio: '16/9', borderRadius: 22, marginTop: 14 }} />
            <div className="uc-skel" style={{ height: 96, borderRadius: 18, marginTop: 12 }} />
            <div className="uc-skel" style={{ height: 96, borderRadius: 18, marginTop: 12 }} />
            <div style={{ textAlign: 'center', fontSize: 13, color: C.faint, fontWeight: 600, marginTop: 18 }}>{t.loading}</div>
          </div>
        )}
        {err && !feed && <div style={{ padding: '80px 0', textAlign: 'center', fontSize: 14, color: C.sub }}>{t.error}</div>}

        {feed && (
          <div key={tab} className="uc-view">
            {/* ── HOME ── */}
            {tab === 'home' && (
              <>
                {/* breaking strip — first impression: what just happened */}
                {breaking.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '14px -18px 0', padding: '0 18px' }}>
                    <span style={{
                      flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 6,
                      fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', color: '#fff',
                      background: C.diverge, padding: '8px 12px', borderRadius: 12,
                    }}>
                      <span className="mbz-pulse" style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff', display: 'inline-block' }} />
                      {t.breaking.toUpperCase()}
                    </span>
                    {breaking.map((b, i) => (
                      <button key={i} type="button" onClick={() => { if (b.kind === 'story' && b.card) openDetail(b.card); else { setTab('macro'); window.scrollTo(0, 0); } }} style={{
                        font: 'inherit', cursor: 'pointer', flex: '0 0 auto', maxWidth: 250,
                        display: 'inline-flex', alignItems: 'center', gap: 7,
                        fontSize: 12, fontWeight: 700, color: C.ink, textAlign: 'left',
                        background: C.card, border: `1px solid ${C.line}`, boxShadow: C.shadow,
                        padding: '8px 12px', borderRadius: 12,
                      }}>
                        <span style={{ fontSize: 10, fontWeight: 800, color: C.diverge, whiteSpace: 'nowrap' }}>{freshness(b.publishedAt, t)?.label}</span>
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.title}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* ── [MARKET BACKDROP] the weather before the stories: frame the
                    whole edition with the macro backdrop up top (World→Market),
                    then let readers dive into individual names below. Tap → macro. ── */}
                {macro && (macro.macroRead || macro.cards.length > 0) && (
                  <button type="button" onClick={() => { setTab('macro'); window.scrollTo(0, 0); }} style={{
                    font: 'inherit', textAlign: 'left', cursor: 'pointer', width: '100%',
                    marginTop: 14, borderRadius: 18, padding: '13px 15px 14px', boxShadow: C.shadow,
                    background: `linear-gradient(135deg, ${C.ink}, #2A2E38)`, color: '#fff', border: 'none',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#9BE8C4', display: 'inline-block' }} />
                      <span style={{ fontSize: 10.5, fontWeight: 900, letterSpacing: '0.12em', color: '#9BE8C4' }}>{t.backdropNow.toUpperCase()}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,0.5)' }}>· {t.macroTitle}</span>
                      {macro.cards[0] && <span style={{ marginLeft: 'auto' }}><ImpactBadge impact={macro.cards[0].marketImpact} t={t} /></span>}
                    </div>
                    {macro.macroRead ? (
                      <p style={{ margin: '9px 0 0', fontSize: 14, lineHeight: 1.55, fontWeight: 600 as any, color: 'rgba(255,255,255,0.92)', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{macro.macroRead}</p>
                    ) : macro.cards[0] && (
                      <p style={{ margin: '9px 0 0', fontSize: 14, lineHeight: 1.4, fontWeight: 700 as any, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{macro.cards[0].plainTitle}</p>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 11, flexWrap: 'wrap' }}>
                      {typeof macro.context.nasdaq === 'number' && (
                        <span style={{ fontSize: 11, fontWeight: 800, background: 'rgba(255,255,255,0.10)', borderRadius: 9, padding: '5px 9px', fontVariantNumeric: 'tabular-nums' }}>
                          <span style={{ color: 'rgba(255,255,255,0.55)' }}>{t.ctxNasdaq} </span>{Math.round(macro.context.nasdaq).toLocaleString('en-US')}
                          {typeof macro.context.nasdaqChangePct === 'number' && (
                            <span style={{ marginLeft: 3, color: macro.context.nasdaqChangePct >= 0 ? '#7EE0AE' : '#FFA694' }}>
                              {macro.context.nasdaqChangePct >= 0 ? '+' : ''}{macro.context.nasdaqChangePct.toFixed(1)}%
                            </span>
                          )}
                        </span>
                      )}
                      {typeof macro.context.dow === 'number' && (
                        <span style={{ fontSize: 11, fontWeight: 800, background: 'rgba(255,255,255,0.10)', borderRadius: 9, padding: '5px 9px', fontVariantNumeric: 'tabular-nums' }}>
                          <span style={{ color: 'rgba(255,255,255,0.55)' }}>{t.ctxDow} </span>{Math.round(macro.context.dow).toLocaleString('en-US')}
                          {typeof macro.context.dowChangePct === 'number' && (
                            <span style={{ marginLeft: 3, color: macro.context.dowChangePct >= 0 ? '#7EE0AE' : '#FFA694' }}>
                              {macro.context.dowChangePct >= 0 ? '+' : ''}{macro.context.dowChangePct.toFixed(1)}%
                            </span>
                          )}
                        </span>
                      )}
                      {typeof macro.context.yield10Y === 'number' && (
                        <span style={{ fontSize: 11, fontWeight: 800, background: 'rgba(255,255,255,0.10)', borderRadius: 9, padding: '5px 9px' }}>
                          <span style={{ color: 'rgba(255,255,255,0.55)' }}>{t.ctx10Y} </span>{macro.context.yield10Y.toFixed(2)}%
                        </span>
                      )}
                      {typeof macro.context.fedNoChange === 'number' && (
                        <span style={{ fontSize: 11, fontWeight: 800, background: 'rgba(255,255,255,0.10)', borderRadius: 9, padding: '5px 9px' }}>
                          <span style={{ color: 'rgba(255,255,255,0.55)' }}>{t.ctxFed} </span>{Math.round(macro.context.fedNoChange)}%
                        </span>
                      )}
                      {typeof macro.context.fearGreed === 'number' && (
                        <span style={{ fontSize: 11, fontWeight: 800, background: 'rgba(255,255,255,0.10)', borderRadius: 9, padding: '5px 9px' }}>
                          <span style={{ color: 'rgba(255,255,255,0.55)' }}>{t.ctxFG} </span>{Math.round(macro.context.fearGreed)}
                        </span>
                      )}
                      <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, color: '#9BE8C4', alignSelf: 'center' }}>{t.macroTeaser} →</span>
                    </div>
                  </button>
                )}

                {/* ── [EDITION COVER] finishable edition: progress + market pulse ── */}
                {editionItems.length > 0 && (
                  <section style={{ marginTop: 14, background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: '12px 14px', boxShadow: C.shadow }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 900 }}>{t.covToday}</span>
                      <span style={{ display: 'inline-flex', gap: 4 }}>
                        {editionItems.map((c, i) => (
                          <span key={i} style={{
                            width: 7, height: 7, borderRadius: '50%',
                            background: readMap[c.ticker] ? C.emeraldDeep : '#E3DED4',
                            transition: 'background 0.3s ease',
                          }} />
                        ))}
                      </span>
                      <span style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 800, color: editionDone ? C.emeraldDeep : C.faint, fontVariantNumeric: 'tabular-nums' }}>
                        {readCount}/{editionItems.length} {t.covRead}
                      </span>
                    </div>
                    {feed.pulse && (
                      <div style={{ display: 'flex', gap: 11, fontSize: 11.5, fontWeight: 800, marginTop: 8, whiteSpace: 'nowrap' }}>
                        <span style={{ color: C.emerald }}>● {t.pulseB} {feed.pulse.bullish}</span>
                        <span style={{ color: C.amber }}>● {t.pulseC} {feed.pulse.cautious}</span>
                        <span style={{ color: C.diverge }}>● {t.pulseD} {feed.pulse.divergences}</span>
                      </div>
                    )}
                  </section>
                )}

                {hero && (
                  <button type="button" onClick={() => openDetail(hero)} style={{ font: 'inherit', textAlign: 'left', cursor: 'pointer', width: '100%', padding: 0, border: 'none', marginTop: 14, background: C.card, borderRadius: 22, overflow: 'hidden', outline: `1px solid ${C.line}`, boxShadow: C.shadow }}>
                    {hero.image && (
                      <div style={{ position: 'relative', aspectRatio: '16/9', background: '#E8E4DC' }}>
                        <span aria-hidden style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44, fontWeight: 900, letterSpacing: '0.04em', color: 'rgba(23,25,30,0.10)' }}>{hero.ticker}</span>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={hero.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                        <div style={{ position: 'absolute', left: 12, top: 12, display: 'flex', gap: 7 }}>
                          {hero.divergence && <DivBadge t={t} />}
                        </div>
                        <div style={{ position: 'absolute', right: 12, top: 12 }}>
                          <span style={{ fontSize: 10.5, fontWeight: 800, color: '#fff', background: 'rgba(23,25,30,0.55)', padding: '4px 9px', borderRadius: 999, backdropFilter: 'blur(6px)' }}>
                            {freshness(hero.publishedAt, t)?.label || ''}
                          </span>
                        </div>
                      </div>
                    )}
                    <div style={{ padding: '15px 17px 17px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
                        {hero.tag && <span style={{ fontSize: 11.5, fontWeight: 800, color: C.sub, background: C.neutralBg, padding: '4px 10px', borderRadius: 999 }}>{hero.tag}</span>}
                        <TickerLogo ticker={hero.ticker} size={16} />
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: C.faint }}>{hero.ticker}</span>
                        {!hero.image && <FreshBadge iso={hero.publishedAt} t={t} />}
                        {!hero.image && hero.divergence && <DivBadge t={t} small />}
                        <span style={{ marginLeft: 'auto' }}><MoodBadge mood={hero.moneyMood} t={t} /></span>
                      </div>
                      <h2 style={{ margin: 0, fontSize: 21, fontWeight: 850 as any, lineHeight: 1.3, letterSpacing: '-0.015em' }}>{hero.plainTitle}</h2>
                      {hero.moneyRead && (
                        <div style={{ marginTop: 12, borderTop: `1px solid ${C.line}`, paddingTop: 11 }}>
                          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.09em', color: moodStyle(hero.moneyMood).color, marginBottom: 5 }}>{t.moneyTitle.toUpperCase()}</div>
                          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.65, fontWeight: 550 as any }}>{hero.moneyRead}</p>
                        </div>
                      )}
                    </div>
                  </button>
                )}

                {/* ── [EDITION LIST] items #2+ as a numbered, checkable list ── */}
                {editionItems.slice(1).map((c, i) => (
                  <StoryRow key={c.ticker + i} c={c} num={i + 2} read={!!readMap[c.ticker]} />
                ))}

                {/* ── [JUDGMENT DAYS] scheduled earnings this week ── */}
                {judgment.length > 0 && (
                  <section style={{ marginTop: 12, background: `linear-gradient(135deg, ${C.ink}, #2A2E38)`, color: '#fff', borderRadius: 18, padding: '13px 15px', boxShadow: C.shadow }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 900 }}>⚖️ {t.jdTitle}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 650 as any, color: 'rgba(255,255,255,0.55)' }}>{t.jdSub}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 10, paddingBottom: 2 }}>
                      {judgment.map((e) => {
                        const today = new Date().toISOString().slice(0, 10);
                        const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
                        const dLabel = e.date === today ? t.jdToday : e.date === tomorrow ? t.jdTomorrow : e.date.slice(5).replace('-', '/');
                        return (
                          <button key={e.ticker + e.date} type="button" onClick={() => { setSearchQ(e.ticker); setTab('search'); window.scrollTo(0, 0); }} style={{
                            font: 'inherit', cursor: 'pointer', flex: '0 0 auto', textAlign: 'left',
                            background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 12, padding: '8px 12px', color: '#fff',
                          }}>
                            <div style={{ fontSize: 13, fontWeight: 900 }}>{e.ticker}</div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#9BE8C4', marginTop: 2 }}>{dLabel} · {t.jdEarnings}</div>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                )}

                {/* ── [CLOSING CARD] the finish line — done state + trust teaser ── */}
                {editionItems.length > 0 && (
                  <section style={{
                    marginTop: 12, borderRadius: 18, padding: '16px 16px', textAlign: 'center',
                    background: editionDone ? `linear-gradient(160deg, ${C.emeraldDeep}, #0B3D2C)` : C.card,
                    color: editionDone ? '#fff' : C.ink,
                    border: editionDone ? 'none' : `1px dashed ${C.line}`,
                    boxShadow: C.shadow,
                  }}>
                    <div style={{ fontSize: 15.5, fontWeight: 900 }}>
                      {editionDone ? `✦ ${t.closeDoneTitle}` : `${t.closeProgress} · ${readCount}/${editionItems.length}`}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginTop: 5, color: editionDone ? 'rgba(255,255,255,0.75)' : C.sub }}>
                      {editionDone ? t.closeDoneSub : t.secStoriesSub}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 800, marginTop: 8, color: editionDone ? '#9BE8C4' : C.faint }}>
                      {t.closeNext}: {nextEditionLabel}
                    </div>
                    {scoreboard?.record && (scoreboard.record.money + scoreboard.record.news + scoreboard.record.flat) > 0 && (
                      <button type="button" onClick={() => { setTab('div'); window.scrollTo(0, 0); }} style={{
                        font: 'inherit', cursor: 'pointer', marginTop: 10, fontSize: 11.5, fontWeight: 800,
                        color: editionDone ? '#fff' : C.diverge,
                        background: editionDone ? 'rgba(255,255,255,0.12)' : C.divergeBg,
                        border: 'none', borderRadius: 999, padding: '7px 14px',
                      }}>
                        {t.sbTitle}: {t.sbMoney} {scoreboard.record.money} · {t.sbNews} {scoreboard.record.news} →
                      </button>
                    )}
                  </section>
                )}

                {/* ── 더 둘러보기 ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 2px 2px' }}>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: C.faint, letterSpacing: '0.05em' }}>{t.moreBrowse}</span>
                  <span style={{ flex: 1, height: 1, background: C.line }} />
                </div>

                {/* (macro teaser moved to the TOP as the market backdrop — no dup here) */}

                {/* topics now — tag pulse across today's stories */}
                {topics.length > 1 && (
                  <>
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: C.faint, letterSpacing: '0.05em', margin: '18px 2px 8px' }}>{t.topics}</div>
                    <div style={{ display: 'flex', gap: 7, overflowX: 'auto', margin: '0 -18px', padding: '0 18px' }}>
                      {topics.map(([tg, n]) => (
                        <button key={tg} type="button" onClick={() => { setStoryTag(tg); setTab('stories'); window.scrollTo(0, 0); }} style={{
                          font: 'inherit', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap',
                          color: C.ink, background: C.card, border: `1px solid ${C.line}`, boxShadow: C.shadow,
                          padding: '8px 13px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 6,
                        }}>
                          {tg}
                          <span style={{ fontSize: 10, fontWeight: 900, color: '#fff', background: C.ink, borderRadius: 999, padding: '1.5px 6px' }}>{n}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {/* preview rails → tabs */}
                {divCards.length > 0 && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 4 }}>
                      <SectionHead title={t.secDiv} sub={t.secDivSub} color={C.diverge} />
                      <button type="button" onClick={() => { setTab('div'); window.scrollTo(0, 0); }} style={{ font: 'inherit', marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: C.diverge, background: 'none', border: 'none', cursor: 'pointer' }}>{t.more} →</button>
                    </div>
                    <div style={{ display: 'flex', gap: 11, overflowX: 'auto', margin: '0 -18px', padding: '2px 18px 6px', scrollSnapType: 'x mandatory' }}>
                      {divCards.filter((c) => c !== hero).slice(0, 6).map((c) => (
                        <button key={c.ticker} type="button" onClick={() => openDetail(c)} style={{ font: 'inherit', textAlign: 'left', cursor: 'pointer', border: 'none', padding: 0, flex: '0 0 236px', scrollSnapAlign: 'start', borderRadius: 18, overflow: 'hidden', background: C.card, boxShadow: C.shadow, outline: `1px solid ${C.line}` }}>
                          <div style={{ position: 'relative', height: 110, background: '#E8E4DC' }}>
                            {c.image && (
                              /* eslint-disable-next-line @next/next/no-img-element */
                              <img src={c.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                            )}
                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 30%, rgba(60,20,0,0.55))' }} />
                            <div style={{ position: 'absolute', left: 10, top: 10 }}><DivBadge t={t} small /></div>
                            <div style={{ position: 'absolute', left: 11, right: 11, bottom: 9, color: '#fff', fontSize: 13.5, fontWeight: 800, lineHeight: 1.3, textShadow: '0 1px 8px rgba(0,0,0,0.4)' }}>{c.plainTitle}</div>
                          </div>
                          <div style={{ padding: '9px 12px 11px', display: 'flex', alignItems: 'center', gap: 7 }}>
                            <span style={{ fontSize: 11, fontWeight: 800, color: C.faint }}>{c.ticker}</span>
                            <FreshBadge iso={c.publishedAt} t={t} />
                            <span style={{ marginLeft: 'auto' }}><MoodBadge mood={c.moneyMood} t={t} small /></span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {ADS_LIVE && <NativeAdSlot t={t} />}

                {whaleCards.length > 0 && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'baseline' }}>
                      <SectionHead title={t.secWhale} sub={t.secWhaleSub} color={C.emerald} />
                      <button type="button" onClick={() => { setTab('whale'); window.scrollTo(0, 0); }} style={{ font: 'inherit', marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: C.emerald, background: 'none', border: 'none', cursor: 'pointer' }}>{t.more} →</button>
                    </div>
                    <div style={{ display: 'flex', gap: 11, overflowX: 'auto', margin: '0 -18px', padding: '2px 18px 6px', scrollSnapType: 'x mandatory' }}>
                      {whaleCards.slice(0, 6).map((c) => (
                        // 190px (was 172): the 20px logo + gap must coexist with the divergence
                        // badge — at 172 the badge overlapped the ticker text.
                        <button key={c.ticker} type="button" onClick={() => openDetail(c)} style={{ font: 'inherit', textAlign: 'left', cursor: 'pointer', padding: '14px 15px', flex: '0 0 190px', scrollSnapAlign: 'start', borderRadius: 18, border: 'none', background: `linear-gradient(160deg, ${C.emeraldDeep}, #0B3D2C)`, color: '#fff', boxShadow: C.shadow }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                              <TickerLogo ticker={c.ticker} size={20} />
                              <span style={{ fontSize: 12.5, fontWeight: 900 }}>{c.ticker}</span>
                            </span>
                            {c.divergence && <span style={{ fontSize: 9.5, fontWeight: 800, color: '#FFD9C4', background: 'rgba(194,65,12,0.55)', padding: '2px 7px', borderRadius: 999, flexShrink: 0 }}>{t.divergence}</span>}
                          </div>
                          <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.03em', margin: '10px 0 1px', fontVariantNumeric: 'tabular-nums' }}>
                            {Math.round(c.money?.darkPoolPct ?? 0)}<span style={{ fontSize: 15, fontWeight: 800, opacity: 0.75 }}>%</span>
                          </div>
                          <div style={{ fontSize: 10.5, fontWeight: 700, color: 'rgba(255,255,255,0.65)' }}>{t.offExchange}</div>
                          <div style={{ height: 5, borderRadius: 99, background: 'rgba(255,255,255,0.18)', marginTop: 9, overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(100, Math.max(4, c.money?.darkPoolPct ?? 0))}%`, height: '100%', background: '#5BE3A9', borderRadius: 99 }} />
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            {/* ── 매크로 TAB (world → market) ── */}
            {tab === 'macro' && macro && (
              <>
                <SectionHead title={t.macroTitle} sub={t.macroSub} color={C.ink} />

                {/* market context chips (OUR macro data) — indices first: the basics */}
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -18px', padding: '2px 18px 6px' }}>
                  {typeof macro.context.nasdaq === 'number' && (
                    <div style={{ flex: '0 0 auto', background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '8px 12px', boxShadow: C.shadow }}>
                      <div style={{ fontSize: 10, color: C.faint, fontWeight: 700 }}>{t.ctxNasdaq}</div>
                      <div style={{ fontSize: 15, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
                        {Math.round(macro.context.nasdaq).toLocaleString('en-US')}
                        {typeof macro.context.nasdaqChangePct === 'number' && (
                          <span style={{ fontSize: 11, fontWeight: 800, marginLeft: 4, color: macro.context.nasdaqChangePct >= 0 ? C.emerald : C.diverge }}>
                            {macro.context.nasdaqChangePct >= 0 ? '+' : ''}{macro.context.nasdaqChangePct.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {typeof macro.context.dow === 'number' && (
                    <div style={{ flex: '0 0 auto', background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '8px 12px', boxShadow: C.shadow }}>
                      <div style={{ fontSize: 10, color: C.faint, fontWeight: 700 }}>{t.ctxDow}</div>
                      <div style={{ fontSize: 15, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
                        {Math.round(macro.context.dow).toLocaleString('en-US')}
                        {typeof macro.context.dowChangePct === 'number' && (
                          <span style={{ fontSize: 11, fontWeight: 800, marginLeft: 4, color: macro.context.dowChangePct >= 0 ? C.emerald : C.diverge }}>
                            {macro.context.dowChangePct >= 0 ? '+' : ''}{macro.context.dowChangePct.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {typeof macro.context.yield10Y === 'number' && (
                    <div style={{ flex: '0 0 auto', background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '8px 12px', boxShadow: C.shadow }}>
                      <div style={{ fontSize: 10, color: C.faint, fontWeight: 700 }}>{t.ctx10Y}</div>
                      <div style={{ fontSize: 15, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
                        {macro.context.yield10Y.toFixed(2)}%
                        {typeof macro.context.yield10YChange === 'number' && macro.context.yield10YChange !== 0 && (
                          <span style={{ fontSize: 11, fontWeight: 800, marginLeft: 4, color: macro.context.yield10YChange > 0 ? C.diverge : C.emerald }}>
                            {macro.context.yield10YChange > 0 ? '+' : ''}{macro.context.yield10YChange.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                  {typeof macro.context.fedNoChange === 'number' && (
                    <div style={{ flex: '0 0 auto', background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '8px 12px', boxShadow: C.shadow }}>
                      <div style={{ fontSize: 10, color: C.faint, fontWeight: 700 }}>{t.ctxFed}</div>
                      <div style={{ fontSize: 15, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{Math.round(macro.context.fedNoChange)}%</div>
                    </div>
                  )}
                  {typeof macro.context.fearGreed === 'number' && (
                    <div style={{ flex: '0 0 auto', background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '8px 12px', boxShadow: C.shadow }}>
                      <div style={{ fontSize: 10, color: C.faint, fontWeight: 700 }}>{t.ctxFG}</div>
                      <div style={{ fontSize: 15, fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: macro.context.fearGreed < 30 ? C.diverge : macro.context.fearGreed > 70 ? C.emerald : C.ink }}>
                        {Math.round(macro.context.fearGreed)}
                      </div>
                    </div>
                  )}
                  {typeof macro.context.daysUntilFomc === 'number' && (
                    <div style={{ flex: '0 0 auto', background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: '8px 12px', boxShadow: C.shadow }}>
                      <div style={{ fontSize: 10, color: C.faint, fontWeight: 700 }}>{t.ctxFomc}</div>
                      <div style={{ fontSize: 15, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>D-{macro.context.daysUntilFomc}</div>
                    </div>
                  )}
                </div>

                {/* macroRead */}
                {macro.macroRead && (
                  <div style={{ marginTop: 10, background: C.card, borderRadius: 18, border: `1px solid ${C.line}`, boxShadow: C.shadow, padding: '14px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.09em', color: C.emerald, marginBottom: 6 }}>{t.macroReadTitle.toUpperCase()}</div>
                    <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.7, fontWeight: 550 as any }}>{macro.macroRead}</p>
                  </div>
                )}

                {/* macro news rows */}
                {macro.cards.map((c, i) => (
                  <span key={i}>
                    <article style={{
                      marginTop: 11, background: C.card, borderRadius: 18, border: `1px solid ${C.line}`,
                      boxShadow: C.shadow, padding: 14, display: 'flex', gap: 13, alignItems: 'flex-start',
                    }}>
                      {c.image && (
                        <div style={{ width: 92, height: 74, flexShrink: 0, borderRadius: 12, overflow: 'hidden', background: '#E8E4DC' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={c.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5, flexWrap: 'wrap' }}>
                          {c.tag && <span style={{ fontSize: 10.5, fontWeight: 800, color: C.faint }}>{c.tag}</span>}
                          <FreshBadge iso={c.publishedAt} t={t} />
                          <span style={{ marginLeft: 'auto' }}><ImpactBadge impact={c.marketImpact} t={t} /></span>
                        </div>
                        <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 800, lineHeight: 1.35, letterSpacing: '-0.01em' }}>{c.plainTitle}</h3>
                        {c.impactNote && (
                          <p style={{ margin: '6px 0 0', fontSize: 12.5, lineHeight: 1.55, color: C.sub }}>{c.impactNote}</p>
                        )}
                        {c.source && <div style={{ marginTop: 6, fontSize: 10.5, color: C.faint, fontWeight: 600 }}>{c.source}</div>}
                      </div>
                    </article>
                    {ADS_LIVE && i === 2 && <NativeAdSlot t={t} />}
                  </span>
                ))}
              </>
            )}

            {/* ── 괴리 TAB ── */}
            {tab === 'div' && (
              <>
                <SectionHead title={t.secDiv} sub={t.secDivSub} color={C.diverge} />

                {/* ── [SCOREBOARD] the trust loop: who was right 3 days later ── */}
                {scoreboard && (
                  <section style={{ marginTop: 12, background: C.card, borderRadius: 18, border: `1px solid ${C.line}`, boxShadow: C.shadow, padding: '14px 16px 15px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 900 }}>🏁 {t.sbTitle}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 650 as any, color: C.faint }}>{t.sbSub}</span>
                    </div>
                    {(scoreboard.record.money + scoreboard.record.news + scoreboard.record.flat) > 0 ? (
                      <>
                        <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
                          {[
                            { label: t.sbMoney, n: scoreboard.record.money, color: '#fff', bg: C.emeraldDeep },
                            { label: t.sbNews, n: scoreboard.record.news, color: '#fff', bg: C.diverge },
                            { label: t.sbFlat, n: scoreboard.record.flat, color: C.sub, bg: '#ECE8E0' },
                            { label: t.sbTracking, n: scoreboard.record.pending, color: C.sub, bg: '#ECE8E0' },
                          ].map((x) => (
                            <div key={x.label} style={{ flex: 1, textAlign: 'center', background: x.bg, color: x.color, borderRadius: 12, padding: '9px 4px' }}>
                              <div style={{ fontSize: 19, fontWeight: 900, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{x.n}</div>
                              <div style={{ fontSize: 9.5, fontWeight: 800, marginTop: 4, opacity: 0.85 }}>{x.label}</div>
                            </div>
                          ))}
                        </div>
                        {(scoreboard.recent || []).length > 0 && (
                          <div style={{ marginTop: 11, display: 'flex', flexDirection: 'column', gap: 7 }}>
                            {scoreboard.recent.slice(0, 5).map((r: any, i: number) => (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700 }}>
                                <span style={{ fontWeight: 900, minWidth: 44 }}>{r.ticker}</span>
                                <span style={{ fontSize: 10.5, color: C.faint, fontVariantNumeric: 'tabular-nums' }}>{r.dateET.slice(5).replace('-', '/')}</span>
                                <span style={{ fontVariantNumeric: 'tabular-nums', color: r.movePct >= 0 ? C.emerald : C.diverge }}>
                                  {r.movePct >= 0 ? '+' : ''}{r.movePct}%
                                </span>
                                <span style={{
                                  marginLeft: 'auto', fontSize: 10, fontWeight: 900, padding: '2.5px 8px', borderRadius: 999,
                                  color: r.verdict === 'money' ? '#fff' : r.verdict === 'news' ? '#fff' : C.sub,
                                  background: r.verdict === 'money' ? C.emeraldDeep : r.verdict === 'news' ? C.diverge : '#ECE8E0',
                                }}>
                                  {r.verdict === 'money' ? t.sbMoneyWin : r.verdict === 'news' ? t.sbNewsWin : t.sbFlatRes}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ marginTop: 10, fontSize: 12.5, lineHeight: 1.6, color: C.sub, fontWeight: 600 }}>
                        {t.sbEmpty}
                        {scoreboard.record.pending > 0 && (
                          <span style={{ fontWeight: 900, color: C.diverge }}> · {t.sbTracking} {scoreboard.record.pending}</span>
                        )}
                      </div>
                    )}
                  </section>
                )}

                {divCards.map((c, i) => (
                  <span key={c.ticker}>
                    <StoryRow c={c} />
                    {ADS_LIVE && i === 1 && <NativeAdSlot t={t} />}
                  </span>
                ))}
              </>
            )}

            {/* ── 큰손 TAB ── */}
            {tab === 'whale' && (
              <>
                <SectionHead title={t.secWhale} sub={t.secWhaleSub} color={C.emerald} />
                {whaleCards.map((c, i) => (
                  <span key={c.ticker}>
                    <button type="button" onClick={() => openDetail(c)} style={{
                      font: 'inherit', textAlign: 'left', cursor: 'pointer', width: '100%',
                      marginTop: 11, background: C.card, borderRadius: 18, border: `1px solid ${C.line}`,
                      boxShadow: C.shadow, padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 13,
                    }}>
                      <div style={{
                        width: 62, height: 62, borderRadius: 16, flexShrink: 0, color: '#fff',
                        background: `linear-gradient(160deg, ${C.emeraldDeep}, #0B3D2C)`,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <span style={{ fontSize: 17, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{Math.round(c.money?.darkPoolPct ?? 0)}%</span>
                        <span style={{ fontSize: 7.5, fontWeight: 800, opacity: 0.7, letterSpacing: '0.06em' }}>OFF-EXCH</span>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                          <TickerLogo ticker={c.ticker} size={22} />
                          <span style={{ fontSize: 12.5, fontWeight: 900 }}>{c.ticker}</span>
                          <FreshBadge iso={c.publishedAt} t={t} />
                          {c.divergence && <DivBadge t={t} small />}
                        </div>
                        <div style={{ fontSize: 13.5, fontWeight: 750 as any, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.plainTitle}</div>
                      </div>
                    </button>
                    {ADS_LIVE && i === 2 && <NativeAdSlot t={t} />}
                  </span>
                ))}
                {whaleCards.length === 0 && (
                  <div style={{
                    marginTop: 11, background: C.card, borderRadius: 18, border: `1px solid ${C.line}`,
                    boxShadow: C.shadow, padding: '20px 16px', fontSize: 13, lineHeight: 1.6, color: C.sub, fontWeight: 600,
                  }}>
                    {t.whaleEmpty}
                  </div>
                )}
              </>
            )}

            {/* ── 스토리 TAB (tag browse chips = variety) ── */}
            {tab === 'stories' && (() => {
              const tags = Array.from(new Set(cards.map((c) => c.tag).filter(Boolean))) as string[];
              const shown = storyTag ? cards.filter((c) => c.tag === storyTag) : cards;
              return (
                <>
                  <SectionHead title={t.secStories} sub={t.secStoriesSub} color={C.ink} />
                  {tags.length > 1 && (
                    <div style={{ display: 'flex', gap: 7, overflowX: 'auto', margin: '0 -18px', padding: '2px 18px 4px' }}>
                      {['', ...tags].map((tg) => {
                        const active = storyTag === tg;
                        return (
                          <button key={tg || '_all'} type="button" onClick={() => setStoryTag(tg)} style={{
                            font: 'inherit', fontSize: 12, fontWeight: 750 as any, cursor: 'pointer', whiteSpace: 'nowrap',
                            color: active ? '#fff' : C.ink, background: active ? C.ink : C.card,
                            border: `1px solid ${active ? C.ink : C.line}`, padding: '6px 13px', borderRadius: 999,
                          }}>
                            {tg || t.storiesAll}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {shown.map((c, i) => (
                    <span key={c.ticker}>
                      <StoryRow c={c} />
                      {ADS_LIVE && (i === 2 || i === 6) && <NativeAdSlot t={t} />}
                    </span>
                  ))}
                </>
              );
            })()}

            {/* ── 검색 TAB (ticker lookup = our data on ANY name) ── */}
            {tab === 'search' && (
              <>
                <form onSubmit={(e) => { e.preventDefault(); runSearch(searchQ); }} style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <input
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5))}
                    placeholder={t.searchPh}
                    autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                    style={{
                      font: 'inherit', flex: 1, fontSize: 15, fontWeight: 700, letterSpacing: '0.04em',
                      background: C.card, border: `1px solid ${C.line}`, borderRadius: 14,
                      padding: '13px 16px', color: C.ink, outline: 'none', boxShadow: C.shadow,
                    }}
                  />
                  <button type="submit" disabled={!searchQ} style={{
                    font: 'inherit', fontSize: 14, fontWeight: 800, cursor: 'pointer',
                    color: '#fff', background: searchQ ? C.ink : C.faint, border: 'none',
                    padding: '0 18px', borderRadius: 14,
                  }}>→</button>
                </form>

                {/* popular + recent chips */}
                {!searchRes && !searchBusy && (
                  <>
                    {recents.length > 0 && (
                      <>
                        <div style={{ fontSize: 11.5, fontWeight: 800, color: C.faint, letterSpacing: '0.05em', margin: '16px 2px 8px' }}>{t.recent}</div>
                        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                          {recents.map((tk) => (
                            <button key={tk} type="button" onClick={() => runSearch(tk)} style={{
                              font: 'inherit', fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
                              color: C.ink, background: C.card, border: `1px solid ${C.line}`,
                              padding: '7px 13px', borderRadius: 999,
                            }}>{tk}</button>
                          ))}
                        </div>
                      </>
                    )}
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: C.faint, letterSpacing: '0.05em', margin: '16px 2px 8px' }}>{t.popular}</div>
                    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                      {POPULAR_TICKERS.map((tk) => (
                        <button key={tk} type="button" onClick={() => runSearch(tk)} style={{
                          font: 'inherit', fontSize: 12.5, fontWeight: 800, cursor: 'pointer',
                          color: C.emeraldDeep, background: C.emeraldBg, border: `1px solid rgba(11,138,92,0.2)`,
                          padding: '7px 13px', borderRadius: 999,
                        }}>{tk}</button>
                      ))}
                    </div>
                  </>
                )}

                {searchBusy && (
                  <div style={{ padding: '50px 0', textAlign: 'center' }}>
                    <div style={{ width: 30, height: 30, margin: '0 auto 12px', borderRadius: '50%', border: `3px solid ${C.line}`, borderTopColor: C.emerald, animation: 'ucspin 0.9s linear infinite' }} />
                    <div style={{ fontSize: 13.5, color: C.sub, fontWeight: 600 }}>{t.searchBusy}</div>
                  </div>
                )}
                {searchErr && !searchBusy && (
                  <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13.5, color: C.sub }}>
                    {searchErr === 'empty' ? t.searchEmpty : t.error}
                  </div>
                )}

                {/* result: money header + tickerRead + stories */}
                {searchRes && !searchBusy && (
                  <>
                    <div style={{ marginTop: 16, background: C.card, borderRadius: 18, border: `1px solid ${C.line}`, boxShadow: C.shadow, padding: '14px 16px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <TickerLogo ticker={searchRes.ticker} size={26} />
                        <span style={{ fontSize: 19, fontWeight: 900, letterSpacing: '-0.01em' }}>{searchRes.ticker}</span>
                        {typeof searchRes.money?.price === 'number' && (
                          <span style={{ fontSize: 13.5, fontWeight: 750 as any, color: C.sub, fontVariantNumeric: 'tabular-nums' }}>${searchRes.money.price.toFixed(2)}</span>
                        )}
                      </div>
                      {searchRes.tickerRead && (
                        <div style={{ marginTop: 9, borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
                          <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', color: C.emerald, marginBottom: 5 }}>{t.tickerReadTitle.toUpperCase()}</div>
                          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.7, fontWeight: 550 as any }}>{searchRes.tickerRead}</p>
                        </div>
                      )}
                      {searchRes.hasMoneyData && (
                        <DeepLayer c={{ money: searchRes.money } as Card} t={t} />
                      )}
                    </div>
                    {searchRes.cards.length > 0 && (
                      <>
                        <SectionHead title={t.tickerNews} sub={t.secStoriesSub} color={C.ink} />
                        {searchRes.cards.map((c, i) => (
                          <span key={`${c.ticker}-${i}`}>
                            <StoryRow c={c} />
                            {ADS_LIVE && i === 1 && <NativeAdSlot t={t} />}
                          </span>
                        ))}
                      </>
                    )}
                  </>
                )}
              </>
            )}

            {cards.length > 0 && <UcFooter />}
          </div>
        )}
      </div>
      {showBreaking && (
        <div role="dialog" aria-modal="true" aria-label={t.breakingCenter} onClick={() => setShowBreaking(false)} style={{
          position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(23,25,30,0.45)',
          backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div onClick={(e) => e.stopPropagation()} className="uc-slideup" style={{
            width: '100%', maxWidth: 560, maxHeight: '78vh', overflowY: 'auto', overscrollBehavior: 'contain',
            background: C.bg, borderRadius: '22px 22px 0 0',
            padding: '16px 18px calc(26px + env(safe-area-inset-bottom))',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="mbz-pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: C.diverge, display: 'inline-block' }} />
              <span style={{ fontSize: 17, fontWeight: 900 }}>{t.breakingCenter}</span>
              <span style={{ fontSize: 11.5, color: C.faint, fontWeight: 600 }}>{t.breakingSub}</span>
              <button type="button" onClick={() => setShowBreaking(false)} aria-label={t.back} style={{
                marginLeft: 'auto', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer',
                background: C.card, border: `1px solid ${C.line}`, color: C.sub, fontSize: 15, lineHeight: 1,
              }}>×</button>
            </div>
            {breaking.length === 0 && (
              <div style={{ padding: '34px 0', textAlign: 'center', fontSize: 13.5, color: C.sub }}>{t.breakingEmpty}</div>
            )}
            {breaking.map((b, i) => (
              <button key={i} type="button" onClick={() => { setShowBreaking(false); if (b.kind === 'story' && b.card) openDetail(b.card); else { setTab('macro'); window.scrollTo(0, 0); } }} style={{
                font: 'inherit', textAlign: 'left', cursor: 'pointer', width: '100%',
                marginTop: 11, background: C.card, borderRadius: 16, border: `1px solid ${C.line}`,
                boxShadow: C.shadow, padding: '12px 14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 900, color: C.diverge }}>{freshness(b.publishedAt, t)?.label}</span>
                  <span style={{ fontSize: 10, fontWeight: 800, color: C.faint }}>{b.kind === 'macro' ? t.tabMacro : t.tabStories}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 750 as any, lineHeight: 1.4 }}>{b.title}</div>
              </button>
            ))}
            <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, background: C.card, border: `1px dashed rgba(23,25,30,0.18)`, borderRadius: 14, padding: '11px 13px' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.7 21a2 2 0 0 1-3.4 0" />
              </svg>
              <span style={{ fontSize: 12, color: C.sub, fontWeight: 600 }}>{t.pushSoon}</span>
            </div>
          </div>
        </div>
      )}
      {showSettings && (
        <div role="dialog" aria-modal="true" aria-label={t.stTitle} onClick={() => setShowSettings(false)} style={{
          position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(23,25,30,0.45)',
          backdropFilter: 'blur(5px)', WebkitBackdropFilter: 'blur(5px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div onClick={(e) => e.stopPropagation()} className="uc-slideup" style={{
            width: '100%', maxWidth: 560, maxHeight: '82vh', overflowY: 'auto', overscrollBehavior: 'contain',
            background: C.bg, borderRadius: '22px 22px 0 0',
            padding: '16px 18px calc(26px + env(safe-area-inset-bottom))',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 17, fontWeight: 900 }}>{t.stTitle}</span>
              <button type="button" onClick={() => setShowSettings(false)} aria-label={t.back} style={{
                marginLeft: 'auto', cursor: 'pointer', borderRadius: '50%',
                appearance: 'none', WebkitAppearance: 'none', boxSizing: 'border-box', padding: 0,
                width: 30, height: 30, minWidth: 30, minHeight: 30, maxWidth: 30, maxHeight: 30,
                aspectRatio: '1 / 1', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                background: C.card, border: `1px solid ${C.line}`, color: C.sub, fontSize: 15, lineHeight: 1,
              }}>×</button>
            </div>

            {/* language */}
            <div style={{ marginTop: 14, background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, boxShadow: C.shadow, padding: '13px 15px' }}>
              <div style={{ fontSize: 13.5, fontWeight: 850 as any }}>{t.stLang}</div>
              <div style={{ fontSize: 11, color: C.faint, fontWeight: 600, marginTop: 2 }}>{t.stLangSub}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                {([['en', 'English'], ['ja', '日本語'], ['ko', '한국어']] as [Locale, string][]).map(([k, label]) => {
                  const active = k === loc;
                  return (
                    <button key={k} type="button" onClick={() => {
                      try { localStorage.setItem('undercurrent.locale', k); } catch { /* noop */ }
                      if (k !== loc) {
                        // router nav only — window.location would open in-app Safari (Capacitor)
                        router.replace(`/${k}/undercurrent`);
                      }
                      setShowSettings(false);
                    }} style={{
                      font: 'inherit', flex: 1, cursor: 'pointer', fontSize: 13, fontWeight: active ? 900 : 700,
                      color: active ? '#fff' : C.ink, background: active ? C.ink : C.bg,
                      border: `1px solid ${active ? C.ink : C.line}`, borderRadius: 12, padding: '10px 0',
                    }}>{label}</button>
                  );
                })}
              </div>
            </div>

            {/* notifications (native push lands with a later app version) */}
            <div style={{ marginTop: 11, background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, boxShadow: C.shadow, padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 850 as any }}>{t.stNotif}</div>
                <div style={{ fontSize: 11, color: C.faint, fontWeight: 600, marginTop: 2 }}>{t.stNotifSub}</div>
              </div>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: C.sub, background: C.neutralBg, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>{t.stSoon}</span>
            </div>

            {/* rate the app — native only, official OS review sheet, no rewards */}
            {canRate && (
              <button type="button" onClick={() => { requestReview(); setShowSettings(false); }} style={{
                font: 'inherit', textAlign: 'left', cursor: 'pointer', width: '100%',
                marginTop: 11, background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, boxShadow: C.shadow,
                padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 850 as any }}>★ {t.stRate}</div>
                  <div style={{ fontSize: 11, color: C.faint, fontWeight: 600, marginTop: 2 }}>{t.stRateSub}</div>
                </div>
                <span style={{ color: C.faint, fontSize: 14 }}>→</span>
              </button>
            )}

            {/* legal */}
            <div style={{ fontSize: 11.5, fontWeight: 800, color: C.faint, letterSpacing: '0.05em', margin: '16px 2px 8px' }}>{t.stPolicy}</div>
            {([[t.stPrivacy, 'privacy'], [t.stTerms, 'terms']] as [string, string][]).map(([label, path]) => (
              <button key={path} type="button" onClick={() => { setShowSettings(false); router.push(`/${loc}/undercurrent/${path}`); }} style={{
                font: 'inherit', textAlign: 'left', cursor: 'pointer', width: '100%',
                marginTop: 8, background: C.card, borderRadius: 14, border: `1px solid ${C.line}`,
                padding: '12px 15px', display: 'flex', alignItems: 'center', gap: 10,
                fontSize: 13, fontWeight: 750 as any, color: C.ink,
              }}>
                {label}
                <span style={{ marginLeft: 'auto', color: C.faint, fontSize: 14 }}>→</span>
              </button>
            ))}

            <div style={{ marginTop: 16, textAlign: 'center', fontSize: 10.5, color: C.faint, fontWeight: 600 }}>
              {t.stVersion} 1.0.0 · Undercurrent by SIGNUM HQ, LLC
            </div>
          </div>
        </div>
      )}
      <TabBar />
      <style>{CSS_ANIM}</style>
    </div>
  );
}

const CSS_ANIM = `
@keyframes ucspin { to { transform: rotate(360deg); } }
@keyframes ucView { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
@keyframes ucUp { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: none; } }
.uc-view { animation: ucView .26s ease; }
.uc-view > * { animation: ucUp .34s ease backwards; }
.uc-view > *:nth-child(1) { animation-delay: .02s; }
.uc-view > *:nth-child(2) { animation-delay: .06s; }
.uc-view > *:nth-child(3) { animation-delay: .10s; }
.uc-view > *:nth-child(4) { animation-delay: .14s; }
.uc-view > *:nth-child(5) { animation-delay: .18s; }
.uc-view > *:nth-child(6) { animation-delay: .22s; }
.uc-slideup { animation: ucUp .3s cubic-bezier(.2,.7,.3,1); }
.uc-skel { background: linear-gradient(90deg, #ECE8E0 25%, #F5F2EB 50%, #ECE8E0 75%); background-size: 200% 100%; animation: ucShimmer 1.3s ease-in-out infinite; }
@keyframes ucShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
.mbz-pulse { animation: mbzPulse 1.6s ease-in-out infinite; }
@keyframes mbzPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
@media (prefers-reduced-motion: reduce) { .uc-view, .uc-view > *, .uc-slideup, .uc-skel, .mbz-pulse { animation: none !important; } }
`;
