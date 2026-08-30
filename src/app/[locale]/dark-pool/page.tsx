// ============================================================================
// /[locale]/dark-pool — 「오늘의 장외(다크풀) 이상치」 순위. 공개·색인 대상.
//
// 왜 이 페이지가 필요한가 (2026-08-31):
//   종목 페이지 1,195장은 롱테일 질의(「NVDA dark pool」)를 받는다. 그런데
//   **헤드 질의**(「dark pool volume today」·「다크풀 상위 종목」·
//   「ダークプール ランキング」)를 받을 페이지가 하나도 없었다.
//   그리고 우리 최대 병목은 참조 도메인 2개다 — 순위표는 남이 «링크할 이유»가
//   있는 거의 유일한 형태다. 매일 갱신되고, 무료고, 규제 원본이다.
//
// 라이선스: FINRA Specific Terms §2.3 — 재배포 허용. 단 (a) 출처 명시
//   (b) **이 데이터에 별도 요금 금지** → 이 페이지는 게이트 뒤에 두지 않는다.
//
// 순위는 «비중 %»로 매기지 않는다. 시장 중앙값이 49.4%라 비중 상위는 매일
// 같은 배관 종목이 나온다. 정보는 자기 기준선에서 얼마나 벗어났나에 있다.
// ============================================================================
import type { Metadata } from 'next';
import { publicBase } from '@/lib/net/publicBase';
import { getDarkPoolLeaders, type DarkPoolLeader, type DarkPoolLeaders } from '@/services/darkPool';

export const revalidate = 3600; // ISR: 원천이 하루 2회 갱신 → 시간당 재생성이면 충분

type Loc = 'ko' | 'en' | 'ja';
const loc = (l: string): Loc => (l === 'ko' || l === 'ja' ? l : 'en');

// ── 문구 ─────────────────────────────────────────────────────────────────
interface Strings {
  title: string;
  desc: string;
  kicker: string;
  h1: string;
  sub: string;
  summary: (d: { date: string; covered: string; avg: string; universe: string }) => string;
  lists: Record<'absorbed' | 'sold' | 'surge' | 'shortHigh' | 'shortLow', { h: string; note: string }>;
  col: { ticker: string; chg: string; mult: string; share: string; short: string; norm: string; dev: string };
  empty: string;
  readT: string;
  read: [string, string][];
  methodT: string;
  method: string[];
  ctaT: string;
  ctaSg: string;
  ctaUc: string;
  ctaWim: string;
  ctaOf: string;
  allT: string;
  disc: string;
  unavailable: string;
}

const L: Record<Loc, Strings> = {
  en: {
    title: 'Dark Pool Volume Today — Off-Exchange Leaders & Short Volume',
    desc: 'Which US stocks traded most off-exchange today, measured against each name’s own 20-day baseline. Free, from FINRA’s regulatory tape.',
    kicker: 'Off-exchange tape',
    h1: 'Dark Pool Volume Today',
    sub: 'Every US stock, ranked by how far its off-exchange trading moved from its own normal — not by the raw percentage, which says almost nothing. Free, from FINRA.',
    summary: (d) =>
      `Session of ${d.date}. FINRA reported off-exchange volume for ${d.covered} symbols; the average across all of them was ${d.avg}% of consolidated volume. ${d.universe} names cleared the $200M liquidity floor and are ranked below.`,
    lists: {
      absorbed: {
        h: 'Price fell, size went through off-exchange',
        note: 'Down at least 2%, off-exchange volume at least 1.6x its own norm, and a lighter short share than usual. Someone took the other side of the decline away from the public book.',
      },
      sold: {
        h: 'Price rose, the short side got heavier',
        note: 'Up at least 1.5% while the short share of off-exchange prints ran at least 8 points above the name’s own norm. Strength met supply off-book.',
      },
      surge: {
        h: 'Biggest off-exchange volume multiples',
        note: 'Today’s off-exchange volume divided by the name’s own 20-day average. This is a stronger signal than the raw percentage.',
      },
      shortHigh: {
        h: 'Short share furthest above its baseline',
        note: 'The short share of off-exchange prints, minus the name’s own 20-day norm. Positive means more short-side flow off-book than usual for this name.',
      },
      shortLow: {
        h: 'Short share furthest below its baseline',
        note: 'The same measure, inverted. A large negative reading means unusually little of the off-exchange size was sold short.',
      },
    },
    col: { ticker: 'Ticker', chg: 'Day', mult: 'Vol vs norm', share: 'Off-exch', short: 'Short', norm: 'Norm', dev: 'Dev' },
    empty: 'No name met this condition in the session.',
    readT: 'How to read these numbers',
    read: [
      ['The raw percentage is not a signal', 'Roughly half of all US share volume prints away from the public order book on an ordinary day. A name at 45% off-exchange is not "heavily dark-pooled" — it is normal. Only the distance from its own baseline carries information.'],
      ['The short share is not a bearish vote', 'Across 11,663 symbols the median off-exchange short share is about 49%. Wholesalers filling retail buy orders sell short and cover later, so half of that column is plumbing, not positioning. Compare it to the same name’s own norm, never to 50%.'],
      ['Volume multiple beats percentage', 'A name printing 2x its usual off-exchange size is saying something. A name printing 55% instead of 50% is not.'],
      ['This is T+1, not live', 'FINRA publishes the prior session. Nothing here is an intraday feed, and nothing here is a prediction.'],
    ],
    methodT: 'Method and source',
    method: [
      'Source: FINRA Reg SHO Daily Short Sale Volume, the regulatory record every US off-exchange trade is reported to. All three Trade Reporting Facilities are summed per symbol.',
      'Off-exchange share = off-exchange volume divided by consolidated volume for the same session.',
      'Baselines are each symbol’s own trailing 20 sessions. A name needs at least 10 sessions of history before any multiple or deviation is shown.',
      'Only names above $200M in consolidated dollar volume are ranked — multiples get large easily in thin names.',
      'ETFs are excluded. Authorized participants short the fund while creating and redeeming shares, which swings the off-exchange short share mechanically. Left in, they fill every deviation list and mean nothing.',
    ],
    ctaT: 'See this for any ticker',
    ctaSg: 'SIGNUM HQ — options flow, gamma, dark pool',
    ctaUc: 'Undercurrent — the news and the money side by side',
    ctaWim: 'Why’d It Move? — learn what moved a stock',
    ctaOf: 'Today’s biggest new options positions',
    allT: 'All tickers',
    disc: 'Data source: FINRA. Provided free and without additional charge. Educational and informational only — not investment advice, and no guarantee of accuracy or results.',
    unavailable: 'The off-exchange tape for the latest session is not available right now. It refreshes twice a day.',
  },
  ko: {
    title: '오늘의 다크풀 상위 종목 — 장외 거래량·공매도 비중',
    desc: '오늘 장외(다크풀)에서 가장 크게 움직인 미국 주식을, 종목별 «자기 20일 기준선» 대비로 순위화했습니다. FINRA 규제 원본, 무료.',
    kicker: '장외 체결 테이프',
    h1: '오늘의 다크풀 상위 종목',
    sub: '비중 %로 줄 세우지 않습니다. 그 숫자는 거의 아무 말도 하지 않기 때문입니다. 각 종목이 «자기 평소»에서 얼마나 벗어났는지로 순위를 매깁니다. FINRA 원본, 무료.',
    summary: (d) =>
      `${d.date} 장 기준. FINRA 가 ${d.covered}개 종목의 장외 거래량을 보고했고, 전 종목 평균은 통합 거래량의 ${d.avg}% 였습니다. 이 중 거래대금 2억 달러 기준을 넘긴 ${d.universe}개 종목을 아래에 순위로 놓았습니다.`,
    lists: {
      absorbed: {
        h: '주가는 내렸는데 장외로 물량이 지나갔다',
        note: '2% 이상 하락 · 장외 물량이 자기 평소의 1.6배 이상 · 그 물량 중 공매도 비중은 평소보다 낮음. 하락의 반대편을 호가창 밖에서 받아낸 그림입니다.',
      },
      sold: {
        h: '주가는 올랐는데 공매도 쪽이 무거워졌다',
        note: '1.5% 이상 상승 · 장외 물량 중 공매도 비중이 그 종목 평소보다 8%p 이상 높음. 강세에 장외 공급이 붙은 그림입니다.',
      },
      surge: {
        h: '장외 물량 배수 상위',
        note: '오늘 장외 물량 ÷ 그 종목의 20일 평균. 비중 %보다 훨씬 강한 신호입니다.',
      },
      shortHigh: {
        h: '공매도 비중이 기준선 위로 가장 크게 벗어난 종목',
        note: '장외 물량 중 공매도 비중에서 그 종목의 20일 평균을 뺀 값. 양수면 평소보다 공매도 쪽 흐름이 많았다는 뜻입니다.',
      },
      shortLow: {
        h: '공매도 비중이 기준선 아래로 가장 크게 벗어난 종목',
        note: '같은 값의 반대편. 크게 음수면 장외 물량 중 공매도로 팔린 비중이 유난히 적었다는 뜻입니다.',
      },
    },
    col: { ticker: '종목', chg: '등락', mult: '물량 배수', share: '장외 비중', short: '공매도', norm: '평소', dev: '이탈' },
    empty: '이 조건에 해당하는 종목이 이 장에는 없었습니다.',
    readT: '이 숫자를 읽는 법',
    read: [
      ['비중 % 자체는 신호가 아니다', '평범한 날에도 미국 주식 거래량의 약 절반이 공개 호가창 밖에서 체결됩니다. 장외 45%인 종목은 «다크풀이 많은» 종목이 아니라 그냥 보통입니다. 정보는 그 종목의 자기 기준선에서 얼마나 벗어났는지에만 있습니다.'],
      ['공매도 비중은 하락 베팅 표가 아니다', '11,663개 종목의 장외 공매도 비중 중앙값이 약 49%입니다. 소매 매수의 상대가 되는 도매업자가 일단 공매도로 팔고 나중에 되사기 때문에, 그 칸의 절반은 시장 배관이지 포지션이 아닙니다. 50%가 아니라 «그 종목의 평소»와 비교해야 합니다.'],
      ['물량 배수가 비중보다 세다', '평소의 2배가 장외로 지나간 종목은 무언가를 말합니다. 50%가 55%가 된 종목은 아무 말도 하지 않습니다.'],
      ['실시간이 아니라 T+1이다', 'FINRA 는 직전 장을 공표합니다. 여기 있는 어떤 숫자도 장중 실시간이 아니고, 예측도 아닙니다.'],
    ],
    methodT: '방법과 출처',
    method: [
      '출처: FINRA Reg SHO Daily Short Sale Volume — 미국의 모든 장외 체결이 의무 보고되는 규제 원본입니다. 세 곳의 거래보고시설(TRF)을 종목별로 합산합니다.',
      '장외 비중 = 같은 장의 장외 거래량 ÷ 통합 거래량.',
      '기준선은 그 종목 자신의 직전 20거래일입니다. 이력이 10거래일 미만이면 배수·이탈을 아예 표시하지 않습니다.',
      '통합 거래대금 2억 달러 이상만 순위에 넣습니다 — 거래가 얇을수록 배수는 쉽게 커집니다.',
      'ETF 는 제외합니다. 지정참가회사가 설정·환매 과정에서 ETF 를 공매도로 팔았다 되사기 때문에 장외 공매도 비중이 기계적으로 흔들립니다. 넣어 두면 이탈 순위를 전부 채우면서 아무 의미도 없습니다.',
    ],
    ctaT: '어떤 종목이든 이 화면으로',
    ctaSg: 'SIGNUM HQ — 옵션 자금 흐름·감마·다크풀',
    ctaUc: '언더커런트 — 뉴스와 돈을 나란히',
    ctaWim: 'Why’d It Move? — 왜 움직였는지 배우기',
    ctaOf: '오늘 새로 열린 옵션 포지션 상위',
    allT: '전체 종목',
    disc: '데이터 출처: FINRA. 별도 요금 없이 무료로 제공합니다. 교육·정보 목적이며 투자 조언이 아닙니다. 정확성과 결과를 보장하지 않습니다.',
    unavailable: '최신 장의 장외 테이프를 지금 불러올 수 없습니다. 하루 두 번 갱신됩니다.',
  },
  ja: {
    title: '今日のダークプール上位銘柄 — 場外取引・空売り比率',
    desc: '今日、場外（ダークプール）で最も大きく動いた米国株を、銘柄ごとの「自分の20日基準」との差で順位化。FINRAの規制原本、無料。',
    kicker: '場外約定テープ',
    h1: '今日のダークプール上位銘柄',
    sub: '比率%では並べません。その数字はほとんど何も語らないからです。各銘柄が「自分の平常」からどれだけ離れたかで順位を付けます。FINRA原本、無料。',
    summary: (d) =>
      `${d.date} の取引。FINRA は ${d.covered} 銘柄の場外出来高を報告し、全銘柄の平均は連結出来高の ${d.avg}% でした。うち売買代金2億ドルの下限を超えた ${d.universe} 銘柄を以下に並べています。`,
    lists: {
      absorbed: {
        h: '株価は下げたのに、場外で規模が通った',
        note: '2%以上の下落・場外出来高が自分の平常の1.6倍以上・そのうち空売り比率は平常より低い。下落の反対側を板の外で受けた形です。',
      },
      sold: {
        h: '株価は上げたのに、空売り側が重くなった',
        note: '1.5%以上の上昇で、場外約定の空売り比率がその銘柄の平常より8ポイント以上高い。強さに場外の供給がついた形です。',
      },
      surge: {
        h: '場外出来高の倍率上位',
        note: '今日の場外出来高 ÷ その銘柄の20日平均。比率%よりはるかに強い信号です。',
      },
      shortHigh: {
        h: '空売り比率が基準線から最も上に外れた銘柄',
        note: '場外約定の空売り比率から、その銘柄の20日平均を引いた値。プラスなら平常より空売り側の流れが多かったということです。',
      },
      shortLow: {
        h: '空売り比率が基準線から最も下に外れた銘柄',
        note: '同じ指標の逆側。大きくマイナスなら、場外の規模のうち空売りで売られた割合が異常に少なかったということです。',
      },
    },
    col: { ticker: '銘柄', chg: '騰落', mult: '出来高倍率', share: '場外比率', short: '空売り', norm: '平常', dev: '乖離' },
    empty: 'この条件に当てはまる銘柄はこの取引にはありませんでした。',
    readT: 'この数字の読み方',
    read: [
      ['比率%そのものは信号ではない', '平常の日でも米国株の出来高の約半分が公開板の外で約定します。場外45%の銘柄は「ダークプールが多い」のではなく、ただの普通です。情報はその銘柄自身の基準線からの距離にしかありません。'],
      ['空売り比率は下落への一票ではない', '11,663銘柄の場外空売り比率の中央値は約49%です。個人の買い注文の相手方になるホールセラーがいったん空売りで売り、あとで買い戻すため、その列の半分は市場の配管であってポジションではありません。50%ではなく「その銘柄の平常」と比べてください。'],
      ['出来高倍率のほうが比率より強い', '平常の2倍が場外を通った銘柄は何かを語ります。50%が55%になった銘柄は何も語りません。'],
      ['リアルタイムではなくT+1', 'FINRA は直前の取引を公表します。ここにある数字はどれも場中のリアルタイムではなく、予測でもありません。'],
    ],
    methodT: '方法と出典',
    method: [
      '出典: FINRA Reg SHO Daily Short Sale Volume — 米国のすべての場外約定が報告義務を負う規制原本です。3つの取引報告施設(TRF)を銘柄ごとに合算しています。',
      '場外比率 = 同じ取引の場外出来高 ÷ 連結出来高。',
      '基準線はその銘柄自身の直近20営業日です。履歴が10営業日未満なら倍率・乖離を一切表示しません。',
      '連結売買代金2億ドル以上のみを順位に入れます — 薄い銘柄ほど倍率は簡単に大きくなります。',
      'ETFは除外します。指定参加者が設定・交換の過程でETFを空売りして買い戻すため、場外の空売り比率が機械的に振れます。入れておくと乖離の順位を全部埋めながら、何の意味も持ちません。',
    ],
    ctaT: 'どの銘柄でもこの画面で',
    ctaSg: 'SIGNUM HQ — オプションフロー・ガンマ・ダークプール',
    ctaUc: 'アンダーカレント — ニュースとお金を並べて',
    ctaWim: 'Why’d It Move? — なぜ動いたかを学ぶ',
    ctaOf: '今日の新規オプション建玉の上位',
    allT: '全銘柄',
    disc: 'データ出典: FINRA。追加料金なしで無料提供しています。教育・情報目的であり投資助言ではありません。正確性や結果を保証しません。',
    unavailable: '最新取引の場外テープを今は取得できません。1日2回更新されます。',
  },
};

// ── 메타 ─────────────────────────────────────────────────────────────────
export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params;
  const lc = loc(locale);
  const l = L[lc];
  const base = publicBase();
  const url = `${base}/${lc}/dark-pool`;
  const title = `${l.title} | SIGNUM HQ`;
  // 링크될 자산에 공유 카드가 없으면 X·슬랙에서 «회색 상자»로 붙는다.
  // 카드 문구는 영어 고정 — OG 폰트가 라틴 전용이라 CJK 는 두부글자가 된다.
  const d = await getDarkPoolLeaders().catch(() => null);
  const og = new URLSearchParams({ kind: 'darkpool' });
  if (d?.date) og.set('date', d.date);
  (d?.surge ?? []).slice(0, 3).forEach((r, i) => {
    if (r.volRatio == null) return;
    og.set(`r${i + 1}`, `${r.ticker}|${r.volRatio.toFixed(1)}x vs norm|${r.pct.toFixed(1)}% off-exch`);
  });
  const ogUrl = `${base}/api/og/leaders?${og.toString()}`;
  return {
    title,
    description: l.desc,
    alternates: {
      canonical: url,
      languages: {
        en: `${base}/en/dark-pool`, ko: `${base}/ko/dark-pool`, ja: `${base}/ja/dark-pool`,
        'x-default': `${base}/en/dark-pool`,
      },
    },
    openGraph: { title, description: l.desc, url, type: 'website', images: [ogUrl] },
    twitter: { card: 'summary_large_image', title, description: l.desc, images: [ogUrl] },
  };
}

// ── 표시 도우미 ───────────────────────────────────────────────────────────
const pct1 = (v: number | null | undefined) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`);
const plain1 = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(1)}%`);
const mult = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(1)}×`);
const dev1 = (v: number | null | undefined) => (v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%p`);

export default async function DarkPoolLeadersPage(
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  const lc = loc(locale);
  const l = L[lc];
  const base = publicBase();
  const url = `${base}/${lc}/dark-pool`;

  const data: DarkPoolLeaders | null = await getDarkPoolLeaders().catch(() => null);

  const S = {
    // ⚠️ 375px 실측: 페이지 전체가 가로로 넘쳤다(scrollWidth 588 vs 375).
    //    레이아웃의 부모가 `flex flex-col` 인데, 여기에 `margin: 0 auto` 를 주면
    //    **교차축 auto 마진이 stretch 를 끄고** main 이 fit-content(=표 너비)로
    //    부푼다. minWidth:0 만으로는 안 됐다 — 세로 방향 flex 에서는 min-width
    //    auto 규칙이 적용되지 않기 때문이다. `width:100%` 가 실제 해법이다.
    wrap: { width: '100%', maxWidth: 860, minWidth: 0, margin: '0 auto', padding: '32px 20px 64px', fontFamily: 'Pretendard, system-ui, sans-serif', color: '#17191E', lineHeight: 1.6 } as const,
    kicker: { fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#C2410C' },
    h1: { fontSize: 32, fontWeight: 900, margin: '6px 0 6px' },
    sub: { fontSize: 15, color: '#55606B', margin: '0 0 18px' },
    summary: { fontSize: 14, background: '#F3F5F4', border: '1px solid #E1E7E4', borderRadius: 12, padding: '14px 16px', margin: '0 0 8px' },
    secH: { fontSize: 17, fontWeight: 850 as any, margin: '30px 0 4px' },
    secNote: { fontSize: 13, color: '#6B7480', margin: '0 0 10px' },
    scroll: { overflowX: 'auto' as const, maxWidth: '100%', border: '1px solid #E7E3DA', borderRadius: 12, background: '#FAF8F3' },
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14, fontVariantNumeric: 'tabular-nums' as const },
    th: { textAlign: 'right' as const, fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: '#8A939E', padding: '10px 12px', whiteSpace: 'nowrap' as const },
    thL: { textAlign: 'left' as const, fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' as const, color: '#8A939E', padding: '10px 12px', whiteSpace: 'nowrap' as const },
    td: { textAlign: 'right' as const, padding: '10px 12px', borderTop: '1px solid #EEE9E0', whiteSpace: 'nowrap' as const },
    tdL: { textAlign: 'left' as const, padding: '10px 12px', borderTop: '1px solid #EEE9E0', whiteSpace: 'nowrap' as const },
    a: { color: '#17191E', fontWeight: 800, textDecoration: 'none' },
    up: { color: '#127A4B', fontWeight: 700 },
    down: { color: '#C2261C', fontWeight: 700 },
    empty: { fontSize: 14, color: '#8A939E', padding: '14px 16px', border: '1px dashed #E7E3DA', borderRadius: 12 },
    readH: { fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: '#8A939E', margin: '36px 0 10px' },
    gloss: { fontSize: 14, marginBottom: 12 },
    li: { fontSize: 13.5, color: '#55606B', marginBottom: 8 },
    cta: { display: 'block', textAlign: 'center' as const, background: '#17191E', color: '#fff', textDecoration: 'none', fontWeight: 800, borderRadius: 12, padding: '14px 16px', margin: '10px 0' },
    cta2: { display: 'block', textAlign: 'center' as const, color: '#55606B', textDecoration: 'none', fontWeight: 700, fontSize: 14, padding: '7px' },
    disc: { fontSize: 12, color: '#9AA3AD', marginTop: 30, borderTop: '1px solid #EEE9E0', paddingTop: 14 },
  };

  const Table = ({ rows }: { rows: DarkPoolLeader[] }) => {
    if (!rows.length) return <div style={S.empty}>{l.empty}</div>;
    return (
      <div style={S.scroll}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.thL}>{l.col.ticker}</th>
              <th style={S.th}>{l.col.chg}</th>
              <th style={S.th}>{l.col.mult}</th>
              <th style={S.th}>{l.col.share}</th>
              <th style={S.th}>{l.col.short}</th>
              <th style={S.th}>{l.col.norm}</th>
              <th style={S.th}>{l.col.dev}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ticker}>
                <td style={S.tdL}>
                  <a href={`/${lc}/flow/${r.ticker}`} style={S.a}>{r.ticker}</a>
                </td>
                <td style={{ ...S.td, ...(r.changePct == null ? {} : r.changePct >= 0 ? S.up : S.down) }}>{pct1(r.changePct)}</td>
                <td style={S.td}>{mult(r.volRatio)}</td>
                <td style={S.td}>{plain1(r.pct)}</td>
                <td style={S.td}>{plain1(r.shortPct)}</td>
                <td style={S.td}>{plain1(r.shortAvg)}</td>
                <td style={S.td}>{dev1(r.shortDev)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  if (!data) {
    return (
      <main style={S.wrap}>
        <div style={S.kicker}>SIGNUM HQ · {l.kicker}</div>
        <h1 style={S.h1}>{l.h1}</h1>
        <p style={S.sub}>{l.unavailable}</p>
        <p style={S.disc}>{l.disc}</p>
      </main>
    );
  }

  const summary = l.summary({
    date: data.date ?? '—',
    covered: data.covered.toLocaleString(),
    avg: data.marketAvg == null ? '—' : data.marketAvg.toFixed(0),
    universe: data.universe.toLocaleString(),
  });

  // 각 목록의 1위를 한 문장으로 — Dataset.description 과 LLM 추출에 쓴다.
  const facts: string[] = [];
  const say = (r: DarkPoolLeader | undefined, made: (r: DarkPoolLeader) => string) => {
    if (r) facts.push(made(r));
  };
  say(data.surge[0], (r) => `${r.ticker} traded ${r.volRatio?.toFixed(1)}x its own 20-day off-exchange volume, the largest multiple of the session.`);
  say(data.absorbed[0], (r) => `${r.ticker} fell ${r.changePct?.toFixed(2)}% while ${r.volRatio?.toFixed(1)}x its usual size printed off-exchange with a short share of ${r.shortPct?.toFixed(1)}% against a ${r.shortAvg?.toFixed(1)}% norm.`);
  say(data.sold[0], (r) => `${r.ticker} rose ${r.changePct?.toFixed(2)}% while ${r.shortPct?.toFixed(1)}% of its off-exchange volume printed short against a ${r.shortAvg?.toFixed(1)}% norm.`);
  say(data.shortHigh[0], (r) => `${r.ticker} had the session's largest upward deviation in off-exchange short share, ${r.shortDev?.toFixed(1)} points above its own norm.`);
  say(data.shortLow[0], (r) => `${r.ticker} had the largest downward deviation, ${r.shortDev?.toFixed(1)} points below its own norm.`);

  const brand = `${base}/#org`;
  const jsonLd: Record<string, unknown>[] = [
    {
      '@context': 'https://schema.org', '@type': 'Dataset', '@id': `${url}#dataset`,
      name: l.title,
      description: [
        l.desc,
        `Session ${data.date}. Market-wide off-exchange average ${data.marketAvg}% across ${data.covered} symbols.`,
        ...facts,
        'The median off-exchange short share across all listed symbols is about 49%, because wholesalers sell short to fill retail buy orders and cover later. A high short share is therefore not bearish on its own; only the deviation from a symbol’s own baseline carries information.',
      ].join(' ').slice(0, 1400),
      url,
      isAccessibleForFree: true,
      creator: { '@id': brand },
      temporalCoverage: data.date ?? undefined,
      variableMeasured: ['off-exchange share', 'off-exchange volume multiple', 'off-exchange short share', '20-day short share norm', 'short share deviation'],
      inLanguage: lc,
      license: `${base}/${lc}/terms`,
      creditText: 'Data source: FINRA',
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'SIGNUM HQ', item: `${base}/${lc}` },
        { '@type': 'ListItem', position: 2, name: l.h1, item: url },
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

  const sections: Array<['absorbed' | 'sold' | 'surge' | 'shortHigh' | 'shortLow', DarkPoolLeader[]]> = [
    ['surge', data.surge],
    ['absorbed', data.absorbed],
    ['sold', data.sold],
    ['shortHigh', data.shortHigh],
    ['shortLow', data.shortLow],
  ];

  return (
    <main style={S.wrap}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div style={S.kicker}>SIGNUM HQ · {l.kicker}</div>
      <h1 style={S.h1}>{l.h1}</h1>
      <p style={S.sub}>{l.sub}</p>
      <p style={S.summary}>{summary}</p>

      {sections.map(([key, rows]) => (
        <section key={key}>
          <h2 style={S.secH}>{l.lists[key].h}</h2>
          <p style={S.secNote}>{l.lists[key].note}</p>
          <Table rows={rows} />
        </section>
      ))}

      <h2 style={S.readH}>{l.readT}</h2>
      {l.read.map(([t, b]) => (
        <p key={t} style={S.gloss}><strong>{t}.</strong> {b}</p>
      ))}

      <h2 style={S.readH}>{l.methodT}</h2>
      {l.method.map((m) => (
        <p key={m.slice(0, 24)} style={S.li}>{m}</p>
      ))}

      <h2 style={S.readH}>{l.ctaT}</h2>
      <a style={S.cta} href={`/${lc}/app-view/cmd?from=seo-darkpool`}>{l.ctaSg}</a>
      <a style={S.cta2} href={`/${lc}/options-flow`}>{l.ctaOf}</a>
      <a style={S.cta2} href={`/${lc}/undercurrent?from=seo-darkpool`}>{l.ctaUc}</a>
      <a style={S.cta2} href={`/${lc}/wim?from=seo-darkpool`}>{l.ctaWim}</a>
      <a style={S.cta2} href={`/${lc}/tickers`}>{l.allT}</a>

      <p style={S.disc}>{l.disc}</p>
    </main>
  );
}
