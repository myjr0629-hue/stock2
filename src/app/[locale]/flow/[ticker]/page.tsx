// ============================================================================
// /[locale]/flow/[ticker] — programmatic SEO/GEO page (public, indexable).
// One page per ticker: the money snapshot (dark pool, max pain, option walls) +
// where the news and the money diverge. Unique proprietary data per page = clears
// Google's "scaled content" bar; structured data feeds LLM answer engines. Funnels
// to the apps via ?from=seo. ISR (hourly) → self-updating, zero daily human.
// Does NOT touch the mobile apps or the app-view UI — a separate discovery surface.
// ============================================================================
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { publicBase } from '@/lib/net/publicBase';
import { readDarkPool } from '@/lib/darkPoolRead';
import { FLOW_TICKERS } from '@/lib/seo/flowTickers';
import { CONCEPT_SLUGS, CONCEPTS } from '@/lib/seo/concepts';

export const revalidate = 3600; // ISR: refresh at most hourly
export const dynamicParams = true;

const TICKER_RE = /^[A-Z]{1,6}$/;

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
}
interface TickerData {
  success: boolean; ticker: string; money: Money; hasMoneyData: boolean;
  tickerRead: string | null; cards: Card[];
}

async function getData(locale: string, ticker: string): Promise<TickerData | null> {
  if (!TICKER_RE.test(ticker)) return null;
  try {
    const r = await fetch(
      `${publicBase()}/api/undercurrent/ticker?t=${ticker}&locale=${locale}`,
      { next: { revalidate: 3600 } },
    );
    if (!r.ok) return null;
    const d = await r.json();
    if (!d?.success) return null;
    return d as TickerData;
  } catch { return null; }
}

type Strings = {
  kicker: string; sub: (t: string) => string; money: string; read: string; news: string;
  divergence: string; whatT: string; whatB: string; glossT: string; gloss: [string, string][];
  ctaT: string; ctaUc: string; ctaSg: string; ctaWim: string; disc: string;
  relT: string; allT: string; learnT: string; leadersT: string; rankT: string;
  lbl: Record<string, string>;
};
const L: Record<string, Strings> = {
  en: {
    kicker: 'Money-flow snapshot',
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
    ctaSg: 'Or go deeper with SIGNUM HQ — the pro options terminal',
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
    ctaSg: '또는 SIGNUM HQ로 더 깊이 — 프로 옵션 터미널',
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
    ctaSg: 'またはSIGNUM HQでさらに深く — プロ向けオプション端末',
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
const usd$ = (v: number | null | undefined) => (v == null ? null : `$${Math.round(v).toLocaleString()}`);

function seoTitle(locale: string, t: string, m: Money | undefined): string {
  const dp = n1(m?.darkPoolPct);
  const mp = usd$(m?.maxPain);
  // ⚠️ 「오늘 갱신」이라고 쓰지 않는다. 페이지는 오늘 갱신되지만 다크풀 수치는
  //    FINRA T+1 이라 어제 자다 — 숫자 바로 옆에서 «오늘»이라고 하면 오해를 준다.
  if (locale === 'ko') {
    return dp && mp ? `${t} 다크풀 ${dp}%, 맥스페인 ${mp} — 무료, 매일 갱신`
      : `${t} 다크풀·맥스페인 — 오늘의 옵션 자금 흐름, 무료`;
  }
  if (locale === 'ja') {
    return dp && mp ? `${t} ダークプール${dp}%・マックスペイン${mp} — 無料、毎日更新`
      : `${t} ダークプール・マックスペイン — 今日のオプションフロー、無料`;
  }
  return dp && mp ? `${t} Dark Pool ${dp}%, Max Pain ${mp} — Free, Updated Daily`
    : `${t} Dark Pool & Max Pain Today — Free Options Flow`;
}

/** 숫자부터 말하는 결정적 설명문. 데이터가 없으면 기존 정적 문구로 안전하게 내려간다. */
function seoDesc(locale: string, t: string, m: Money | undefined, l: Strings): string {
  const dp = n1(m?.darkPoolPct);
  if (!dp) return l.sub(t).slice(0, DESC_MAX);

  const avg = n0(m?.darkPoolMarketAvg);
  const vr = m?.darkPoolVolRatio != null ? m.darkPoolVolRatio.toFixed(1) : null;
  const mp = usd$(m?.maxPain);
  const cw = usd$(m?.callWall);
  const pf = usd$(m?.putFloor);
  // FINRA 는 T+1 이다 — 날짜를 밝혀야 «오늘 갱신»이 거짓말이 되지 않는다.
  const day = m?.darkPoolDate ? m.darkPoolDate.slice(5).replace('-', '/') : null;

  const seg: string[] = [];
  if (locale === 'ko') {
    seg.push(`${t} 다크풀 ${dp}%${avg ? ` (시장 평균 ${avg}%)` : ''}${vr ? `, 평소의 ${vr}배` : ''}.`);
    if (mp) seg.push(`맥스페인 ${mp}${cw ? ` · 콜월 ${cw}` : ''}${pf ? ` · 풋플로어 ${pf}` : ''}.`);
    seg.push(`FINRA 원본, 매일 무료${day ? ` — ${day} 기준` : ''}.`);
  } else if (locale === 'ja') {
    seg.push(`${t} ダークプール ${dp}%${avg ? `（市場平均${avg}%）` : ''}${vr ? `、平常の${vr}倍` : ''}。`);
    if (mp) seg.push(`マックスペイン ${mp}${cw ? `・コールウォール ${cw}` : ''}${pf ? `・プットフロア ${pf}` : ''}。`);
    seg.push(`FINRA原文、毎日無料${day ? ` — ${day}時点` : ''}。`);
  } else {
    seg.push(`${t} dark pool ${dp}% of volume${avg ? ` (market avg ${avg}%)` : ''}${vr ? `, ${vr}× its norm` : ''}.`);
    if (mp) seg.push(`Max pain ${mp}${cw ? `, call wall ${cw}` : ''}${pf ? `, put floor ${pf}` : ''}.`);
    seg.push(`Free, from FINRA’s tape${day ? ` — ${day}` : ''}.`);
  }

  // 잘린 문장이 스니펫에 남지 않도록 «문장 단위»로만 붙인다.
  // 일본어는 「。」 뒤에 공백을 두지 않는다 — 붙여 써야 자연스럽다.
  const sp = locale === 'ja' ? '' : ' ';
  let out = '';
  for (const s of seg) {
    if ((out ? out.length + sp.length : 0) + s.length > DESC_MAX) break;
    out = out ? `${out}${sp}${s}` : s;
  }
  return out || l.sub(t).slice(0, DESC_MAX);
}

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string; ticker: string }> },
): Promise<Metadata> {
  const { locale, ticker: raw } = await params;
  const ticker = (raw || '').toUpperCase();
  const l = L[locale] ?? L.en;
  const base = publicBase();
  const data = await getData(locale, ticker);
  const m = data?.money;
  // ★ 로케일별 제목은 그대로 유지한다 (2026-08-22 실측 근거):
  //   세 로케일이 «영어 제목 하나»를 공유하고 <html lang> 까지 전부 ko 였을 때
  //   구글이 셋을 같은 문서로 보고 /ko/flow/* 150건을
  //   "Duplicate without user-selected canonical" 로 색인에서 뺐다.
  //   제목을 언어별로 갈라야 «다른 문서»가 된다 — seoTitle 이 그 규칙을 지킨다.
  const title = seoTitle(locale, ticker, m);
  const desc = seoDesc(locale, ticker, m, l);
  // 소셜 카드에는 서술 요약을 그대로 쓴다 — 공유는 이야기로 읽힌다.
  const social = (data?.tickerRead || desc).slice(0, 200);
  const og = new URLSearchParams({ ticker, priceLabel: 'PRICE' });
  if (m?.price) og.set('price', String(m.price));
  if (m?.callWall) og.set('callWall', String(m.callWall));
  if (m?.maxPain) og.set('maxPain', String(m.maxPain));
  if (m?.putFloor) og.set('putFloor', String(m.putFloor));
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
    // 스마트앱배너 — 이 페이지는 Undercurrent 콘텐츠다(본문 1순위 CTA 도 UC).
    // 루트 layout 이 전 페이지에 SIGNUM 을 박아두어 아이폰 사파리 방문자에게
    // «엉뚱한 앱»을 권하고 있었다(2026-08-22 실측). UC 로 맞춘다.
    itunes: { appId: '6788779895' }
  };
}

const money$ = (v: number | null) => (v == null ? null : `$${Math.round(v).toLocaleString()}`);

export default async function FlowTickerPage(
  { params }: { params: Promise<{ locale: string; ticker: string }> },
) {
  const { locale, ticker: raw } = await params;
  const ticker = (raw || '').toUpperCase();
  if (!TICKER_RE.test(ticker)) notFound();
  const data = await getData(locale, ticker);
  if (!data) notFound();
  const l = L[locale] ?? L.en;
  const m = data.money || ({} as Money);
  const cards = (data.cards || []).filter((c) => c.plainTitle);
  const pcr = m.oiPcr ?? m.volumePcr;
  // JSON-LD 용 (generateMetadata 와 같은 값을 컴포넌트 스코프에서도 쓴다)
  const base = publicBase();
  const url = `${base}/${locale}/flow/${ticker}`;
  const desc = (data.tickerRead || l.sub(ticker)).slice(0, 200);

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

  const metrics: [string, string][] = [];
  if (m.darkPoolPct != null) {
    metrics.push([
      l.lbl.darkPool,
      m.darkPoolMarketAvg != null
        ? `${m.darkPoolPct.toFixed(1)}%  (${l.lbl.mktAvg} ${m.darkPoolMarketAvg.toFixed(0)}%)`
        : `${m.darkPoolPct.toFixed(1)}%`,
    ]);
    if (m.darkPoolVolRatio != null) metrics.push([l.lbl.dpVol, `${m.darkPoolVolRatio.toFixed(1)}×`]);
    if (m.darkPoolShortPct != null) metrics.push([l.lbl.dpShort,
      m.darkPoolShortAvg != null
        ? `${m.darkPoolShortPct.toFixed(1)}%  (${l.lbl.norm} ${m.darkPoolShortAvg.toFixed(0)}%)`
        : `${m.darkPoolShortPct.toFixed(1)}%`]);
  }
  if (m.price != null) metrics.push([l.lbl.price, money$(m.price)!]);
  if (m.maxPain != null) metrics.push([l.lbl.maxPain, money$(m.maxPain)!]);
  if (m.callWall != null) metrics.push([l.lbl.callWall, money$(m.callWall)!]);
  if (m.putFloor != null) metrics.push([l.lbl.putFloor, money$(m.putFloor)!]);
  if (pcr != null) metrics.push([l.lbl.pcr, pcr.toFixed(2)]);
  if (m.squeezeScore != null) metrics.push([l.lbl.squeeze, String(Math.round(m.squeezeScore))]);

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
  if (m.maxPain != null) faq.push({ q: `Where is ${ticker}'s max pain?`, a: `${ticker}'s max pain is around ${money$(m.maxPain)}.` });
  if (m.callWall != null || m.putFloor != null) faq.push({ q: `What are ${ticker}'s option walls?`, a: `${[m.callWall != null ? `call wall ${money$(m.callWall)}` : '', m.putFloor != null ? `put floor ${money$(m.putFloor)}` : ''].filter(Boolean).join(', ')}.` });
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
      variableMeasured: metrics.map(([k]) => k),
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

  return (
    <main style={S.wrap}>
      {jsonLd.length > 0 && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />}

      <div style={S.kicker}>Undercurrent · {l.kicker}</div>
      <h1 style={S.h1}>{ticker} — {l.money}</h1>
      <p style={S.sub}>{l.sub(ticker)}</p>

      {metrics.length > 0 && (
        <section>
          <div style={S.sec}>{l.money}</div>
          <div style={S.grid}>
            {metrics.map(([k, v]) => (
              <div key={k} style={S.cell}>
                <div style={S.cellLbl}>{k}</div>
                <div style={S.cellVal}>{v}</div>
              </div>
            ))}
          </div>
          {/* 다크풀 해석 — 검색으로 들어온 사람이 찾던 것은 숫자가 아니라 «뜻»이다 */}
          {dpRead && (
            <div style={{ ...S.read, borderLeft: '3px solid rgba(167,139,250,.55)', paddingLeft: 12 }}>
              <strong>{l.lbl.darkPool}: </strong>{dpRead.headline}
              <div style={{ marginTop: 6, opacity: .85 }}>{dpRead.detail}</div>
              <div style={{ marginTop: 6, fontSize: 12, opacity: .6 }}>
                {locale === 'ko' ? '출처 FINRA · 전일 마감 기준' : locale === 'ja' ? '出典 FINRA · 前日終値基準' : 'Source: FINRA · prior close'}
                {m.darkPoolDate ? ` · ${m.darkPoolDate}` : ''}
              </div>
            </div>
          )}
          {data.tickerRead && <div style={S.read}><strong>{l.read}: </strong>{data.tickerRead}</div>}
        </section>
      )}

      {cards.length > 0 && (
        <section>
          <div style={S.sec}>{l.news}</div>
          {cards.map((c, i) => (
            <article key={i} style={S.card}>
              <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>
                {c.divergence && <span style={S.divTag}>⚡ {l.divergence}</span>}
                {c.plainTitle}
              </h2>
              {c.moneyRead && <p style={{ fontSize: 14, color: '#55606B', margin: '6px 0 0' }}>{c.moneyRead}</p>}
              {c.source && <div style={{ fontSize: 12, color: '#9AA3AD', marginTop: 6 }}>{c.source}</div>}
            </article>
          ))}
        </section>
      )}

      <section style={{ margin: '28px 0', padding: '16px 18px', background: '#FAF8F3', border: '1px solid #E7E3DA', borderRadius: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 900, textAlign: 'center', marginBottom: 10 }}>{l.ctaT}</div>
        <a href="https://www.signumhq.com/app-uc?from=seo" style={S.cta} rel="noopener">{l.ctaUc} →</a>
        <a href="https://www.signumhq.com/app?from=seo" style={S.cta2} rel="noopener">{l.ctaSg} →</a>
        {/* WIM — 2026-08-18 실측: /app-wim 링크가 사이트 «전체»에 0회였다. 즉 WIM 은
            웹에서 설치될 경로가 아예 없었다. 티커 페이지는 「왜 움직였나」가 주제라
            Why'd It Move? 와 정확히 겹치므로 여기가 가장 자연스러운 자리다. */}
        <a href="https://www.signumhq.com/app-wim?from=seo" style={S.cta2} rel="noopener">{l.ctaWim} →</a>
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
