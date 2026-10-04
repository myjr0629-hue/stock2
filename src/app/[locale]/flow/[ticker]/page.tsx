// ============================================================================
// /[locale]/flow/[ticker] — programmatic SEO/GEO page (public, indexable).
// One page per ticker: the money snapshot (dark pool, max pain, option walls) +
// where the news and the money diverge. Unique proprietary data per page = clears
// Google's "scaled content" bar; structured data feeds LLM answer engines. Funnels
// to the apps via ?from=seo_* . Self-updating, zero daily human (see getView for freshness).
// ★2026-09-20 태그 분리: 다른 SEO 표면(darkpool·learn·rankings…)은 이미 제 태그가 있는데
//   «가장 큰» 이 표면(티커 6,684장)만 통짜 `seo` 였다. 3개 CTA 가 한 태그를 공유해
//   «티커 페이지 방문자가 어느 앱을 원하는지»를 알 길이 없었다 → seo_uc / seo_sg / seo_wim.
//   기존 `seo` 계열 누적(21일 142)은 분리 전 기준선으로 남는다.
// Does NOT touch the mobile apps or the app-view UI — a separate discovery surface.
// ============================================================================
import { cache } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { publicBase } from '@/lib/net/publicBase';
import { readDarkPool } from '@/lib/darkPoolRead';
import { getDarkPoolCurrent, type DarkPoolTicker } from '@/services/darkPool';
import { seoFreshness, etDate, mmdd } from '@/lib/seo/freshness';
import { FLOW_TICKERS } from '@/lib/seo/flowTickers';
import { CONCEPT_SLUGS, CONCEPTS } from '@/lib/seo/concepts';
import { ShareLanding } from '@/components/share/ShareLanding';
import { closeLabelOr, monthDay, weekdayName } from '@/lib/marketSession';
import { peekStructureLevelsDetailed } from '@/services/structureService';
import { displayLevels } from '@/lib/optionLevelGate';
import { markPageView } from '@/lib/marketing/pageViewMark';

// ⚠️ 이 페이지는 ISR 이 아니다. [locale]/layout 이 headers()·cookies() 를 읽어 매 요청
//    동적 렌더다(실측: cache-control private, no-store · x-vercel-cache MISS). 아래 값은
//    «페이지 캐시»가 아니라 설정 없는 fetch 의 기본값일 뿐이다. 실제 캐시는 getData 의
//    fetch 데이터 캐시 — Vercel 에서 배포를 넘어 살아남고, 만료되면 «옛 값을 주고 뒤에서
//    갱신»한다. 그래서 드물게 오는 페이지는 «직전 방문 때의 값»이 첫 방문자에게 나갔다
//    (2026-09-28 /ja/flow/SSD 첫 요청 09/18 → 두 번째 09/25). → getView 참조.
export const revalidate = 3600;
export const dynamicParams = true;

const TICKER_RE = /^[A-Z]{1,6}$/;
// «NULL»(자바스크립트 null 이 주소에 붙은 것)은 형식만 맞고 티커가 아니다 — 원천을 부르지 않고 404(9/30 UC 503 폭주 수리)
const isTicker = (t: string) => TICKER_RE.test(t) && t !== 'NULL';

interface Money {
  darkPoolPct: number | null; oiPcr: number | null; volumePcr: number | null;
  darkPoolShortPct?: number | null; darkPoolShortAvg?: number | null; darkPoolShortDev?: number | null;
  darkPoolVolRatio?: number | null;
  darkPoolStealth?: number | null; darkPoolRegime?: 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL' | null;
  darkPoolMarketAvg?: number | null; darkPoolDate?: string | null; changePct?: number | null;
  squeezeScore: number | null; maxPain: number | null; callWall: number | null;
  putFloor: number | null; price: number | null;
}
interface Card {
  plainTitle: string; whyItMatters: string | null; moneyRead: string | null;
  moneyMood: string; divergence: boolean; source: string | null; url: string | null;
  publishedAt?: string | null;
}
interface TickerData {
  success: boolean; ticker: string; money: Money; hasMoneyData: boolean;
  tickerRead: string | null; cards: Card[]; generatedAt?: string;
}

/**
 * UC 페이로드(AI 해석·뉴스·옵션 레벨). 생성에 Bedrock 이 들어가므로 여기서는 «사본»을
 * 쓴다 — 데이터 캐시가 옛 값을 즉시 주고 뒤에서 갱신한다. 이 사본의 숫자를 그대로
 * «현재»라고 말하지 않도록 getView 가 판본을 맞춰 본다.
 */
const UC_TIMEOUT_MS = 8000;
async function getData(locale: string, ticker: string): Promise<TickerData | null> {
  if (!isTicker(ticker)) return null;
  try {
    // ★2026-10-04: 사본이 없으면(롱테일 첫 방문 = 대개 크롤러) UC 생성(Bedrock)을 «기다렸다» — 운영 구글봇 실측
    //   /en/flow/RIVN 61초 무응답·KEEL 12.4초. 제목·설명·레벨은 이 사본 없이도 나온다(다크풀=FINRA 현재 판본,
    //   레벨=구조 판본) → 8초에서 끊는다. 만료 사본의 뒤 갱신에는 이 신호가 안 붙는다(Next 15.5 patch-fetch: isStale 이면 signal 제외).
    const r = await fetch(
      `${publicBase()}/api/undercurrent/ticker?t=${ticker}&locale=${locale}`,
      { next: { revalidate: 3600 }, signal: AbortSignal.timeout(UC_TIMEOUT_MS) },
    );
    if (!r.ok) return null;
    const d = await r.json();
    if (!d?.success) return null;
    return d as TickerData;
  } catch { return null; }
}

type View = {
  data: TickerData | null;
  /** 화면·제목·설명에 쓰는 숫자. 다크풀은 FINRA 현재 판본, 옵션 레벨은 페이로드. */
  m: Money;
  /** 옵션 레벨(가격·맥스페인·벽·풋콜·스퀴즈)을 «현재값»으로 말해도 되는가 */
  levelsFresh: boolean;
  /** 레벨이 낡았을 때 붙일 기준일(MM/DD, 페이로드가 만들어진 뉴욕 날짜) */
  levelsAsOf: string | null;
  /** AI 해석이 지금 보여 주는 다크풀 숫자와 «같은 판본» 위에서 쓰였는가 */
  proseFresh: boolean;
  /** 옵션 레벨 한 벌(맥스페인·콜월·풋플로어) — 구조 판본이 있으면 그것(만기·체인 날짜 포함), 없으면 페이로드 */
  lvl: Lvl | null;
};

/**
 * ★2026-10-04 검색 질의의 70%가 «{티커} max pain» 이다(GSC 28일: 노출 766 중 /flow/{T} 720, 보이는 질의 41개 중 23개가
 *   max pain — 순위 7~11위·클릭 0). 그 사람에게 답할 값 = 레벨 «한 벌»(lib/optionLevelGate · structureService 판본 —
 *   앱·대시보드·UC 와 같은 값)과 그 값이 걸린 만기·체인 날짜. 페이로드(UC 사본)는 «직전 방문» 때 것이라 롱테일은 제목에서
 *   숫자가 빠지고(SMH), 로케일마다 다른 시각의 사본이라 같은 종목 콜월이 en $19 / ja $18 로 달랐다(운영 실측).
 */
type Lvl = {
  maxPain: number | null; callWall: number | null; putFloor: number | null;
  /** 레벨을 계산한 만기 · 옵션 체인 날짜(YYYY-MM-DD) — 구조 판본에서 온 경우만, 아니면 null(지어내지 않는다) */
  exp: string | null; chain: string | null;
  /** «현재값»으로 말해도 되는가 — 구조 판본이 공급사 EOD 보다 뒤처지지 않음 / 페이로드가 신선 */
  live: boolean;
  /** live 가 아닐 때 붙일 기준일(MM/DD) */
  asOf: string | null;
};

/**
 * ★ 숫자는 «판본»으로 고른다 — 방문 간격이 숫자의 나이를 정하게 두지 않는다.
 *
 *  · 다크풀: 원천(FINRA)이 하나뿐이고 판본이 하루 한 번 바뀐다 → 페이지마다 사본을
 *    두지 않고 지금 저장된 판본을 직접 읽는다(getDarkPoolCurrent: 인스턴스 메모, 원본은
 *    판본이 바뀔 때만 다시 읽음, EC2 만 — Upstash 0, 사용자 경로에 무거운 계산 없음).
 *  · 옵션 레벨·AI 해석·뉴스: 원천이 Bedrock 생성물이라 6,669장을 매일 미리 만들 수 없다
 *    (토큰 한도). 그래서 사본을 쓰되 «그 사본이 어느 날의 것인가»를 따진다:
 *      - 레벨: 페이로드가 최신 세션일(FINRA 판본) 이후에 만들어졌을 때만 제목·설명·
 *        구조화 데이터에 넣는다. 아니면 본문에만 «MM/DD 기준»을 달아 보여 준다.
 *      - 해석(tickerRead·카드 moneyRead·괴리 표시): 해석이 쓰인 다크풀 날짜가 지금
 *        보여 주는 다크풀 날짜와 같을 때만. 다르면 숫자와 문장이 서로 다른 날을 말한다.
 *    나이를 «시간»이 아니라 «거래일»로 재므로 주말·휴장에 멀쩡한 금요일 값을 버리지 않는다.
 */
const getView = cache(async (locale: string, ticker: string): Promise<View | null> => {
  const [data, cur, sv] = await Promise.all([
    getData(locale, ticker),
    getDarkPoolCurrent(ticker),
    // 레벨 판본 읽기만(mget 한 번 · 계산 없음 · 갱신 예약 없음 — 크롤러 방문이 재계산을 부르지 않게)
    peekStructureLevelsDetailed([ticker], [], undefined, { refresh: false }).catch(() => null),
  ]);
  const dp: DarkPoolTicker | null = cur?.row ?? null;
  if (!data && !dp) return null;
  const pm: Partial<Money> = data?.money ?? {};

  // 거래일로 판본을 맞춘다(lib/seo/freshness.ts — 주말·ET 날짜 경계는 거기 시험이 있다)
  const f = seoFreshness({
    generatedAt: data?.generatedAt, payloadDpDate: pm.darkPoolDate ?? null,
    sourceRead: !!cur, session: cur?.session ?? null, rowDate: dp?.date ?? null,
  });
  const levelsFresh = !!data && f.levelsFresh;
  const basisMatch = f.basisMatch;
  const proseFresh = !!data && f.proseFresh;

  // 다크풀: 현재 판본이 있으면 그것, 없으면(원본 장애) 신선한 페이로드일 때만
  const useDp = dp ? {
    darkPoolPct: dp.pct, darkPoolShortPct: dp.shortPct, darkPoolShortAvg: dp.shortAvg,
    darkPoolShortDev: dp.shortDev, darkPoolVolRatio: dp.volRatio, darkPoolStealth: dp.stealth,
    darkPoolRegime: dp.regime, darkPoolMarketAvg: dp.marketAvg, darkPoolDate: dp.date,
  } : (!cur && levelsFresh ? {
    darkPoolPct: pm.darkPoolPct ?? null, darkPoolShortPct: pm.darkPoolShortPct ?? null,
    darkPoolShortAvg: pm.darkPoolShortAvg ?? null, darkPoolShortDev: pm.darkPoolShortDev ?? null,
    darkPoolVolRatio: pm.darkPoolVolRatio ?? null, darkPoolStealth: pm.darkPoolStealth ?? null,
    darkPoolRegime: pm.darkPoolRegime ?? null, darkPoolMarketAvg: pm.darkPoolMarketAvg ?? null,
    darkPoolDate: pm.darkPoolDate ?? null,
  } : { darkPoolPct: null });

  const m: Money = {
    ...useDp,
    // 등락률은 다크풀 해석을 «그날 주가 방향»과 엮는 데 쓴다 — 같은 날의 값일 때만
    changePct: basisMatch ? pm.changePct ?? null : null,
    price: pm.price ?? null, maxPain: pm.maxPain ?? null, callWall: pm.callWall ?? null,
    putFloor: pm.putFloor ?? null, squeezeScore: pm.squeezeScore ?? null,
    // ⚠️ volumePcr 는 이름과 반대로 «콜÷풋»이다 — 풋/콜 칸에 대신 넣으면 방향이 뒤집힌다.
    oiPcr: pm.oiPcr ?? null, volumePcr: null,
  };

  // 레벨: 구조 판본(만기가 오늘 이후인 것)을 표시 게이트(displayLevels)에 통과시켜 쓴다 — 다른 문과 같은 함수.
  //   표시 가격은 넘기지 않는다(재선택 → 갱신 예약을 부르지 않게) — 게이트는 판본의 기준가(S0)로 건다.
  const sl = sv?.levels.get(ticker) ?? null;
  const todayET = etDate(new Date().toISOString());
  const dl = sl && sl.levelsExpiration && todayET && sl.levelsExpiration >= todayET ? displayLevels(sl, null, 'web/flow-seo') : null;
  let lvl: Lvl | null = null;
  if (dl && (dl.maxPain != null || dl.callWall != null || dl.putFloor != null)) {
    lvl = {
      maxPain: dl.maxPain, callWall: dl.callWall, putFloor: dl.putFloor,
      exp: dl.levelsExpiration ?? null, chain: dl.levelsChainDate ?? null,
      live: !dl.levelsStaleReason, asOf: dl.levelsStaleReason ? mmdd(dl.levelsChainDate) : null,
    };
  } else if (data && (pm.maxPain != null || pm.callWall != null || pm.putFloor != null)) {
    lvl = {
      maxPain: pm.maxPain ?? null, callWall: pm.callWall ?? null, putFloor: pm.putFloor ?? null,
      exp: null, chain: null, live: levelsFresh, asOf: levelsFresh ? null : f.levelsAsOf,
    };
  }
  // 화면·제목·구조화 데이터가 한 벌만 보도록 m 의 레벨도 같은 값으로 맞춘다
  m.maxPain = lvl?.maxPain ?? null; m.callWall = lvl?.callWall ?? null; m.putFloor = lvl?.putFloor ?? null;
  return { data, m, levelsFresh, levelsAsOf: data ? f.levelsAsOf : null, proseFresh, lvl };
});

type Strings = {
  kicker: string; h1: (t: string) => string; sub: (t: string) => string; money: string; read: string; news: string;
  divergence: string; whatT: string; whatB: string; glossT: string; gloss: [string, string][];
  ctaT: string; ctaUc: string; ctaSg: string; ctaWim: string; disc: string;
  relT: string; allT: string; learnT: string; leadersT: string; rankT: string;
  lbl: Record<string, string>;
};
const L: Record<string, Strings> = {
  en: {
    kicker: 'Money-flow snapshot',
    // H1 = 들어오는 질의 그대로(«{T} max pain» · «{T} dark pool») — 예전 «{T} — The money right now» 에는 질의어가 하나도 없었다
    h1: (t) => `${t} Max Pain, Dark Pool & Options Flow`,
    sub: (t) => `What the institutional money is doing on ${t} right now — dark pool, options positioning, and where the news and the money disagree. Free.`,
    money: 'The money right now', read: 'What it means', news: 'News vs the money', divergence: 'DIVERGENCE',
    whatT: 'What is a “divergence”?',
    whatB: 'A divergence is when the news narrative and the institutional money flow point in opposite directions — a bearish headline while large call premium is bought, or heavy dark-pool selling under a bullish story. It signals the crowd and the desks may disagree.',
    glossT: 'How to read these numbers',
    gloss: [
      // ⛔ 「~40% 훨씬 위면 큰손 활발」이라고 써 있었다. 시장 평균이 51%다 —
      //    거의 모든 종목이 매일 그 조건을 만족하므로 아무 말도 못 하는 문장이었고,
      //    실제로 사용자를 오해시켰다. 기준선으로 다시 쓴다.
      ['Dark-pool volume', 'The share of trading executed off-exchange, at wholesalers and dark pools. About half of all US share volume prints there on an ordinary day, so the level by itself says almost nothing. What carries information is the distance from this name’s own recent norm, and whether the off-exchange size ran above its usual.'],
      ['Off-exchange short share', 'How much of that off-exchange volume was sold short. The median across all listed names is about 49%, because wholesalers filling retail buy orders sell short and cover later. A reading near half is plumbing, not a bearish vote — compare it to the same name’s own 20-day norm.'],
      ['Max pain', 'The price where the most options expire worthless — positioning often gravitates toward it near expiry.'],
      ['Call wall / Put floor', 'Strikes with the heaviest call/put open interest — they often act as short-term resistance and support.'],
      ['Put/Call ratio', 'Below ~0.7 leans bullish (more calls); above ~1 leans defensive (more puts).'],
    ],
    ctaT: 'See it live, free', rankT: 'Today’s rankings — what broke from normal', ctaUc: 'Get Undercurrent — the news behind the money',
    ctaSg: 'Add {t} to My Watchlist in the free SIGNUM HQ app (iPhone · Android)',
    ctaWim: "New to this? Why'd It Move? turns today's move into a 60-second lesson",
    disc: 'Data, scores and interpretations are for information and education only — not investment advice or a buy/sell recommendation. All decisions and outcomes are your own.',
  relT: 'Nearby tickers',
  allT: 'See all tickers',
  leadersT: 'Today’s off-exchange leaders',
  learnT: 'Learn the numbers',
    lbl: { darkPool: 'Dark pool share', mktAvg: 'market avg', dpVol: 'Dark pool volume vs its norm', dpShort: 'Short share of that', norm: 'norm', maxPain: 'Max pain', callWall: 'Call wall', putFloor: 'Put floor', price: 'Price', pcr: 'Put/Call ratio', squeeze: 'Squeeze pressure' },
  },
  ko: {
    kicker: '수급 스냅샷',
    h1: (t) => `${t} 맥스페인·다크풀·옵션 흐름`,
    sub: (t) => `지금 ${t}에 기관의 돈이 무엇을 하고 있나 — 다크풀·옵션 포지셔닝, 그리고 뉴스와 돈이 어긋나는 지점. 무료.`,
    money: '지금 돈은', read: '무슨 의미인가', news: '뉴스 vs 돈', divergence: '괴리',
    whatT: '“괴리(divergence)”란?',
    whatB: '괴리는 뉴스의 서사와 기관 자금 흐름이 반대를 가리킬 때입니다 — 약세 헤드라인인데 대규모 콜 프리미엄이 매수되거나, 강세 스토리 밑에서 다크풀 매도가 몰릴 때. 대중과 데스크가 엇갈릴 수 있다는 신호죠.',
    glossT: '이 숫자 읽는 법',
    gloss: [
      ['다크풀 비중', '거래소 밖(장외)에서 체결된 거래 비율. 평범한 날에도 미국 주식 거래량의 약 절반이 거기서 찍힙니다. 그래서 수치 자체는 거의 아무 말도 하지 않습니다. 정보는 그 종목의 «평소»에서 얼마나 벗어났는지, 그리고 장외 물량이 평소보다 많았는지에 있습니다.'],
      ['그중 공매도 비중', '그 장외 물량 중 공매도로 팔린 비율. 전 종목 중앙값이 약 49%입니다. 소매 매수의 상대가 되는 도매업자가 일단 공매도로 팔고 나중에 되사기 때문입니다. 절반 근처면 시장 배관이지 하락 베팅이 아닙니다 — 반드시 그 종목의 20일 평균과 비교하세요.'],
      ['맥스페인', '가장 많은 옵션이 소멸하는 가격. 만기 근처엔 포지셔닝이 이쪽으로 끌리곤 함.'],
      ['콜월 / 풋플로어', '콜/풋 미결제약정이 가장 두꺼운 행사가 — 단기 저항/지지로 작용하곤 함.'],
      ['풋/콜 비율', '~0.7 아래는 강세(콜 우세), ~1 위는 방어적(풋 우세).'],
    ],
    ctaT: '실시간으로 무료로 보기', rankT: '오늘의 랭킹 — 평소와 달라진 종목', ctaUc: 'Undercurrent 받기 — 뉴스 뒤의 돈',
    ctaSg: '무료 SIGNUM HQ 앱에서 {t} 를 내 종목에 담기 (아이폰·안드로이드)',
    ctaWim: "처음이라면 — Why'd It Move? 가 오늘의 움직임을 60초 문제로 만들어 줍니다",
    disc: '데이터·점수·해석은 정보·교육용이며 투자자문이나 매수/매도 권유가 아닙니다. 모든 판단과 결과의 책임은 본인에게 있습니다.',
  relT: '인접 종목',
  allT: '전체 종목 보기',
  leadersT: '오늘의 장외 상위 종목',
  learnT: '숫자를 읽는 법',
    lbl: { darkPool: '다크풀 비중', mktAvg: '시장 평균', dpVol: '다크풀 물량 (평소 대비)', dpShort: '그중 공매도 비중', norm: '평소', maxPain: '맥스페인', callWall: '콜월', putFloor: '풋플로어', price: '현재가', pcr: '풋/콜 비율', squeeze: '스퀴즈 압력' },
  },
  ja: {
    kicker: '資金フロー・スナップショット',
    h1: (t) => `${t} マックスペイン・ダークプール・オプションフロー`,
    sub: (t) => `いま${t}に機関のお金が何をしているか — ダークプール・オプション建玉、そしてニュースとお金が食い違うポイント。無料。`,
    money: 'いまのお金', read: 'どういう意味か', news: 'ニュース vs お金', divergence: '乖離',
    whatT: '「乖離(divergence)」とは？',
    whatB: '乖離とは、ニュースの物語と機関の資金フローが逆を向くこと — 弱気の見出しなのに大口のコールプレミアムが買われる、強気の話の裏でダークプール売りが集まる、など。大衆とデスクが食い違うサインです。',
    glossT: 'この数字の読み方',
    gloss: [
      ['ダークプール比率', '取引所外（ホールセラー・ダークプール）で約定した取引の割合。平常の日でも米国株の出来高の約半分がそこで付きます。だから水準そのものはほとんど何も語りません。情報は、その銘柄の「平常」からどれだけ離れたか、場外の規模が普段より多かったかにあります。'],
      ['うち空売り比率', 'その場外出来高のうち空売りで売られた割合。全銘柄の中央値は約49%です。個人の買い注文の相手方になるホールセラーが、いったん空売りで売ってあとで買い戻すためです。半分近くなら市場の配管であって弱気の一票ではありません — 必ずその銘柄の20日平均と比べてください。'],
      ['マックスペイン', '最も多くのオプションが無価値で満期を迎える価格。満期近くは建玉がここに引き寄せられがち。'],
      ['コールウォール / プットフロア', 'コール/プット建玉が最も厚い権利行使価格 — 短期の抵抗/支持として働きがち。'],
      ['プット/コール比', '~0.7未満は強気(コール優勢)、~1超は守勢(プット優勢)。'],
    ],
    ctaT: 'リアルタイムで無料で見る', rankT: '本日のランキング — 平常から外れた銘柄', ctaUc: 'Undercurrentを入手 — ニュースの裏側のお金',
    ctaSg: '無料アプリ SIGNUM HQ で {t} をマイ銘柄に追加（iPhone・Android）',
    ctaWim: "はじめてなら — Why'd It Move? が今日の値動きを60秒の問題にします",
    disc: 'データ・スコア・解釈は情報・教育目的であり、投資助言や売買推奨ではありません。すべての判断と結果は利用者ご自身の責任です。',
  relT: '近いティッカー',
  allT: '全ティッカーを見る',
  leadersT: '今日の場外上位銘柄',
  learnT: '数字の読み方',
    lbl: { darkPool: 'ダークプール比率', mktAvg: '市場平均', dpVol: 'ダークプール出来高（平常比）', dpShort: 'うち空売り比率', norm: '平常', maxPain: 'マックスペイン', callWall: 'コールウォール', putFloor: 'プットフロア', price: '現在値', pcr: 'プット/コール比', squeeze: 'スクイーズ圧力' },
  },
};

// ============================================================================
// 검색 결과에 보이는 «제목 + 설명» — 본문 문구와 분리해서 만든다.
// ----------------------------------------------------------------------------
// 왜 (2026-09-03 GSC + 실제 SERP 실측):
//   `uso dark pool` 은 이미 **6.3위**, `wdc max pain` 7.5위, `mrvl max pain` 9.6위,
//   `sofi dark pool activity` 7.8위 … 즉 1페이지에 있다.
//   그런데 이 무리의 노출 150+ 에 클릭이 **0** 이었다.
//   순위 문제가 아니라 «클릭이 안 눌리는» 문제다.
//
//   실제 구글 화면을 열어 보니 원인이 보였다:
//     우리        → "USO shows minimal positioning activity with no new options
//                    opened yesterday, while off-exchange volume sits well below
//                    normal (47% of the 20-day average), …"
//     Unusual Whales   → "Dark Pool Vol, Lit Vol, DP % … 16.13%"
//     Dark Pool Heatmap→ ★4.8(127) · Free · Finance
//
//   ① meta description 에 **AI 서술 요약(tickerRead)** 을 그대로 넣고 있었다.
//      데이터가 밋밋한 날엔 스니펫이 「여기 볼 것 없습니다」라고 말한다.
//      「{티커} dark pool」을 친 사람은 **숫자**를 찾는데 우리는 문장을 줬다.
//   ② 제목의 `(divergence)` 는 검색자에게 의미 없는 전문어이고 길이만 먹었다.
//   ③ `| Undercurrent` 도 마찬가지다 — 구글은 이미 «signumhq.com» 을 사이트명으로
//      따로 표시하고 있어(실측) 접미사는 보이는 60자 예산만 갉아먹는다.
//
//   → 제목·설명 모두 «숫자 먼저». 그리고 그 검색의 관련질문에
//     「Where can I see dark pool trades for free?」가 뜬다 — **Free** 를 앞쪽에 둔다.
//
// ⚠️ 서술 요약을 버리는 게 아니다. 본문과 OG(소셜 공유)에는 그대로 쓴다.
//    검색은 숫자를 원하고 소셜은 이야기를 원한다 — 쓰는 곳이 다를 뿐이다.
// ⚠️ 다음 사람에게: 이 변경의 성패는 **GSC 의 CTR** 로만 판단한다. 순위가 아니다.
//    지난번(2026-08-22)에 제목만 고치고 CTR 을 다시 안 봐서 6주를 날렸다.
// ============================================================================
const DESC_MAX = 158;   // 구글이 잘라내기 시작하는 대략 지점

const n1 = (v: number | null | undefined) => (v == null ? null : v.toFixed(1));
const n0 = (v: number | null | undefined) => (v == null ? null : v.toFixed(0));
/** 가격·행사가 표기 — 반올림으로 값을 바꾸지 않는다. 예전 `$${Math.round(v)}` 는 NIO 맥스페인 3.5 를 «$4»,
 *  풋플로어 2.5 를 «$3» 으로 냈다(2026-10-04 운영 구글봇 실측 — 제목·설명·본문·구조화 데이터 전부). */
const px = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? null
  : `$${v.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })}`);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const isYmd = (x: string | null | undefined): x is string => !!x && /^\d{4}-\d{2}-\d{2}$/.test(x);
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
/** 만기 날짜 — 짧게(제목·설명 «Oct 10»·«10/10») / 길게(본문 «Oct 10, 2026»). 날짜가 없으면 null */
function dayLbl(locale: string, ymd: string | null | undefined, long = false): string | null {
  if (!isYmd(ymd)) return null;
  const [y, mo, d] = ymd.split('-').map(Number);
  if (locale === 'ko') return long ? `${y}년 ${mo}월 ${d}일` : `${mo}/${d}`;
  if (locale === 'ja') return long ? `${y}年${mo}月${d}日` : `${mo}/${d}`;
  return long ? `${MON[mo - 1]} ${d}, ${y}` : `${MON[mo - 1]} ${d}`;
}
/** 옵션 체인 날짜 꼬리표 — «Fri Oct 2» · «10/2(금)» · «10/2(金)» (요일은 데이터 날짜로만) */
function chainLbl(locale: string, ymd: string | null | undefined): string | null {
  if (!isYmd(ymd)) return null;
  const loc = locale === 'ko' || locale === 'ja' ? locale : 'en';
  const wd = weekdayName(ymd, loc, true);
  return loc === 'en' ? `${wd} ${dayLbl('en', ymd)}` : `${monthDay(ymd)}(${wd})`;
}
/** 최근가와 맥스페인의 거리 — (가격−맥스페인)/맥스페인. 둘 다 있을 때만 */
function gapOf(price: number | null | undefined, mp: number | null | undefined): { pct: string; side: 'above' | 'below' | 'at' } | null {
  if (price == null || mp == null || !(price > 0) || !(mp > 0)) return null;
  const r = ((price - mp) / mp) * 100;
  if (Math.abs(r) < 0.05) return { pct: '0', side: 'at' };
  return { pct: Math.abs(r).toFixed(1), side: r > 0 ? 'above' : 'below' };
}

/**
 * ⚠️ 제목·설명에 넣는 숫자는 «현재 판본»뿐이다. 옵션 레벨이 낡은 사본에서 왔으면
 *    (levelsFresh=false) 맥스페인 «숫자»를 빼고 검색어(맥스페인)만 남긴다 —
 *    「毎日更新」 옆에 열흘 전 숫자를 두는 것이 이번에 고친 결함이다.
 */
const TITLE_MAX = 62;
function seoTitle(locale: string, t: string, m: Money | undefined, lvl: Lvl | null): string {
  const dp = n1(m?.darkPoolPct);
  // ★2026-10-04: 질의(«{T} max pain»)를 맨 앞에 — 예전 «{T} Dark Pool 46.1%, Max Pain $4 — …» 는 max pain 질의 23개가
  //   7~11위에 있으면서 클릭 0 이었다. 상위 10 의 경쟁 제목(flashalpha «ORCL Max Pain: $155 (13.9% below)»)도 값 먼저다.
  //   만기를 함께 단다 — 맥스페인은 만기마다 다른 값이다. «오늘»이라고 쓰지 않는다(체인은 EOD).
  const mp = lvl?.live ? px(lvl.maxPain) : null;
  const exp = mp ? dayLbl(locale, lvl?.exp) : null;
  const fit = (c: string[]) => c.find((x) => x.length <= TITLE_MAX) ?? c[c.length - 1];
  if (locale === 'ko') {
    if (mp) {
      const head = `${t} 맥스페인 ${mp}${exp ? ` (${exp} 만기)` : ''}`;
      return fit([dp ? `${head} · 다크풀 ${dp}% — 무료` : `${head} — 무료, 매일 갱신`, dp ? `${head} · 다크풀 ${dp}%` : head, head]);
    }
    return dp ? `${t} 맥스페인·다크풀 ${dp}% — 무료, 매일 갱신` : `${t} 맥스페인·다크풀 — 옵션 자금 흐름, 무료`;
  }
  if (locale === 'ja') {
    if (mp) {
      const head = `${t} マックスペイン${mp}${exp ? `（${exp}満期）` : ''}`;
      return fit([dp ? `${head}・ダークプール${dp}% — 無料` : `${head} — 無料、毎日更新`, dp ? `${head}・ダークプール${dp}%` : head, head]);
    }
    return dp ? `${t} マックスペイン・ダークプール${dp}% — 無料、毎日更新` : `${t} マックスペイン・ダークプール — オプションフロー、無料`;
  }
  if (mp) {
    const head = `${t} Max Pain ${mp}${exp ? ` (${exp} Exp)` : ''}`;
    return fit([dp ? `${head} · Dark Pool ${dp}% — Free` : `${head} — Free, Updated Daily`, dp ? `${head} · Dark Pool ${dp}%` : head, head]);
  }
  return dp ? `${t} Max Pain & Dark Pool ${dp}% — Free, Updated Daily` : `${t} Max Pain & Dark Pool — Free Options Flow`;
}

/** 문장 단위로만 붙인다(잘린 문장이 스니펫에 남지 않게). 일본어는 「。」 뒤에 공백을 두지 않는다. */
function joinSeg(locale: string, seg: string[]): string {
  const sp = locale === 'ja' ? '' : ' ';
  let out = '';
  for (const x of seg) {
    if ((out ? out.length + sp.length : 0) + x.length > DESC_MAX) break;
    out = out ? `${out}${sp}${x}` : x;
  }
  return out;
}

/**
 * ★2026-10-04 «{T} max pain» 질의의 답을 첫 문장으로: 맥스페인·만기·체인 날짜 → 최근가와의 거리 → 다크풀 → 벽.
 *   레벨을 «현재»로 말할 수 없으면(판본 뒤처짐·없음) 예전 다크풀 문장(seoDescDp)으로 내려간다.
 *   price 는 페이로드가 지금 다크풀 판본과 같은 세션일 때만(levelsFresh) 넘어온다 — 본문 «현재가» 칸과 같은 규칙.
 */
function seoDesc(locale: string, t: string, m: Money | undefined, l: Strings, lvl: Lvl | null, price: number | null): string {
  const mp = lvl?.live ? px(lvl.maxPain) : null;
  if (!lvl || !mp) return seoDescDp(locale, t, m, l);
  const dp = n1(m?.darkPoolPct);
  // 날짜 표기는 만기와 같은 모양으로(en «Oct 2» · ko/ja «10/2»)
  const sd = (ymd: string | null | undefined) => (!isYmd(ymd) ? null : locale === 'ko' || locale === 'ja' ? monthDay(ymd) : dayLbl('en', ymd));
  const dpDay = sd(m?.darkPoolDate);
  const exp = dayLbl(locale, lvl.exp);
  const ch = sd(lvl.chain);
  const g = gapOf(price, lvl.maxPain);
  const cw = px(lvl.callWall), pf = px(lvl.putFloor);
  const seg: string[] = [];
  if (locale === 'ko') {
    seg.push(`${t} 맥스페인 ${mp}${exp ? ` — ${exp} 만기` : ''}${ch ? `, ${ch} 옵션 체인 기준` : ''}.`);
    if (g) seg.push(g.side === 'at' ? `최근가 ${px(price)}, 맥스페인과 같은 자리.` : `최근가 ${px(price)}, 맥스페인보다 ${g.pct}% ${g.side === 'above' ? '위' : '아래'}.`);
    if (dp) seg.push(`다크풀 ${dp}%${dpDay ? ` (${dpDay} FINRA)` : ''}.`);
    if (cw || pf) seg.push(`${[cw ? `콜월 ${cw}` : '', pf ? `풋플로어 ${pf}` : ''].filter(Boolean).join(' · ')}.`);
    seg.push('무료, 매일 갱신.');
  } else if (locale === 'ja') {
    seg.push(`${t} マックスペイン${mp}${exp ? `（${exp}満期${ch ? `、${ch}のチェーン基準` : ''}）` : ''}。`);
    if (g) seg.push(g.side === 'at' ? `直近値${px(price)}はマックスペインと同水準。` : `直近値${px(price)}はマックスペインより${g.pct}%${g.side === 'above' ? '上' : '下'}。`);
    if (dp) seg.push(`ダークプール${dp}%${dpDay ? `（${dpDay} FINRA）` : ''}。`);
    if (cw || pf) seg.push(`${[cw ? `コールウォール${cw}` : '', pf ? `プットフロア${pf}` : ''].filter(Boolean).join('・')}。`);
    seg.push('無料・毎日更新。');
  } else {
    seg.push(`${t} max pain${exp ? ` for the ${exp} expiry` : ''} is ${mp}${ch ? ` (${ch} options chain)` : ''}.`);
    if (g) seg.push(g.side === 'at' ? `Last price ${px(price)} sits at max pain.` : `Last price ${px(price)} is ${g.pct}% ${g.side} it.`);
    if (dp) seg.push(`Dark pool ${dp}% of volume${dpDay ? ` (${dpDay} FINRA)` : ''}.`);
    if (cw || pf) seg.push(`${cap([cw ? `call wall ${cw}` : '', pf ? `put floor ${pf}` : ''].filter(Boolean).join(', '))}.`);
    seg.push('Free, updated daily.');
  }
  return joinSeg(locale, seg) || seoDescDp(locale, t, m, l);
}

/** 본문 첫 문단 — 질의 의도(맥스페인이 얼마인가)에 바로 답한다. 낡은 판본이면 «as of» 로 과거형. */
function answerLine(locale: string, t: string, lvl: Lvl | null, price: number | null): string | null {
  if (!lvl || lvl.maxPain == null || !(lvl.live || lvl.asOf)) return null;
  const mp = px(lvl.maxPain)!;
  const exp = dayLbl(locale, lvl.exp, true);
  const ch = chainLbl(locale, lvl.chain);
  const g = lvl.live ? gapOf(price, lvl.maxPain) : null;
  const cw = lvl.live ? px(lvl.callWall) : null, pf = lvl.live ? px(lvl.putFloor) : null;
  const out: string[] = [];
  if (locale === 'ko') {
    out.push(lvl.live
      ? `${t} 맥스페인은 ${exp ? `${exp} 만기 기준 ` : ''}${mp}입니다${ch ? ` (${ch} 옵션 체인)` : ''}.`
      : `${t} 맥스페인은 ${exp ? `${exp} 만기 기준 ` : ''}${mp}였습니다 (${ch ? `${ch} 옵션 체인 기준` : `${lvl.asOf} 기준`}).`);
    if (g) out.push(g.side === 'at' ? `최근가는 ${px(price)}로 맥스페인과 같은 자리입니다.` : `최근가는 ${px(price)}로 맥스페인보다 ${g.pct}% ${g.side === 'above' ? '위' : '아래'}입니다.`);
    if (cw || pf) out.push(`${[cw ? `콜월 ${cw}` : '', pf ? `풋플로어 ${pf}` : ''].filter(Boolean).join(' · ')}.`);
    return out.join(' ');
  }
  if (locale === 'ja') {
    out.push(lvl.live
      ? `${t}のマックスペインは${exp ? `${exp}満期で` : ''}${mp}です${ch ? `（${ch}のオプションチェーン）` : ''}。`
      : `${t}のマックスペインは${exp ? `${exp}満期で` : ''}${mp}でした（${ch ? `${ch}のオプションチェーン時点` : `${lvl.asOf}時点`}）。`);
    if (g) out.push(g.side === 'at' ? `直近値${px(price)}はマックスペインと同水準です。` : `直近値${px(price)}はマックスペインより${g.pct}%${g.side === 'above' ? '上' : '下'}です。`);
    if (cw || pf) out.push(`${[cw ? `コールウォール${cw}` : '', pf ? `プットフロア${pf}` : ''].filter(Boolean).join('・')}。`);
    return out.join('');
  }
  out.push(lvl.live
    ? `${t} max pain${exp ? ` for the ${exp} expiry` : ''} is ${mp}${ch ? `, from the ${ch} options chain` : ''}.`
    : `${t} max pain${exp ? ` for the ${exp} expiry` : ''} was ${mp} as of ${ch ? `the ${ch} options chain` : lvl.asOf}.`);
  if (g) out.push(g.side === 'at' ? `The last price, ${px(price)}, sits at max pain.` : `The last price, ${px(price)}, is ${g.pct}% ${g.side} it.`);
  if (cw || pf) out.push(`${cap([cw ? `call wall ${cw}` : '', pf ? `put floor ${pf}` : ''].filter(Boolean).join(' · '))}.`);
  return out.join(' ');
}

/** 레벨을 «현재»로 말할 수 없을 때의 설명문 — 다크풀 숫자부터. 데이터가 없으면 기존 정적 문구로 안전하게 내려간다. */
function seoDescDp(locale: string, t: string, m: Money | undefined, l: Strings): string {
  const dp = n1(m?.darkPoolPct);
  if (!dp) return l.sub(t).slice(0, DESC_MAX);

  const avg = n0(m?.darkPoolMarketAvg);
  const vr = m?.darkPoolVolRatio != null ? m.darkPoolVolRatio.toFixed(1) : null;
  // FINRA 는 T+1 이다 — 날짜를 밝혀야 «오늘 갱신»이 거짓말이 되지 않는다.
  const day = m?.darkPoolDate ? m.darkPoolDate.slice(5).replace('-', '/') : null;

  const seg: string[] = [];
  if (locale === 'ko') {
    seg.push(`${t} 다크풀 ${dp}%${avg ? ` (시장 평균 ${avg}%)` : ''}${vr ? `, 평소의 ${vr}배` : ''}.`);
    seg.push(`FINRA 원본, 매일 무료${day ? ` — ${day} 기준` : ''}.`);
  } else if (locale === 'ja') {
    seg.push(`${t} ダークプール ${dp}%${avg ? `（市場平均${avg}%）` : ''}${vr ? `、平常の${vr}倍` : ''}。`);
    seg.push(`FINRA原文、毎日無料${day ? ` — ${day}時点` : ''}。`);
  } else {
    seg.push(`${t} dark pool ${dp}% of volume${avg ? ` (market avg ${avg}%)` : ''}${vr ? `, ${vr}× its norm` : ''}.`);
    seg.push(`Free, from FINRA’s tape${day ? ` — ${day}` : ''}.`);
  }
  return joinSeg(locale, seg) || l.sub(t).slice(0, DESC_MAX);
}

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string; ticker: string }> },
): Promise<Metadata> {
  const { locale, ticker: raw } = await params;
  const ticker = (raw || '').toUpperCase();
  const l = L[locale] ?? L.en;
  const base = publicBase();
  const v = isTicker(ticker) ? await getView(locale, ticker) : null;
  const m = v?.m;
  const fresh = !!v?.levelsFresh;
  // ★ 로케일별 제목은 그대로 유지한다 (2026-08-22 실측 근거):
  //   세 로케일이 «영어 제목 하나»를 공유하고 <html lang> 까지 전부 ko 였을 때
  //   구글이 셋을 같은 문서로 보고 /ko/flow/* 150건을
  //   "Duplicate without user-selected canonical" 로 색인에서 뺐다.
  //   제목을 언어별로 갈라야 «다른 문서»가 된다 — seoTitle 이 그 규칙을 지킨다.
  const lvl = v?.lvl ?? null;
  const title = seoTitle(locale, ticker, m, lvl);
  const desc = seoDesc(locale, ticker, m, l, lvl, fresh ? m?.price ?? null : null);
  // 소셜 카드에는 서술 요약을 그대로 쓴다 — 공유는 이야기로 읽힌다(지금 숫자와 같은 판본일 때만).
  const social = ((v?.proseFresh && v.data?.tickerRead) || desc).slice(0, 200);
  const og = new URLSearchParams({ ticker, priceLabel: 'PRICE' });
  if (fresh && m?.price) og.set('price', String(m.price));
  if (lvl?.live && lvl.callWall) og.set('callWall', String(lvl.callWall));
  if (lvl?.live && lvl.maxPain) og.set('maxPain', String(lvl.maxPain));
  if (lvl?.live && lvl.putFloor) og.set('putFloor', String(lvl.putFloor));
  const ogUrl = `${base}/api/og/level?${og.toString()}`;
  const url = `${base}/${locale}/flow/${ticker}`;
  return {
    title, description: desc,
    alternates: {
      canonical: url,
      languages: {
        en: `${base}/en/flow/${ticker}`, ko: `${base}/ko/flow/${ticker}`, ja: `${base}/ja/flow/${ticker}`,
        // x-default = «어떤 언어에도 안 맞는 방문자에게 무엇을 줄지». 이게 없으면
        // 세 판이 서로 «언어 변형»이라는 신호가 약해진다 — 1,800페이지에 빠져 있었다.
        'x-default': `${base}/en/flow/${ticker}`,
      },
    },
    openGraph: { title, description: social, url, images: [ogUrl], type: 'article' },
    twitter: { card: 'summary_large_image', title, description: social, images: [ogUrl] },
    // 스마트앱배너(Undercurrent — 본문 1순위 CTA 도 UC, 2026-08-22)는 루트 layout 의 <head> 가 경로로 고른다
    // (smartBannerAppId — metadata 로 두면 사람에게는 본문으로 스트리밍돼 head 에 없다, 2026-09-30).
  };
}


export default async function FlowTickerPage(
  { params, searchParams }: { params: Promise<{ locale: string; ticker: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> },
) {
  const { locale, ticker: raw } = await params;
  const ticker = (raw || '').toUpperCase();
  if (!isTicker(ticker)) notFound();
  const view = await getView(locale, ticker);
  if (!view) notFound();
  await markPageView('ticker', locale); // 사람 페이지뷰 — 응답 뒤 집계(lib/marketing/pageViewHuman)
  const { data, m, levelsFresh, levelsAsOf, proseFresh, lvl } = view;
  const l = L[locale] ?? L.en;
  const cards = (data?.cards || []).filter((c) => c.plainTitle);
  // 풋/콜 = 미결제약정 풋÷콜 하나만. (volumePcr 는 콜÷풋이라 대신 쓰면 방향이 뒤집힌다)
  const pcr = m.oiPcr;
  // 낡은 사본에서 온 레벨에 붙이는 기준일 — 숫자를 숨기지 않되 «언제 것»인지 밝힌다
  const asOf = levelsAsOf
    ? (locale === 'ko' ? `${levelsAsOf} 기준` : locale === 'ja' ? `${levelsAsOf}時点` : `as of ${levelsAsOf}`)
    : null;
  // JSON-LD 용 (generateMetadata 와 같은 값을 컴포넌트 스코프에서도 쓴다)
  const base = publicBase();
  const url = `${base}/${locale}/flow/${ticker}`;
  const desc = ((proseFresh && data?.tickerRead) || l.sub(ticker)).slice(0, 200);

  // 이 페이지에 검색으로 들어오는 질의는 사실상 「{티커} dark pool」이다.
  // 그러니 다크풀을 가격 다음이 아니라 **맨 앞**에 두고, 시장 평균과
  // «평소의 몇 배»까지 함께 보여 준다 — 숫자 하나로는 판단이 안 된다.
  // 해석은 앱 카드·AI 와 **같은 엔진**을 쓴다 — 화면마다 다른 말을 하면 안 된다
  const dpRead = m.darkPoolPct != null
    ? readDarkPool(
        { pct: m.darkPoolPct, marketAvg: m.darkPoolMarketAvg ?? null, volRatio: m.darkPoolVolRatio ?? null,
          shortPct: m.darkPoolShortPct ?? null, shortAvg: m.darkPoolShortAvg ?? null, shortDev: m.darkPoolShortDev ?? null,
          regime: m.darkPoolRegime ?? null, date: m.darkPoolDate ?? null,
          changePct: m.changePct ?? null },
        (locale === 'ko' || locale === 'ja' ? locale : 'en') as 'ko' | 'en' | 'ja',
      )
    : null;

  // [라벨, 값, 꼬리표(만기 또는 기준일), 현재값인가(구조화 데이터 variableMeasured 에 싣는가)]
  const metrics: [string, string, string | null, boolean][] = [];
  if (m.darkPoolPct != null) {
    metrics.push([
      l.lbl.darkPool,
      m.darkPoolMarketAvg != null
        ? `${m.darkPoolPct.toFixed(1)}%  (${l.lbl.mktAvg} ${m.darkPoolMarketAvg.toFixed(0)}%)`
        : `${m.darkPoolPct.toFixed(1)}%`,
      null, true,
    ]);
    if (m.darkPoolVolRatio != null) metrics.push([l.lbl.dpVol, `${m.darkPoolVolRatio.toFixed(1)}×`, null, true]);
    if (m.darkPoolShortPct != null) metrics.push([l.lbl.dpShort,
      m.darkPoolShortAvg != null
        ? `${m.darkPoolShortPct.toFixed(1)}%  (${l.lbl.norm} ${m.darkPoolShortAvg.toFixed(0)}%)`
        : `${m.darkPoolShortPct.toFixed(1)}%`, null, true]);
  }
  // 현재가는 낡은 사본이면 아예 싣지 않는다 — «현재가»라는 이름 자체가 지금을 주장한다.
  // 나머지 레벨은 신선하거나, 낡았어도 «언제 것»인지 밝힐 수 있을 때만 싣는다.
  const lv = levelsFresh || !!asOf;
  if (m.price != null && levelsFresh) metrics.push([l.lbl.price, px(m.price)!, null, true]);
  // 레벨(맥스페인·벽)은 구조 판본 한 벌 — 현재값이면 «만기» 꼬리표, 뒤처진 판본이면 기준일
  const lvShow = !!lvl && (lvl.live || !!lvl.asOf);
  const lvNote = !lvl ? null : lvl.live
    ? (lvl.exp ? (locale === 'ko' ? `${dayLbl('ko', lvl.exp)} 만기` : locale === 'ja' ? `${dayLbl('ja', lvl.exp)}満期` : `${dayLbl('en', lvl.exp)} exp`) : null)
    : (lvl.asOf ? (locale === 'ko' ? `${lvl.asOf} 기준` : locale === 'ja' ? `${lvl.asOf}時点` : `as of ${lvl.asOf}`) : null);
  if (lvShow && lvl!.maxPain != null) metrics.push([l.lbl.maxPain, px(lvl!.maxPain)!, lvNote, lvl!.live]);
  if (lvShow && lvl!.callWall != null) metrics.push([l.lbl.callWall, px(lvl!.callWall)!, lvNote, lvl!.live]);
  if (lvShow && lvl!.putFloor != null) metrics.push([l.lbl.putFloor, px(lvl!.putFloor)!, lvNote, lvl!.live]);
  if (lv && pcr != null) metrics.push([l.lbl.pcr, pcr.toFixed(2), asOf, !asOf]);
  if (lv && m.squeezeScore != null) metrics.push([l.lbl.squeeze, String(Math.round(m.squeezeScore)), asOf, !asOf]);
  const answer = answerLine(locale, ticker, lvl, levelsFresh ? m.price : null);

  // JSON-LD FAQ from the real data — rich results + LLM extraction
  const faq: { q: string; a: string }[] = [];
  if (m.darkPoolPct != null) {
    const bits = [`${m.darkPoolPct.toFixed(1)}% of ${ticker}'s volume was executed off-exchange (dark pools and wholesalers) on ${m.darkPoolDate ?? 'the prior session'}`];
    if (m.darkPoolMarketAvg != null) bits.push(`against a ${m.darkPoolMarketAvg.toFixed(0)}% average across all listed names that day`);
    if (m.darkPoolVolRatio != null) bits.push(`that off-exchange volume was ${m.darkPoolVolRatio.toFixed(1)}x ${ticker}'s own 20-day norm`);
    if (m.darkPoolShortPct != null) bits.push(`${m.darkPoolShortPct.toFixed(1)}% of it was short`);
    const en = readDarkPool(
      { pct: m.darkPoolPct, marketAvg: m.darkPoolMarketAvg ?? null, volRatio: m.darkPoolVolRatio ?? null,
        shortPct: m.darkPoolShortPct ?? null, shortAvg: m.darkPoolShortAvg ?? null, shortDev: m.darkPoolShortDev ?? null,
        regime: m.darkPoolRegime ?? null, changePct: m.changePct ?? null }, 'en');
    faq.push({ q: `What is ${ticker}'s dark pool volume today?`, a: `${bits.join('; ')}. ${en.headline}. ${en.detail} Source: FINRA.` });
  }
  // 레벨은 «현재 판본»일 때만 구조화 데이터에 싣는다 — 검색엔진·LLM 은 날짜 없이 인용한다
  if (lvl?.live && lvl.maxPain != null) faq.push({ q: `What is ${ticker}'s max pain?`, a: `${ticker}'s max pain${lvl.exp ? ` for the ${dayLbl('en', lvl.exp, true)} expiry` : ''} is ${px(lvl.maxPain)}${lvl.chain ? `, computed from the ${lvl.chain} options chain` : ''}.` });
  if (lvl?.live && (lvl.callWall != null || lvl.putFloor != null)) faq.push({ q: `What are ${ticker}'s option walls?`, a: `${cap([lvl.callWall != null ? `call wall ${px(lvl.callWall)}` : '', lvl.putFloor != null ? `put floor ${px(lvl.putFloor)}` : ''].filter(Boolean).join(', '))}.` });
  // ⛔ 2026-08-20: 여기는 FAQPage 하나만 내보내고 있었다. 구글은 FAQ 리치결과를
  //    검색 갤러리에서 사실상 걷어냈으므로(일반 사이트엔 미표시) 노출 기여가 0이다.
  //    그래서 «지금도 지원되는» 타입으로 갈아끼운다:
  //      Dataset        — 이 페이지의 본체는 «데이터»다. 구글 데이터셋 검색 대상.
  //      BreadcrumbList — 검색결과에 경로가 붙어 CTR 이 오른다.
  //      Organization   — 브랜드 엔티티(sameAs 로 스토어·SNS 를 묶는다)
  //    FAQ 항목은 LLM 추출용으로 Dataset.description 에 문장으로 남긴다(마크업이 아니라 텍스트).
  const brand = `${base}/#org`;
  const jsonLd: Record<string, unknown>[] = [
    {
      '@context': 'https://schema.org', '@type': 'Dataset', '@id': `${url}#dataset`,
      name: `${ticker} options flow, dark pool and max pain`,
      description: [desc, ...faq.map((f) => `${f.q} ${f.a}`)].join(' ').slice(0, 1200),
      url,
      isAccessibleForFree: true,
      // ⚠️ `@id` 참조만 두면 구글이 객체 타입을 못 읽는다
      //    (GSC: Invalid object type for field "creator", 2026-08-31).
      //    같은 문서 안에 Organization 노드가 있어도 @type 을 인라인으로 줘야 한다.
      creator: { '@type': 'Organization', '@id': brand, name: 'SIGNUM HQ' },
      variableMeasured: metrics.filter(([, , , live]) => live).map(([k]) => k),
      // 이 데이터가 «어느 세션의 것인가» — FINRA 기준일(검색엔진에 신선도를 정직하게 알린다)
      ...(m.darkPoolDate ? { dateModified: m.darkPoolDate } : {}),
      inLanguage: locale,
      // Google Rich Results Test 가 지적한 유일한 항목(비치명, 선택 필드).
      // 595 페이지 전부에 걸리므로 채운다. 우리 이용약관이 이 데이터의 라이선스다.
      license: `${base}/${locale}/terms`,
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Undercurrent', item: `${base}/${locale}/undercurrent` },
        { '@type': 'ListItem', position: 2, name: ticker, item: url },
      ],
    },
    {
      '@context': 'https://schema.org', '@type': 'Organization', '@id': brand,
      name: 'SIGNUM HQ', url: base, logo: `${base}/icons/icon-192x192.png`,
      sameAs: [
        'https://x.com/signumhq',
        'https://x.com/signumhq_jp',
        'https://apps.apple.com/app/id6783130444',
        'https://apps.apple.com/app/id6788779895',
        'https://apps.apple.com/app/id6794356135',
        'https://play.google.com/store/apps/details?id=com.signumhq.app',
        'https://play.google.com/store/apps/details?id=com.signumhq.undercurrent',
        'https://play.google.com/store/apps/details?id=com.signumhq.wim',
      ],
    },
  ];

  const S = {
    wrap: { maxWidth: 720, margin: '0 auto', padding: '32px 20px 64px', fontFamily: 'Pretendard, system-ui, sans-serif', color: '#17191E', lineHeight: 1.6 } as const,
    kicker: { fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#C2410C' },
    h1: { fontSize: 30, fontWeight: 900, margin: '6px 0 4px' },
    sub: { fontSize: 15, color: '#55606B', margin: '0 0 24px' },
    answer: { fontSize: 17, fontWeight: 700, color: '#17191E', margin: '6px 0 8px', lineHeight: 1.5 },
    sec: { fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#8A939E', margin: '28px 0 10px' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 } as const,
    cell: { border: '1px solid #E7E3DA', borderRadius: 12, padding: '12px 14px', background: '#FAF8F3' } as const,
    cellLbl: { fontSize: 12, color: '#8A939E', fontWeight: 700 },
    cellVal: { fontSize: 20, fontWeight: 850 as any, fontVariantNumeric: 'tabular-nums' as const },
    read: { fontSize: 15, background: '#F3F5F4', border: '1px solid #E1E7E4', borderRadius: 12, padding: '14px 16px', margin: '12px 0 0' },
    card: { border: '1px solid #E7E3DA', borderRadius: 12, padding: '14px 16px', marginBottom: 10 } as const,
    divTag: { fontSize: 11, fontWeight: 900, color: '#C2410C', background: '#FCEEE4', border: '1px solid #F3D3BC', borderRadius: 6, padding: '2px 6px', marginRight: 8 },
    cta: { display: 'block', textAlign: 'center' as const, background: '#17191E', color: '#fff', textDecoration: 'none', fontWeight: 800, borderRadius: 12, padding: '14px 16px', margin: '10px 0' },
    cta2: { display: 'block', textAlign: 'center' as const, color: '#55606B', textDecoration: 'none', fontWeight: 700, fontSize: 14, padding: '6px' },
    disc: { fontSize: 12, color: '#9AA3AD', marginTop: 28, borderTop: '1px solid #EEE9E0', paddingTop: 14 },
    gloss: { fontSize: 14, marginBottom: 10 },
    relH: { fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#8A939E', margin: '28px 0 10px' },
    relGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 6 } as const,
    relA: { display: 'block', textAlign: 'center' as const, fontSize: 13, fontWeight: 700, color: '#17191E', textDecoration: 'none', border: '1px solid #E7E3DA', borderRadius: 8, padding: '7px 6px', background: '#FAF8F3' } as const,
    allA: { display: 'inline-block', marginTop: 12, fontSize: 14, fontWeight: 700, color: '#C2410C', textDecoration: 'none' },
  };

  // 내부 링크 — 이 페이지들은 사이트맵에만 있고 서로 «전혀» 연결돼 있지 않았다.
  // (있던 링크 4개는 전부 hreflang 자기참조였다 — 2026-08-22 실측)
  // 알파벳 순 이웃 12개 + 전체 허브로 링크해 크롤 발견성과 가중치 흐름을 만든다.
  const sortedT = [...FLOW_TICKERS].sort();
  const myIdx = sortedT.indexOf(ticker);
  const neighbors = (myIdx >= 0
    ? [...sortedT.slice(Math.max(0, myIdx - 6), myIdx), ...sortedT.slice(myIdx + 1, myIdx + 7)]
    : sortedT.slice(0, 12));

  // 공유 링크(?from=share, 2026-09-29 공유 루프)로 온 «그 요청»에만: 맨 위 설치 카드(보낸 앱 =
  // SIGNUM 커맨드 화면) + 아래 CTA 3개의 태그를 share 로 → 기존 스마트링크 집계
  // mkt:attr:hit:share 가 센다. 일반 방문자의 HTML·태그(seo_uc/sg/wim)는 한 글자도 안 바뀐다.
  // (이 경로는 [locale] 레이아웃 때문에 원래 매 요청 동적 렌더라 쿼리를 읽어도 캐시 성격이 같다)
  const sp = await searchParams;
  const shareVia = sp?.from === 'share' ? (typeof sp.via === 'string' ? sp.via : 'na') : null;
  const ctaTag = (seo: string) => (shareVia ? `share&l=${locale}` : seo);

  return (
    <main style={S.wrap}>
      {shareVia && <ShareLanding app="signum" surface="ticker" locale={locale} via={shareVia} variant="card" />}
      {jsonLd.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />}

      <div style={S.kicker}>Undercurrent · {l.kicker}</div>
      <h1 style={S.h1}>{l.h1(ticker)}</h1>
      {answer && <p data-seo-answer="" style={S.answer}>{answer}</p>}
      <p style={S.sub}>{l.sub(ticker)}</p>

      {metrics.length > 0 && (
        <section>
          <div style={S.sec}>{l.money}</div>
          <div style={S.grid}>
            {metrics.map(([k, v, a]) => (
              <div key={k} style={S.cell}>
                <div style={S.cellLbl}>{k}</div>
                <div style={S.cellVal}>{v}</div>
                {a && <div style={{ fontSize: 11, color: '#9AA3AD', fontWeight: 700, marginTop: 2 }}>{a}</div>}
              </div>
            ))}
          </div>
          {/* 다크풀 해석 — 검색으로 들어온 사람이 찾던 것은 숫자가 아니라 «뜻»이다 */}
          {dpRead && (
            <div style={{ ...S.read, borderLeft: '3px solid rgba(167,139,250,.55)', paddingLeft: 12 }}>
              <strong>{l.lbl.darkPool}: </strong>{dpRead.headline}
              <div style={{ marginTop: 6, opacity: .85 }}>{dpRead.detail}</div>
              <div style={{ marginTop: 6, fontSize: 12, opacity: .6 }}>
                {/* 그 FINRA 세션의 마감 — «전일»은 미국 저녁(그날 자료가 들어온 뒤)·주말·월요일에 틀린다(2026-10-03) */}
                {locale === 'ko' ? '출처 FINRA · ' : locale === 'ja' ? '出典 FINRA · ' : 'Source: FINRA · '}
                {closeLabelOr(m.darkPoolDate, locale === 'ko' || locale === 'ja' ? locale : 'en', locale === 'ko' ? '마감 기준' : locale === 'ja' ? '終値基準' : 'close')}
              </div>
            </div>
          )}
          {/* AI 해석은 «지금 보여 주는 숫자와 같은 판본» 위에서 쓰였을 때만 — 다르면 숫자와 문장이 다른 날을 말한다 */}
          {proseFresh && data?.tickerRead && <div style={S.read}><strong>{l.read}: </strong>{data.tickerRead}</div>}
        </section>
      )}

      {cards.length > 0 && (
        <section>
          <div style={S.sec}>{l.news}</div>
          {cards.map((c, i) => {
            const day = mmdd(etDate(c.publishedAt));
            return (
              <article key={i} style={S.card}>
                <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>
                  {proseFresh && c.divergence && <span style={S.divTag}>⚡ {l.divergence}</span>}
                  {c.plainTitle}
                </h2>
                {proseFresh && c.moneyRead && <p style={{ fontSize: 14, color: '#55606B', margin: '6px 0 0' }}>{c.moneyRead}</p>}
                {(c.source || day) && <div style={{ fontSize: 12, color: '#9AA3AD', marginTop: 6 }}>{[c.source, day].filter(Boolean).join(' · ')}</div>}
              </article>
            );
          })}
        </section>
      )}

      <section style={{ margin: '28px 0', padding: '16px 18px', background: '#FAF8F3', border: '1px solid #E7E3DA', borderRadius: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 900, textAlign: 'center', marginBottom: 10 }}>{l.ctaT}</div>
        <a href={`https://www.signumhq.com/app-uc?from=${ctaTag('seo_uc')}`} style={S.cta} rel="noopener">{l.ctaUc} →</a>
        <a href={`https://www.signumhq.com/app?from=${ctaTag('seo_sg')}`} style={S.cta2} rel="noopener">{l.ctaSg.replace('{t}', ticker)} →</a>
        {/* WIM — 2026-08-18 실측: /app-wim 링크가 사이트 «전체»에 0회였다. 즉 WIM 은
            웹에서 설치될 경로가 아예 없었다. 티커 페이지는 「왜 움직였나」가 주제라
            Why'd It Move? 와 정확히 겹치므로 여기가 가장 자연스러운 자리다. */}
        <a href={`https://www.signumhq.com/app-wim?from=${ctaTag('seo_wim')}`} style={S.cta2} rel="noopener">{l.ctaWim} →</a>
      </section>

      <section>
        <div style={S.sec}>{l.whatT}</div>
        <p style={{ fontSize: 15, color: '#3A424C' }}>{l.whatB}</p>
        <div style={S.sec}>{l.glossT}</div>
        {l.gloss.map(([term, def]) => (
          <p key={term} style={S.gloss}><strong>{term}</strong> — <span style={{ color: '#55606B' }}>{def}</span></p>
        ))}
      </section>

      {neighbors.length > 0 && (
        <section>
          <div style={S.relH}>{l.relT}</div>
          <div style={S.relGrid}>
            {neighbors.map((t) => (
              <a key={t} href={`/${locale}/flow/${t}`} style={S.relA}>{t}</a>
            ))}
          </div>
          <a href={`/${locale}/dark-pool`} style={S.allA}>{l.leadersT} →</a>
          {' · '}
          <a href={`/${locale}/tickers`} style={S.allA}>{l.allT} →</a>
        </section>
      )}

      {/* 오늘의 랭킹으로 — 이 티커 하나를 보러 온 사람에게 «오늘 시장에서 뭐가
          달라졌나»는 자연스러운 다음 클릭이다. 동시에 3,585개 티커 페이지에서
          신설 랭킹 층으로 링크 가중치가 흘러가 발견·평가를 앞당긴다. */}
      <section>
        <div style={S.relH}>{l.rankT}</div>
        <div style={S.relGrid}>
          {[
            ['deviation', { en: 'Break from normal', ko: '평소 대비 이탈', ja: '平常からの乖離' }],
            ['maxpain-gap', { en: 'Max pain gap', ko: '맥스페인 이격도', ja: 'マックスペイン乖離' }],
            ['gamma-flip', { en: 'Near gamma flip', ko: '감마플립 근접', ja: 'ガンマフリップ接近' }],
            ['darkpool-volume', { en: 'Off-exchange volume', ko: '장외 물량 이탈', ja: '取引所外の出来高' }],
            ['stealth', { en: 'Stealth accumulation', ko: '은밀 축적', ja: '静かな買い集め' }],
            ['insider-conviction', { en: 'Insider buys', ko: '내부자 매집', ja: 'インサイダー買い' }],
          ].map(([id, nm]) => (
            <a key={id as string} href={`/${locale}/rankings/${id}`} style={S.relA}>
              {(nm as Record<string, string>)[locale] || (nm as Record<string, string>).en}
            </a>
          ))}
        </div>
      </section>

      {/* 개념 설명으로 — 이 페이지의 지표를 처음 보는 사람에게 필요한 다음 클릭이고,
          동시에 정보성 질의를 겨냥한 /learn 층으로 링크 가중치를 보낸다. */}
      <section>
        <div style={S.relH}>{l.learnT}</div>
        <div style={S.relGrid}>
          {CONCEPT_SLUGS.map((c) => (
            <a key={c} href={`/${locale}/learn/${c}`} style={S.relA}>
              {(CONCEPTS[(locale as 'en' | 'ko' | 'ja')] || CONCEPTS.en)[c].h1}
            </a>
          ))}
        </div>
      </section>

      <footer style={S.disc}>{l.disc}</footer>
    </main>
  );
}
