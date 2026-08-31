// ============================================================================
// /[locale]/options-flow — 「오늘의 신규 옵션 포지션」 순위. 공개·색인 대상.
//
// 왜: 「unusual options activity today」·「옵션 특이거래」·「オプション 大口」는
//     헤드 질의인데 받을 페이지가 없었다. 두 번째 검색 표면이다.
//
// 무엇이 다른가: 무료 목록들은 대부분 «거래량»만 보여 준다. 거래량은 신규
//     진입과 청산을 구분하지 못한다. 우리는 미결제약정 **증가분**을 쓰므로
//     「연 것」만 남는다. 5년치 옵션 EOD 벌크가 있어야 만들 수 있는 값이다.
//
// ⚠️ 다크풀 순위표와 달리 ETF 를 빼지 않는다 — SPY·QQQ·GLD 옵션은 기계적
//    배관이 아니라 실제 헤지 활동이고, 오히려 그날의 이야기다. 표시만 한다.
// ============================================================================
import type { Metadata } from 'next';
import { publicBase } from '@/lib/net/publicBase';
import {
  getInstitutionalFlowLeaders,
  type FlowLeaderContract,
  type FlowLeaderTicker,
  type InstitutionalFlowLeaders,
} from '@/services/institutionalFlow';

export const revalidate = 3600; // ISR: 원천은 마감 후 하루 1회 → 시간당 재생성

type Loc = 'ko' | 'en' | 'ja';
const loc = (l: string): Loc => (l === 'ko' || l === 'ja' ? l : 'en');

interface Strings {
  title: string; desc: string; kicker: string; h1: string; sub: string;
  summary: (d: { date: string; total: string; callPct: string; tickers: string }) => string;
  lists: Record<'contracts' | 'byTicker' | 'topCalls' | 'topPuts', { h: string; note: string }>;
  col: { ticker: string; side: string; strike: string; expiry: string; added: string; notional: string; callShare: string };
  call: string; put: string; etf: string; empty: string;
  readT: string; read: [string, string][];
  methodT: string; method: string[];
  ctaT: string; ctaSg: string; ctaUc: string; ctaDp: string; allT: string;
  disc: string; unavailable: string;
}

const L: Record<Loc, Strings> = {
  en: {
    title: 'Unusual Options Activity Today — Biggest New Positions',
    desc: 'The largest options positions opened today, measured by open-interest increase rather than volume. Free, no account.',
    kicker: 'New positions',
    h1: 'Unusual Options Activity Today',
    sub: 'Ranked by open interest that actually increased — positions opened, not closed. Volume alone cannot tell those apart. Free, no account.',
    summary: (d) =>
      `Session of ${d.date}. ${d.total} of notional was opened across ${d.tickers} underlyings, ${d.callPct}% of it on the call side.`,
    lists: {
      contracts: {
        h: 'Biggest single positions opened',
        note: 'One strike, one expiry. Open interest rose by this many contracts, so these were entered rather than closed out.',
      },
      byTicker: {
        h: 'Biggest new positioning by underlying',
        note: 'All strikes and expiries summed per name, counting only contracts whose open interest increased.',
      },
      topCalls: {
        h: 'Largest new call-side positioning',
        note: 'Notional opened on calls. On index and sector ETFs this is often overwriting or hedging, not a directional bet.',
      },
      topPuts: {
        h: 'Largest new put-side positioning',
        note: 'Notional opened on puts. Heavy put opening on ETFs usually reads as portfolio hedging rather than a view on that fund.',
      },
    },
    col: { ticker: 'Underlying', side: 'Side', strike: 'Strike', expiry: 'Expiry', added: 'Contracts added', notional: 'Notional', callShare: 'Call share' },
    call: 'Call', put: 'Put', etf: 'ETF',
    empty: 'No new positioning met this condition in the session.',
    readT: 'How to read these numbers',
    read: [
      ['Open interest, not volume', 'A contract can trade a million times and leave open interest unchanged — that is the same position being passed around. Open interest rising means new risk was actually put on. Everything here is filtered on that.'],
      ['Notional is size, not conviction', 'Notional is contracts x 100 x strike. It measures how much underlying the position references, not how much cash was paid. A far out-of-the-money call shows a large notional for a small premium.'],
      ['ETFs are hedges more often than bets', 'Large put opening on SPY, QQQ or GLD is usually portfolio insurance, not a forecast for that fund. Index flow and single-name flow deserve different readings, which is why they are labelled here.'],
      ['This is end of day', 'Open interest is only final after the close, so this is the prior session. Nothing here is an intraday feed, and nothing here is a prediction.'],
    ],
    methodT: 'Method and source',
    method: [
      'Built from end-of-day options data across the tracked US options universe. For each contract we compare open interest against the previous session and keep only the increases.',
      'Notional = contracts added x 100 x strike.',
      'A name appears only if at least one of its contracts increased in open interest.',
      'Market-wide figures are suppressed entirely when fewer than 50 underlyings report — a thin sample cannot describe a market.',
      'ETFs are marked rather than removed. Their flow is real hedging activity and often the story of the session.',
    ],
    ctaT: 'See this per ticker',
    ctaSg: 'SIGNUM HQ — options flow, gamma, max pain',
    ctaUc: 'Undercurrent — the news and the money side by side',
    ctaDp: 'Today’s off-exchange (dark pool) leaders',
    allT: 'All tickers',
    disc: 'Educational and informational only — not investment advice, and no guarantee of accuracy or results.',
    unavailable: 'The end-of-day options tape is not available right now. It refreshes once per session.',
  },
  ko: {
    title: '오늘의 옵션 특이거래 — 신규 포지션 상위',
    desc: '오늘 새로 «열린» 옵션 포지션 상위. 거래량이 아니라 미결제약정 증가분으로 잽니다. 무료, 가입 없이.',
    kicker: '신규 포지션',
    h1: '오늘의 옵션 특이거래',
    sub: '미결제약정이 실제로 «늘어난» 것만 셉니다 — 청산이 아니라 진입입니다. 거래량만으로는 그 둘을 구분할 수 없습니다. 무료, 가입 없이.',
    summary: (d) =>
      `${d.date} 장 기준. ${d.tickers}개 기초자산에서 명목 ${d.total} 규모의 포지션이 새로 열렸고, 그중 ${d.callPct}% 가 콜 쪽이었습니다.`,
    lists: {
      contracts: {
        h: '가장 크게 열린 단일 포지션',
        note: '행사가 하나, 만기 하나. 미결제약정이 이만큼 늘었으므로 청산이 아니라 «진입»입니다.',
      },
      byTicker: {
        h: '기초자산별 신규 포지션 합계',
        note: '한 종목의 모든 행사가·만기를 합산하되, 미결제약정이 늘어난 계약만 셉니다.',
      },
      topCalls: {
        h: '콜 쪽 신규가 가장 큰 종목',
        note: '콜에서 새로 열린 명목 금액. 지수·섹터 ETF 에서는 방향성 베팅이 아니라 커버드콜이나 헤지인 경우가 많습니다.',
      },
      topPuts: {
        h: '풋 쪽 신규가 가장 큰 종목',
        note: '풋에서 새로 열린 명목 금액. ETF 의 대규모 풋 진입은 그 펀드에 대한 전망이라기보다 포트폴리오 보험으로 읽는 편이 맞습니다.',
      },
    },
    col: { ticker: '기초자산', side: '방향', strike: '행사가', expiry: '만기', added: '증가 계약', notional: '명목금액', callShare: '콜 비중' },
    call: '콜', put: '풋', etf: 'ETF',
    empty: '이 조건에 해당하는 신규 포지션이 이 장에는 없었습니다.',
    readT: '이 숫자를 읽는 법',
    read: [
      ['거래량이 아니라 미결제약정', '한 계약이 백만 번 거래돼도 미결제약정이 그대로면 같은 포지션이 손바뀜한 것뿐입니다. 미결제약정이 늘었다는 건 «새 위험이 실제로 얹혔다»는 뜻입니다. 여기 있는 값은 전부 그 기준으로 걸러집니다.'],
      ['명목금액은 규모이지 확신이 아니다', '명목금액 = 계약수 × 100 × 행사가. 그 포지션이 «얼마어치 기초자산을 가리키는지»를 재는 값이지, 실제로 지불한 돈이 아닙니다. 외가격 콜은 적은 프리미엄으로도 큰 명목금액이 찍힙니다.'],
      ['ETF 는 베팅보다 헤지인 경우가 많다', 'SPY·QQQ·GLD 의 대규모 풋 진입은 그 펀드에 대한 예측이 아니라 포트폴리오 보험인 경우가 대부분입니다. 지수 흐름과 개별 종목 흐름은 다르게 읽어야 해서 여기서는 ETF 를 표시해 둡니다.'],
      ['실시간이 아니라 마감 기준', '미결제약정은 마감 후에야 확정됩니다. 따라서 직전 장의 값이고, 장중 실시간이 아니며 예측도 아닙니다.'],
    ],
    methodT: '방법과 출처',
    method: [
      '추적 중인 미국 옵션 유니버스의 마감 데이터로 만듭니다. 계약마다 직전 장의 미결제약정과 비교해 «늘어난 것»만 남깁니다.',
      '명목금액 = 증가 계약수 × 100 × 행사가.',
      '미결제약정이 늘어난 계약이 하나라도 있어야 그 종목이 목록에 오릅니다.',
      '보고된 기초자산이 50개 미만이면 시장 전체 수치를 아예 내보내지 않습니다 — 표본이 얇으면 시장을 말할 수 없습니다.',
      'ETF 는 빼지 않고 표시합니다. 그 흐름은 실제 헤지 활동이고 그날의 이야기인 경우가 많습니다.',
    ],
    ctaT: '종목별로 보기',
    ctaSg: 'SIGNUM HQ — 옵션 자금 흐름·감마·맥스페인',
    ctaUc: '언더커런트 — 뉴스와 돈을 나란히',
    ctaDp: '오늘의 장외(다크풀) 상위 종목',
    allT: '전체 종목',
    disc: '교육·정보 목적입니다. 투자 조언이 아니며 정확성과 결과를 보장하지 않습니다.',
    unavailable: '마감 옵션 테이프를 지금 불러올 수 없습니다. 장마다 한 번 갱신됩니다.',
  },
  ja: {
    title: '今日のオプション異常出来高 — 新規建玉ランキング',
    desc: '今日あらたに「建てられた」オプションポジションの上位。出来高ではなく建玉の増加分で測ります。無料、登録不要。',
    kicker: '新規建玉',
    h1: '今日のオプション異常出来高',
    sub: '建玉が実際に「増えた」ものだけを数えます — 決済ではなく新規です。出来高だけではその二つを区別できません。無料、登録不要。',
    summary: (d) =>
      `${d.date} の取引。${d.tickers} 銘柄で想定元本 ${d.total} 相当のポジションが新規に建てられ、そのうち ${d.callPct}% がコール側でした。`,
    lists: {
      contracts: {
        h: '最も大きく建てられた単一ポジション',
        note: '権利行使価格ひとつ、満期ひとつ。建玉がこれだけ増えたので、決済ではなく「新規」です。',
      },
      byTicker: {
        h: '原資産別の新規建玉合計',
        note: '銘柄ごとに全権利行使価格・満期を合算し、建玉が増えた契約だけを数えます。',
      },
      topCalls: {
        h: 'コール側の新規が最も大きい銘柄',
        note: 'コールで新規に建てられた想定元本。指数・セクターETFでは方向性の賭けではなくカバードコールやヘッジであることが多いです。',
      },
      topPuts: {
        h: 'プット側の新規が最も大きい銘柄',
        note: 'プットで新規に建てられた想定元本。ETFの大規模なプット新規は、そのファンドへの見通しよりポートフォリオ保険と読むほうが妥当です。',
      },
    },
    col: { ticker: '原資産', side: '方向', strike: '権利行使', expiry: '満期', added: '増加建玉', notional: '想定元本', callShare: 'コール比率' },
    call: 'コール', put: 'プット', etf: 'ETF',
    empty: 'この条件に当てはまる新規建玉はこの取引にはありませんでした。',
    readT: 'この数字の読み方',
    read: [
      ['出来高ではなく建玉', '一つの契約が百万回売買されても建玉が変わらなければ、同じポジションが持ち回されただけです。建玉が増えたということは「新しいリスクが実際に乗った」という意味です。ここの数字はすべてその基準で絞られています。'],
      ['想定元本は規模であって確信ではない', '想定元本 = 契約数 × 100 × 権利行使価格。そのポジションが「どれだけの原資産を指しているか」を測る値で、実際に支払った金額ではありません。アウトオブザマネーのコールは少ないプレミアムでも大きな想定元本になります。'],
      ['ETFは賭けよりヘッジであることが多い', 'SPY・QQQ・GLDの大規模なプット新規は、そのファンドへの予測ではなくポートフォリオ保険であることがほとんどです。指数のフローと個別銘柄のフローは読み方が違うので、ここではETFを明示しています。'],
      ['リアルタイムではなく引け基準', '建玉は引け後にしか確定しません。したがって直前の取引の値であり、場中のリアルタイムでも予測でもありません。'],
    ],
    methodT: '方法と出典',
    method: [
      '追跡している米国オプションユニバースの引けデータから作ります。契約ごとに直前取引の建玉と比べ、「増えたもの」だけを残します。',
      '想定元本 = 増加契約数 × 100 × 権利行使価格。',
      '建玉が増えた契約が一つでもある銘柄だけがリストに載ります。',
      '報告された原資産が50銘柄未満のときは市場全体の数値を一切出しません — 標本が薄ければ市場を語れません。',
      'ETFは除外せず表示します。そのフローは実際のヘッジ活動であり、その日の物語であることが多いからです。',
    ],
    ctaT: '銘柄ごとに見る',
    ctaSg: 'SIGNUM HQ — オプションフロー・ガンマ・マックスペイン',
    ctaUc: 'アンダーカレント — ニュースとお金を並べて',
    ctaDp: '今日の場外（ダークプール）上位銘柄',
    allT: '全銘柄',
    disc: '教育・情報目的であり投資助言ではありません。正確性や結果を保証しません。',
    unavailable: '引けのオプションテープを今は取得できません。取引ごとに1回更新されます。',
  },
};

export async function generateMetadata(
  { params }: { params: Promise<{ locale: string }> },
): Promise<Metadata> {
  const { locale } = await params;
  const lc = loc(locale);
  const l = L[lc];
  const base = publicBase();
  const url = `${base}/${lc}/options-flow`;
  const title = `${l.title} | SIGNUM HQ`;
  const d = await getInstitutionalFlowLeaders().catch(() => null);
  const og = new URLSearchParams({ kind: 'options' });
  if (d?.date) og.set('date', d.date);
  (d?.contracts ?? []).slice(0, 3).forEach((r, i) => {
    const size = r.notional >= 1e9 ? `$${(r.notional / 1e9).toFixed(2)}B` : `$${Math.round(r.notional / 1e6)}M`;
    og.set(`r${i + 1}`, `${r.ticker}|${r.type === 'call' ? 'Call' : 'Put'} $${r.strike} · ${r.expiry}|${size} opened`);
  });
  const ogUrl = `${base}/api/og/leaders?${og.toString()}`;
  return {
    title,
    description: l.desc,
    alternates: {
      canonical: url,
      languages: {
        en: `${base}/en/options-flow`, ko: `${base}/ko/options-flow`, ja: `${base}/ja/options-flow`,
        'x-default': `${base}/en/options-flow`,
      },
    },
    openGraph: { title, description: l.desc, url, type: 'website', images: [ogUrl] },
    twitter: { card: 'summary_large_image', title, description: l.desc, images: [ogUrl] },
  };
}

const money = (v: number) =>
  v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${Math.round(v / 1e6)}M` : `$${Math.round(v / 1e3)}K`;

export default async function OptionsFlowPage(
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  const lc = loc(locale);
  const l = L[lc];
  const base = publicBase();
  const url = `${base}/${lc}/options-flow`;

  const data: InstitutionalFlowLeaders | null = await getInstitutionalFlowLeaders().catch(() => null);

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
    tag: { fontSize: 10, fontWeight: 800, color: '#6B7480', border: '1px solid #DCD7CC', borderRadius: 5, padding: '1px 4px', marginLeft: 6 },
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

  const Name = ({ t, etf }: { t: string; etf: boolean }) => (
    <>
      <a href={`/${lc}/flow/${t}`} style={S.a}>{t}</a>
      {etf && <span style={S.tag}>{l.etf}</span>}
    </>
  );

  const ContractTable = ({ rows }: { rows: FlowLeaderContract[] }) => {
    if (!rows.length) return <div style={S.empty}>{l.empty}</div>;
    return (
      <div style={S.scroll}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.thL}>{l.col.ticker}</th>
              <th style={S.thL}>{l.col.side}</th>
              <th style={S.th}>{l.col.strike}</th>
              <th style={S.thL}>{l.col.expiry}</th>
              <th style={S.th}>{l.col.added}</th>
              <th style={S.th}>{l.col.notional}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.ticker}-${r.type}-${r.strike}-${r.expiry}-${i}`}>
                <td style={S.tdL}><Name t={r.ticker} etf={r.isEtf} /></td>
                <td style={{ ...S.tdL, ...(r.type === 'call' ? S.up : S.down) }}>{r.type === 'call' ? l.call : l.put}</td>
                <td style={S.td}>${r.strike.toLocaleString()}</td>
                <td style={S.tdL}>{r.expiry}</td>
                <td style={S.td}>+{r.contracts.toLocaleString()}</td>
                <td style={S.td}>{money(r.notional)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const TickerTable = ({ rows }: { rows: FlowLeaderTicker[] }) => {
    if (!rows.length) return <div style={S.empty}>{l.empty}</div>;
    return (
      <div style={S.scroll}>
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.thL}>{l.col.ticker}</th>
              <th style={S.th}>{l.col.notional}</th>
              <th style={S.th}>{l.col.added}</th>
              <th style={S.th}>{l.col.callShare}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.ticker}>
                <td style={S.tdL}><Name t={r.ticker} etf={r.isEtf} /></td>
                <td style={S.td}>{money(r.notional)}</td>
                <td style={S.td}>+{r.contracts.toLocaleString()}</td>
                <td style={{ ...S.td, ...(r.callPct >= 50 ? S.up : S.down) }}>{r.callPct.toFixed(0)}%</td>
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
    total: money(data.totalNotional),
    callPct: data.callPct.toFixed(0),
    tickers: data.tickers.toLocaleString(),
  });

  const facts: string[] = [];
  const c0 = data.contracts[0];
  if (c0) facts.push(`The largest single position opened was ${c0.ticker} ${c0.type}s at $${c0.strike} expiring ${c0.expiry}: open interest rose by ${c0.contracts.toLocaleString()} contracts, ${money(c0.notional)} notional.`);
  const t0 = data.byTicker[0];
  if (t0) facts.push(`${t0.ticker} saw the most new positioning overall at ${money(t0.notional)}, ${t0.callPct.toFixed(0)}% of it on calls.`);
  const p0 = data.topPuts[0];
  if (p0) facts.push(`The heaviest new put-side positioning was ${p0.ticker} at ${money(p0.notional)}.`);

  const brand = `${base}/#org`;
  const jsonLd: Record<string, unknown>[] = [
    {
      '@context': 'https://schema.org', '@type': 'Dataset', '@id': `${url}#dataset`,
      name: l.title,
      description: [
        l.desc,
        `Session ${data.date}. ${money(data.totalNotional)} of notional opened across ${data.tickers} underlyings, ${data.callPct}% on calls.`,
        ...facts,
        'Everything here is filtered on open interest that increased, so it reflects positions entered rather than volume passed between holders.',
      ].join(' ').slice(0, 1400),
      url,
      isAccessibleForFree: true,
      // ⚠️ `@id` 참조만 두면 구글이 객체 타입을 못 읽는다
      //    (GSC: Invalid object type for field "creator", 2026-08-31).
      //    같은 문서 안에 Organization 노드가 있어도 @type 을 인라인으로 줘야 한다.
      creator: { '@type': 'Organization', '@id': brand, name: 'SIGNUM HQ' },
      temporalCoverage: data.date ?? undefined,
      variableMeasured: ['open interest increase', 'notional opened', 'call share of new positioning'],
      inLanguage: lc,
      license: `${base}/${lc}/terms`,
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'SIGNUM HQ', item: `${base}/${lc}` },
        { '@type': 'ListItem', position: 2, name: l.h1, item: url },
      ],
    },
  ];

  return (
    <main style={S.wrap}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div style={S.kicker}>SIGNUM HQ · {l.kicker}</div>
      <h1 style={S.h1}>{l.h1}</h1>
      <p style={S.sub}>{l.sub}</p>
      <p style={S.summary}>{summary}</p>

      <section>
        <h2 style={S.secH}>{l.lists.contracts.h}</h2>
        <p style={S.secNote}>{l.lists.contracts.note}</p>
        <ContractTable rows={data.contracts} />
      </section>

      <section>
        <h2 style={S.secH}>{l.lists.byTicker.h}</h2>
        <p style={S.secNote}>{l.lists.byTicker.note}</p>
        <TickerTable rows={data.byTicker} />
      </section>

      <section>
        <h2 style={S.secH}>{l.lists.topCalls.h}</h2>
        <p style={S.secNote}>{l.lists.topCalls.note}</p>
        <TickerTable rows={data.topCalls} />
      </section>

      <section>
        <h2 style={S.secH}>{l.lists.topPuts.h}</h2>
        <p style={S.secNote}>{l.lists.topPuts.note}</p>
        <TickerTable rows={data.topPuts} />
      </section>

      <h2 style={S.readH}>{l.readT}</h2>
      {l.read.map(([t, b]) => (
        <p key={t} style={S.gloss}><strong>{t}.</strong> {b}</p>
      ))}

      <h2 style={S.readH}>{l.methodT}</h2>
      {l.method.map((m) => (
        <p key={m.slice(0, 24)} style={S.li}>{m}</p>
      ))}

      <h2 style={S.readH}>{l.ctaT}</h2>
      {/* ★ 스토어 스마트링크를 쓴다 — 내부 웹 경로로 보내면 설치가 안 는다.
          /app·/app-uc 은 UA 분기 + install referrer 로 측정까지 된다. */}
      <a style={S.cta} href={`${base}/app?from=seo_optionsflow`} rel="noopener">{l.ctaSg} →</a>
      <a style={S.cta2} href={`${base}/app-uc?from=seo_optionsflow`} rel="noopener">{l.ctaUc} →</a>
      <a style={S.cta2} href={`/${lc}/dark-pool`}>{l.ctaDp}</a>
      <a style={S.cta2} href={`/${lc}/tickers`}>{l.allT}</a>

      <p style={S.disc}>{l.disc}</p>
    </main>
  );
}
