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

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

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
    secDiv: '괴리 시그널', secDivSub: '뉴스와 돈이 반대로 움직이는 곳',
    secWhale: '큰손 레이더', secWhaleSub: '기관이 장외에서 조용히 움직인 비중',
    secStories: '오늘의 스토리', secStoriesSub: '돈의 반응과 함께 읽는 뉴스',
    connected: '연결된 흐름', more: '더 보기',
    offExchange: '장외 거래 비중',
    deepTitle: '심층 머니 레이어',
    deepLockedTitle: '이 종목의 심층 데이터',
    deepLockedDesc: '기관 장외 비중 · 풋/콜 보험 · 스퀴즈 압력 · 옵션 가격 지도',
    unlockBtn: '30초 영상 보고 열기',
    unlockNote: '(시제품: 탭하면 열립니다)',
    sigOff: '기관 장외 거래', sigPcr: '하락 보험(풋/콜)', sigSq: '스퀴즈 압력',
    bandNormal: '보통', bandHigh: '높음', bandVeryHigh: '매우 높음',
    pcrCall: '콜 우위 · 강세 성향', pcrBal: '균형', pcrPut: '풋 우위 · 방어적',
    sqLow: '낮음', sqMid: '중간', sqHigh: '높음',
    levels: '옵션 가격 지도', lvFloor: '방어선', lvMagnet: '자석', lvWall: '저항선', lvNow: '현재',
    ad: '광고 · 스폰서', adNative: '네이티브 광고 자리 — 콘텐츠와 같은 결',
    back: '뒤로', source: '출처',
    justNow: '방금 전', minAgo: '분 전', hrAgo: '시간 전', dayAgo: '일 전',
    tabMacro: '매크로',
    macroTitle: '세계 → 시장', macroSub: '시장을 흔드는 거시·지정학 속보',
    macroReadTitle: '지금 매크로 기류',
    riskOn: '위험선호', riskOff: '위험회피', mixed: '혼재',
    ctx10Y: '10년물 금리', ctxFed: '동결 확률', ctxFG: '공포·탐욕', ctxFomc: 'FOMC까지',
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
  },
  en: {
    tagline: 'The money moving behind the news',
    tabHome: 'Home', tabDiv: 'Diverge', tabWhale: 'Whales', tabStories: 'Stories',
    pulseTitle: 'Market undercurrent now',
    pulseB: 'Bullish', pulseC: 'Cautious', pulseD: 'Diverging',
    bullish: 'Money: bullish', cautious: 'Money: cautious', neutral: 'Money: neutral',
    divergence: 'News ≠ Money',
    moneyTitle: 'What the money is doing',
    secDiv: 'Divergence signals', secDivSub: 'Where news and money point opposite ways',
    secWhale: 'Whale radar', secWhaleSub: 'Institutional off-exchange share',
    secStories: "Today's stories", secStoriesSub: 'News read together with the money',
    connected: 'Connected flows', more: 'See all',
    offExchange: 'off-exchange share',
    deepTitle: 'Deep money layer',
    deepLockedTitle: 'Deep data for this ticker',
    deepLockedDesc: 'Institutional share · put/call insurance · squeeze · option price map',
    unlockBtn: 'Watch 30s video to unlock',
    unlockNote: '(prototype: tap to open)',
    sigOff: 'Institutional off-exchange', sigPcr: 'Downside insurance (put/call)', sigSq: 'Squeeze pressure',
    bandNormal: 'Normal', bandHigh: 'High', bandVeryHigh: 'Very high',
    pcrCall: 'Call-heavy · bullish lean', pcrBal: 'Balanced', pcrPut: 'Put-heavy · defensive',
    sqLow: 'Low', sqMid: 'Medium', sqHigh: 'High',
    levels: 'Option price map', lvFloor: 'Floor', lvMagnet: 'Magnet', lvWall: 'Wall', lvNow: 'Now',
    ad: 'Ad · Sponsored', adNative: 'Native ad slot — matches content style',
    back: 'Back', source: 'Source',
    justNow: 'just now', minAgo: 'm ago', hrAgo: 'h ago', dayAgo: 'd ago',
    tabMacro: 'Macro',
    macroTitle: 'World → Market', macroSub: 'Macro & geopolitical news shaking markets',
    macroReadTitle: 'Macro undercurrent now',
    riskOn: 'Risk-on', riskOff: 'Risk-off', mixed: 'Mixed',
    ctx10Y: '10Y yield', ctxFed: 'Hold odds', ctxFG: 'Fear & Greed', ctxFomc: 'To FOMC',
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
  },
  ja: {
    tagline: 'ニュースの裏で動くお金',
    tabHome: 'ホーム', tabDiv: '乖離', tabWhale: '大口', tabStories: 'ストーリー',
    pulseTitle: 'いまの市場の底流',
    pulseB: '強気', pulseC: '警戒', pulseD: '乖離',
    bullish: 'マネー: 強気', cautious: 'マネー: 警戒', neutral: 'マネー: 中立',
    divergence: 'ニュース ≠ マネー',
    moneyTitle: 'お金の動き',
    secDiv: '乖離シグナル', secDivSub: 'ニュースとお金が逆方向の銘柄',
    secWhale: '大口レーダー', secWhaleSub: '機関投資家の場外取引シェア',
    secStories: '今日のストーリー', secStoriesSub: 'お金の反応と一緒に読むニュース',
    connected: 'つながる流れ', more: 'すべて見る',
    offExchange: '場外取引シェア',
    deepTitle: 'ディープ・マネーレイヤー',
    deepLockedTitle: 'この銘柄のディープデータ',
    deepLockedDesc: '機関シェア · プット/コール保険 · スクイーズ · オプション価格マップ',
    unlockBtn: '30秒動画を見て開く',
    unlockNote: '(試作: タップで開きます)',
    sigOff: '機関の場外取引', sigPcr: '下落保険(プット/コール)', sigSq: 'スクイーズ圧力',
    bandNormal: '普通', bandHigh: '高い', bandVeryHigh: '非常に高い',
    pcrCall: 'コール優勢 · 強気', pcrBal: '均衡', pcrPut: 'プット優勢 · 防御的',
    sqLow: '低い', sqMid: '中間', sqHigh: '高い',
    levels: 'オプション価格マップ', lvFloor: '防衛線', lvMagnet: '磁石', lvWall: '抵抗線', lvNow: '現在',
    ad: '広告 · スポンサー', adNative: 'ネイティブ広告枠 — コンテンツと同じトーン',
    back: '戻る', source: '出典',
    justNow: 'たった今', minAgo: '分前', hrAgo: '時間前', dayAgo: '日前',
    tabMacro: 'マクロ',
    macroTitle: '世界 → 市場', macroSub: '市場を揺らすマクロ・地政学ニュース',
    macroReadTitle: 'いまのマクロ底流',
    riskOn: 'リスクオン', riskOff: 'リスクオフ', mixed: '混在',
    ctx10Y: '10年債利回り', ctxFed: '据え置き確率', ctxFG: '恐怖・強欲', ctxFomc: 'FOMCまで',
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
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', color: C.sub, marginBottom: 18 }}>{t.levels.toUpperCase()}</div>
      <div style={{ position: 'relative', height: 46 }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 21, height: 4, borderRadius: 99, background: 'linear-gradient(90deg, #DDEEE5, #EEECE6, #F3E3D2)' }} />
        {pts.map((p) => (
          <div key={p.key} style={{ position: 'absolute', left: `${pos(p.v)}%`, top: 0, transform: 'translateX(-50%)', textAlign: 'center' }}>
            <div style={{ fontSize: 9.5, fontWeight: 800, color: p.color, whiteSpace: 'nowrap' }}>{p.label}</div>
            <div style={{
              width: p.key === 'now' ? 13 : 9, height: p.key === 'now' ? 13 : 9, borderRadius: '50%',
              background: p.color, margin: `${p.key === 'now' ? 4 : 6}px auto 3px`,
              boxShadow: p.key === 'now' ? '0 0 0 4px rgba(23,25,30,0.12)' : 'none',
            }} />
            <div style={{ fontSize: 9.5, fontWeight: 750 as any, color: C.sub, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>${Math.round(p.v)}</div>
          </div>
        ))}
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
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
export default function UndercurrentPage() {
  const params = useParams();
  const loc = normLocale((params as any)?.locale);
  const t = T[loc];
  const [feed, setFeed] = useState<Feed | null>(null);
  const [err, setErr] = useState(false);
  const [tab, setTab] = useState<Tab>('home');
  const [detail, setDetail] = useState<Card | null>(null);
  const [unlocked, setUnlocked] = useState<Record<string, boolean>>({});
  // ── ticker search state ──
  const [searchQ, setSearchQ] = useState('');
  const [searchRes, setSearchRes] = useState<TickerResult | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchErr, setSearchErr] = useState<'' | 'empty' | 'fail'>('');
  const [recents, setRecents] = useState<string[]>([]);
  const [storyTag, setStoryTag] = useState<string>(''); // '' = all (stories tab browse chips)
  const [macro, setMacro] = useState<MacroResult | null>(null);

  useEffect(() => {
    let dead = false;
    fetch(`/api/undercurrent/macro?locale=${loc}`)
      .then((r) => r.json())
      .then((d) => { if (!dead && d?.success) setMacro(d); })
      .catch(() => { /* macro section simply hidden on failure */ });
    return () => { dead = true; };
  }, [loc]);

  useEffect(() => {
    try { setRecents(JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')); } catch { /* noop */ }
  }, []);

  const runSearch = (raw: string) => {
    const tk = raw.trim().toUpperCase();
    if (!/^[A-Z]{1,5}$/.test(tk)) return;
    setSearchQ(tk); setSearchBusy(true); setSearchErr(''); setSearchRes(null);
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
        } else {
          setSearchErr('empty');
        }
      })
      .catch(() => setSearchErr('fail'))
      .finally(() => setSearchBusy(false));
  };

  useEffect(() => {
    let dead = false;
    fetch(`/api/undercurrent/feed?locale=${loc}&limit=8`)
      .then((r) => r.json())
      .then((d) => {
        if (dead) return;
        if (!d?.success) { setErr(true); return; }
        setFeed(d);
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
        } catch { /* noop */ }
      })
      .catch(() => { if (!dead) setErr(true); });
    return () => { dead = true; };
  }, [loc]);

  const dateStr = useMemo(() => {
    const tag = loc === 'ko' ? 'ko-KR' : loc === 'ja' ? 'ja-JP' : 'en-US';
    return new Date().toLocaleDateString(tag, { month: 'long', day: 'numeric', weekday: 'short' });
  }, [loc]);

  const cards = feed?.cards || [];
  const hero = cards.find((c) => c.divergence) || cards[0];
  const divCards = cards.filter((c) => c.divergence);
  const whaleCards = [...cards]
    .filter((c) => (c.money?.darkPoolPct ?? 0) >= 40)
    .sort((a, b) => (b.money?.darkPoolPct ?? 0) - (a.money?.darkPoolPct ?? 0));
  const connected = (base: Card | null) =>
    base ? cards.filter((c) => c !== base && (c.moneyMood === base.moneyMood || (c.divergence && base.divergence))).slice(0, 3) : [];

  const isFree = (c: Card) => c === hero; // hero's deep layer is the free taste
  const isOpen = (c: Card) => isFree(c) || unlocked[c.ticker];

  const openDetail = (c: Card) => { setDetail(c); window.scrollTo(0, 0); };

  // ── shared story row ──
  const StoryRow = ({ c }: { c: Card }) => (
    <button type="button" onClick={() => openDetail(c)} style={{
      font: 'inherit', textAlign: 'left', cursor: 'pointer', width: '100%',
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
            <button type="button" onClick={() => setDetail(null)} aria-label={t.back} style={{
              font: 'inherit', cursor: 'pointer', width: 34, height: 34, borderRadius: '50%',
              background: C.card, border: `1px solid ${C.line}`, fontSize: 17, fontWeight: 800, color: C.ink,
            }}>←</button>
            <span style={{ fontSize: 14, fontWeight: 900 }}>{c.ticker}</span>
            <FreshBadge iso={c.publishedAt} t={t} />
            <span style={{ marginLeft: 'auto' }}><MoodBadge mood={c.moneyMood} t={t} small /></span>
          </header>

          {c.image && (
            <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', marginTop: 14, aspectRatio: '16/8', background: '#E8E4DC' }}>
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

          {/* money read */}
          {c.moneyRead && (
            <div style={{ marginTop: 16, background: C.card, borderRadius: 18, border: `1px solid ${C.line}`, boxShadow: C.shadow, padding: '14px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.09em', color: moodStyle(c.moneyMood).color, marginBottom: 6 }}>
                {t.moneyTitle.toUpperCase()}
              </div>
              <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.7, fontWeight: 550 as any }}>{c.moneyRead}</p>
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
                  <button type="button" onClick={() => setUnlocked((u) => ({ ...u, [c.ticker]: true }))} style={{
                    font: 'inherit', cursor: 'pointer', marginTop: 4,
                    fontSize: 13.5, fontWeight: 800, color: '#fff', background: C.ink,
                    border: 'none', padding: '11px 18px', borderRadius: 12,
                  }}>
                    ▶ {t.unlockBtn}
                  </button>
                  <div style={{ fontSize: 10, color: C.faint }}>{t.unlockNote}</div>
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

          <footer style={{ marginTop: 22, fontSize: 11, lineHeight: 1.6, color: C.faint, fontStyle: 'italic' }}>{t.disclaimer}</footer>
        </div>
        <style>{CSS_ANIM}</style>
      </div>
    );
  }

  // ── TAB VIEWS ──
  const TabBar = () => (
    <nav style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 60,
      background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
      borderTop: `1px solid ${C.line}`, display: 'flex',
      paddingBottom: 'env(safe-area-inset-bottom)',
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
        return (
          <button key={m.k} type="button" onClick={() => { setTab(m.k); window.scrollTo(0, 0); }} style={{
            font: 'inherit', cursor: 'pointer', flex: 1, padding: '11px 0 9px',
            background: 'none', border: 'none', color: active ? C.ink : C.faint,
          }}>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <span style={{ fontSize: 12.5, fontWeight: active ? 900 : 700 }}>{m.label}</span>
              {m.dot ? (
                <span style={{
                  position: 'absolute', top: -4, right: -14, fontSize: 8.5, fontWeight: 900, color: '#fff',
                  background: m.k === 'div' ? C.diverge : C.emerald, borderRadius: 999, padding: '1.5px 5px',
                }}>{m.dot}</span>
              ) : null}
            </div>
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: active ? C.ink : 'transparent', margin: '3px auto 0' }} />
          </button>
        );
      })}
    </nav>
  );

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.ink, fontFamily: "-apple-system,'SF Pro Display','Segoe UI',sans-serif" }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 18px calc(84px + env(safe-area-inset-bottom))' }}>

        {/* masthead */}
        <header style={{ paddingTop: 'calc(20px + env(safe-area-inset-top))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, background: C.ink, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/signum-sg-vectorized.svg" alt="SIGNUM" style={{ width: 20, height: 20 }} />
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.03em' }}>Undercurrent</span>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: C.faint }}>by SIGNUM HQ</span>
              </div>
              <div style={{ fontSize: 12.5, color: C.sub, fontWeight: 500 }}>{t.tagline}</div>
            </div>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: C.faint, fontWeight: 600, whiteSpace: 'nowrap' }}>{dateStr}</span>
          </div>
        </header>

        {/* loading / error */}
        {!feed && !err && (
          <div style={{ padding: '80px 0', textAlign: 'center' }}>
            <div style={{ width: 34, height: 34, margin: '0 auto 14px', borderRadius: '50%', border: `3px solid ${C.line}`, borderTopColor: C.emerald, animation: 'ucspin 0.9s linear infinite' }} />
            <div style={{ fontSize: 14, color: C.sub, fontWeight: 600 }}>{t.loading}</div>
          </div>
        )}
        {err && <div style={{ padding: '80px 0', textAlign: 'center', fontSize: 14, color: C.sub }}>{t.error}</div>}

        {feed && (
          <div key={tab} className="uc-view">
            {/* ── HOME ── */}
            {tab === 'home' && (
              <>
                {feed.pulse && (
                  <section style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, background: C.card, border: `1px solid ${C.line}`, borderRadius: 16, padding: '11px 14px', boxShadow: C.shadow }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: C.sub }}>{t.pulseTitle}</span>
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 11, fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap' }}>
                      <span style={{ color: C.emerald }}>● {t.pulseB} {feed.pulse.bullish}</span>
                      <span style={{ color: C.amber }}>● {t.pulseC} {feed.pulse.cautious}</span>
                      <span style={{ color: C.diverge }}>● {t.pulseD} {feed.pulse.divergences}</span>
                    </span>
                  </section>
                )}

                {/* macro teaser — the big picture that shakes markets */}
                {macro && macro.cards.length > 0 && (
                  <button type="button" onClick={() => { setTab('macro'); window.scrollTo(0, 0); }} style={{
                    font: 'inherit', textAlign: 'left', cursor: 'pointer', width: '100%', border: 'none',
                    marginTop: 12, borderRadius: 18, padding: '13px 15px', boxShadow: C.shadow,
                    background: `linear-gradient(135deg, ${C.ink}, #2A2E38)`, color: '#fff',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
                        <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', color: '#9BE8C4' }}>{t.macroTitle.toUpperCase()}</span>
                        <ImpactBadge impact={macro.cards[0].marketImpact} t={t} />
                      </div>
                      <div style={{ fontSize: 14.5, fontWeight: 800, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                        {macro.cards[0].plainTitle}
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 650 as any, marginTop: 5 }}>
                        {t.macroTeaser} · {macro.cards.length} →
                      </div>
                    </div>
                    {typeof macro.context.yield10Y === 'number' && (
                      <div style={{ flexShrink: 0, textAlign: 'center', background: 'rgba(255,255,255,0.09)', borderRadius: 12, padding: '8px 11px' }}>
                        <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.6)' }}>{t.ctx10Y}</div>
                        <div style={{ fontSize: 15, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{macro.context.yield10Y.toFixed(2)}%</div>
                      </div>
                    )}
                  </button>
                )}

                {hero && (
                  <button type="button" onClick={() => openDetail(hero)} style={{ font: 'inherit', textAlign: 'left', cursor: 'pointer', width: '100%', padding: 0, border: 'none', marginTop: 14, background: C.card, borderRadius: 22, overflow: 'hidden', outline: `1px solid ${C.line}`, boxShadow: C.shadow }}>
                    {hero.image && (
                      <div style={{ position: 'relative', aspectRatio: '16/9', background: '#E8E4DC' }}>
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
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: C.faint }}>{hero.ticker}</span>
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

                <NativeAdSlot t={t} />

                {whaleCards.length > 0 && (
                  <>
                    <div style={{ display: 'flex', alignItems: 'baseline' }}>
                      <SectionHead title={t.secWhale} sub={t.secWhaleSub} color={C.emerald} />
                      <button type="button" onClick={() => { setTab('whale'); window.scrollTo(0, 0); }} style={{ font: 'inherit', marginLeft: 'auto', fontSize: 12, fontWeight: 800, color: C.emerald, background: 'none', border: 'none', cursor: 'pointer' }}>{t.more} →</button>
                    </div>
                    <div style={{ display: 'flex', gap: 11, overflowX: 'auto', margin: '0 -18px', padding: '2px 18px 6px', scrollSnapType: 'x mandatory' }}>
                      {whaleCards.slice(0, 6).map((c) => (
                        <button key={c.ticker} type="button" onClick={() => openDetail(c)} style={{ font: 'inherit', textAlign: 'left', cursor: 'pointer', padding: '14px 15px', flex: '0 0 172px', scrollSnapAlign: 'start', borderRadius: 18, border: 'none', background: `linear-gradient(160deg, ${C.emeraldDeep}, #0B3D2C)`, color: '#fff', boxShadow: C.shadow }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 12.5, fontWeight: 900 }}>{c.ticker}</span>
                            {c.divergence && <span style={{ fontSize: 9.5, fontWeight: 800, color: '#FFD9C4', background: 'rgba(194,65,12,0.55)', padding: '2px 7px', borderRadius: 999 }}>{t.divergence}</span>}
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

                {/* market context chips (OUR macro data) */}
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -18px', padding: '2px 18px 6px' }}>
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
                    {i === 2 && <NativeAdSlot t={t} />}
                  </span>
                ))}
              </>
            )}

            {/* ── 괴리 TAB ── */}
            {tab === 'div' && (
              <>
                <SectionHead title={t.secDiv} sub={t.secDivSub} color={C.diverge} />
                {divCards.map((c, i) => (
                  <span key={c.ticker}>
                    <StoryRow c={c} />
                    {i === 1 && <NativeAdSlot t={t} />}
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
                          <span style={{ fontSize: 12.5, fontWeight: 900 }}>{c.ticker}</span>
                          <FreshBadge iso={c.publishedAt} t={t} />
                          {c.divergence && <DivBadge t={t} small />}
                        </div>
                        <div style={{ fontSize: 13.5, fontWeight: 750 as any, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{c.plainTitle}</div>
                      </div>
                    </button>
                    {i === 2 && <NativeAdSlot t={t} />}
                  </span>
                ))}
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
                      {(i === 2 || i === 6) && <NativeAdSlot t={t} />}
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
                            {i === 1 && <NativeAdSlot t={t} />}
                          </span>
                        ))}
                      </>
                    )}
                  </>
                )}
              </>
            )}

            {cards.length > 0 && (
              <footer style={{ marginTop: 22, fontSize: 11, lineHeight: 1.6, color: C.faint, fontStyle: 'italic' }}>{t.disclaimer}</footer>
            )}
          </div>
        )}
      </div>
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
.uc-slideup { animation: ucUp .3s cubic-bezier(.2,.7,.3,1); }
`;
