import type { Choice, Facts, Kind, Verdict } from './rules';
export type ReadLocale = 'ko' | 'en' | 'ja';
type Copy = {
  title: string; description: string; languages: string; ticker: string; show: string; invalid: string;
  allowed: string; choose: string; check: string; confirmed: string; unknown: string; better: string;
  sourceDate: string; readAt: string; missing: string; replaced: (a: string, b: string) => string;
  verdict: Record<Verdict, string>; kinds: Record<Kind, string>; choices: Record<Kind, Record<Choice, string>>;
  calls: string; puts: string; shares: string; offExchange: string; volume: string; filing: string;
  tradeDate: string; code: string; plan: string; derivative: string; yes: string; no: string;
  unprovided: string; source: string; app: string; method: string; methods: string[];
  limits: Record<Kind, string>; reading: Record<Kind, string>; codeNames: Record<string, string>;
};
export const READ_COPY: Record<ReadLocale, Copy> = {
  ko: {
    title: '이 해석, 맞을까?', description: '옵션·장외 비중·내부자 거래. 내 해석을 실제 관측 자료로 확인하는 무료 진단입니다.',
    languages: '언어', ticker: '대형주 종목', show: '종목 적용', invalid: '허용 목록의 종목만 입력해 주세요. 기본 사례를 표시합니다.',
    allowed: '입력 가능', choose: '내 해석을 골라 주세요', check: '자료로 확인', confirmed: '자료로 확인되는 것', unknown: '자료만으로 알 수 없는 것', better: '더 정확한 읽는 법',
    sourceDate: '원천 관측일', readAt: '운영 자료 조회 시각', missing: '자료 부족', replaced: (a, b) => `${a} 자료가 부족해 ${b}의 같은 사례로 대체했습니다.`,
    verdict: { insufficient: '자료 부족 — 판정 보류', supported: '자료의 한계를 지킨 해석입니다', overreach: '자료로 확인할 수 없는 단정입니다', premise: '해석의 전제부터 자료와 다릅니다' },
    kinds: { options: '옵션 흐름', darkPool: '장외·다크풀 비중', insider: '내부자 거래' },
    choices: {
      options: { claim: '콜 거래가 많으니 고래가 상승을 확신한다', observe: '콜·풋 거래량은 확인되지만 거래자의 의도는 단정할 수 없다', opposite: '콜 거래가 많으면 주가 하락이 확정된다' },
      darkPool: { claim: '다크풀 비중이 높으니 세력이 매집한다', observe: '장외 체결 비중은 확인되지만 매집 여부는 단정할 수 없다', opposite: '장외 비중만으로 기관의 순매도도 확정할 수 있다' },
      insider: { claim: '내부자가 팔았으니 악재다', observe: '거래 코드·파생 여부·계획거래 정보를 구분해야 한다', opposite: '계획거래나 옵션 행사라면 반드시 호재다' },
    },
    calls: '콜 거래량(계약)', puts: '풋 거래량(계약)', shares: '주식 수', offExchange: '장외 체결 비중', volume: '장외 거래량(주)',
    filing: 'SEC 원문 공시', tradeDate: '거래일', code: '거래 코드', plan: '10b5-1 계획거래', derivative: '파생 거래', yes: '예', no: '아니요',
    unprovided: '자료 부족 · 공급사 미제공/미확인', source: '출처', app: '내 종목으로 해 보기', method: '자료와 판정 기준',
    methods: ['로그인·결제 없이 이용할 수 있습니다. 보기는 검토된 고정 규칙으로 판정하며 AI 호출은 없습니다.',
      '운영 API와 같은 적재본을 읽습니다. 옵션은 Intrinio EOD, 장외는 FINRA 일별 자료이며 장중 실시간이 아닙니다. 표시 숫자는 원본 값이며 반올림하지 않습니다.',
      '자료 조회는 5분 캐시입니다. 옵션·장외 관측일은 7일, 내부자 공시·거래일은 90일 이내만 사용합니다. 관측일은 날짜 단위로 표시합니다(옵션·장외 원천은 날짜만 제공, 내부자 공시 접수 시각도 날짜만 표시). 조회 시각은 관측 시각이 아닙니다.',
      '내부자는 캐시된 첫 30개 공시 중 유효한 최신 거래 한 건입니다. 전체 거래·순매매 집계가 아닙니다. 같은 거래일에는 비파생 S 코드를 우선합니다.',
      'Intrinio 내부자 자료는 10b5-1 여부를 제공하지 않습니다. 미제공을 계획거래 아님으로 해석하지 마세요. 공시 링크가 없으면 계획 여부 확인도 자료 부족입니다.',
      '우선 종목이 결측이면 목록 안의 다른 종목을 사용합니다. 모든 후보가 결측이어도 사례를 남기고 자료 부족으로 표시합니다.',
      '금융 교육용 정보이며 투자 권유·수익 예측·개별 투자 자문이 아닙니다.'],
    limits: {
      options: '거래자의 신원, 매수·매도 개시, 신규·청산, 다리별 헤지 여부나 상승 확신은 이 합계로 확인할 수 없습니다.',
      darkPool: 'FINRA 장외 비중에는 ATS와 도매업자 내부체결이 함께 포함됩니다. 기관의 신원·순매수·매집 의도는 이 비중으로 알 수 없습니다. 공매도 비중도 순매도와 같지 않습니다.',
      insider: '매도 동기나 미래 악재·호재는 거래 코드만으로 알 수 없습니다. 계획거래 여부가 미제공이면 계획 매매인지 재량 매매인지도 확인되지 않습니다.',
    },
    reading: {
      options: '같은 관측일의 콜·풋 거래량부터 비교하세요. 콜 우세여도 매수 확신으로 채점하지 말고 거래 방향·만기·행사가·다중 전략·미결제약정 변화를 추가 확인하세요.',
      darkPool: '같은 종목의 평소 비중·실제 거래량·관측일을 함께 비교하세요. 장외 비중을 좁은 의미의 다크풀 비중이나 매집 신호로 바꾸지 마세요.',
      insider: 'S(매도)와 M(옵션 행사), F(세금 관련 처분)를 구분하세요. 옵션 행사와 매도가 연계됐는지 공시 전체·각주·10b5-1 표기를 확인하세요. 계획거래라도 호재·악재가 확정되는 것은 아닙니다.',
    },
    codeNames: { P: '매수', S: '매도', M: '옵션 행사', F: '세금 관련 처분', A: '부여', G: '증여', C: '전환' },
  },
  en: {
    title: 'Does this reading hold up?', description: 'A free check of your reading of options, off-exchange activity and insider transactions against observed data.',
    languages: 'Language', ticker: 'Large-cap ticker', show: 'Apply ticker', invalid: 'Enter a ticker from the allowed list. Default examples are shown.',
    allowed: 'Allowed tickers', choose: 'Choose your reading', check: 'Check the evidence', confirmed: 'What the data confirms', unknown: 'What this data cannot tell us', better: 'A more accurate reading',
    sourceDate: 'Source observation date', readAt: 'Operating data read at', missing: 'Insufficient data', replaced: (a, b) => `${a} has insufficient data; the same example uses ${b} instead.`,
    verdict: { insufficient: 'Insufficient data — no verdict', supported: 'Your reading respects the evidence', overreach: 'This conclusion exceeds the evidence', premise: 'The premise differs from the observation' },
    kinds: { options: 'Options flow', darkPool: 'Off-exchange / dark pool share', insider: 'Insider transactions' },
    choices: {
      options: { claim: 'Heavy call volume means whales are certain the stock will rise', observe: 'Call and put volumes are observable; trader intent is not established', opposite: 'Heavy call volume guarantees a price decline' },
      darkPool: { claim: 'A high dark pool share proves institutions are accumulating', observe: 'Off-exchange share is observable; accumulation is not established', opposite: 'Off-exchange share alone also proves institutional net selling' },
      insider: { claim: 'An insider sold, so bad news is coming', observe: 'Transaction codes, derivatives and trading-plan information must be distinguished', opposite: 'A planned trade or option exercise is necessarily good news' },
    },
    calls: 'Call volume (contracts)', puts: 'Put volume (contracts)', shares: 'Shares', offExchange: 'Off-exchange share', volume: 'Off-exchange volume (shares)',
    filing: 'SEC filing', tradeDate: 'Transaction date', code: 'Transaction code', plan: '10b5-1 trading plan', derivative: 'Derivative transaction', yes: 'Yes', no: 'No',
    unprovided: 'Insufficient data · not provided / unverified', source: 'Source', app: 'Try it with my stocks', method: 'Data and decision rules',
    methods: ['Free, with no login. Reviewed fixed rules evaluate each choice; no AI calls are made.',
      'Reads the same stored data as the operating APIs: Intrinio options EOD and FINRA daily off-exchange data. These are not intraday live readings. Numbers retain their source precision.',
      'Data reads are cached for five minutes. Options and off-exchange dates must be within seven days; insider dates within 90 days. Observation dates are shown by day (options and off-exchange sources provide dates only; insider filing timestamps are shown as dates). Read time is not observation time.',
      'The insider example is one latest valid transaction from the first 30 cached filings, not a complete history or net-trading total. Non-derivative S transactions take priority on the same date.',
      'Intrinio does not provide 10b5-1 status here. Missing does not mean no plan. If the filing link is absent, plan verification also lacks data.',
      'Missing examples use another ticker from the list. If all candidates lack data, the example remains with an insufficient-data result.',
      'Financial education only; no investment solicitation, return forecast or personalized investment advice.'],
    limits: {
      options: 'These totals do not establish trader identity, buyer/seller initiation, opening/closing positions, strategy hedges or bullish conviction.',
      darkPool: 'FINRA off-exchange activity includes ATS trades and wholesaler internalization. This share cannot establish institutional identity, net buying or accumulation intent. Short volume is not net selling either.',
      insider: 'A transaction code alone does not establish motive or future good/bad news. Without plan information, planned versus discretionary trading remains unknown.',
    },
    reading: {
      options: 'Compare call and put volume for the same date first. More calls do not prove bullish buying. Check trade direction, expirations, strikes, multi-leg strategies and changes in open interest.',
      darkPool: 'Compare the same ticker’s normal share, absolute volume and observation date. Do not relabel off-exchange share as ATS-only dark pool share or an accumulation signal.',
      insider: 'Distinguish S (sale), M (option exercise) and F (tax-related disposition). Review the full filing, footnotes and 10b5-1 disclosure for any linked exercise and sale. A plan proves neither good nor bad news.',
    },
    codeNames: { P: 'Purchase', S: 'Sale', M: 'Option exercise', F: 'Tax-related disposition', A: 'Award', G: 'Gift', C: 'Conversion' },
  },
  ja: {
    title: 'この解釈、合っている？', description: 'オプション・場外比率・内部者取引。実際の観測資料で自分の解釈を確認する無料診断です。',
    languages: '言語', ticker: '大型株の銘柄', show: '銘柄を適用', invalid: '許可リスト内の銘柄を入力してください。既定の事例を表示します。',
    allowed: '入力できる銘柄', choose: '自分の解釈を選んでください', check: '資料で確認', confirmed: '資料で確認できること', unknown: 'この資料だけでは分からないこと', better: 'より正確な読み方',
    sourceDate: '原資料の観測日', readAt: '運用資料の取得時刻', missing: '資料不足', replaced: (a, b) => `${a}は資料不足のため、同じ事例を${b}に置き換えました。`,
    verdict: { insufficient: '資料不足 — 判定保留', supported: '資料の限界を守った解釈です', overreach: '資料では確認できない断定です', premise: '解釈の前提が観測と異なります' },
    kinds: { options: 'オプションフロー', darkPool: '場外・ダークプール比率', insider: '内部者取引' },
    choices: {
      options: { claim: 'コール取引が多いので大口は上昇を確信している', observe: 'コール・プット出来高は確認できるが取引者の意図は断定できない', opposite: 'コール取引が多ければ株価下落が確定する' },
      darkPool: { claim: 'ダークプール比率が高いので大口が買い集めている', observe: '場外約定比率は確認できるが買い集めとは断定できない', opposite: '場外比率だけで機関の売り越しも確定できる' },
      insider: { claim: '内部者が売ったので悪材料だ', observe: '取引コード・デリバティブ・計画取引情報を区別する必要がある', opposite: '計画取引やオプション行使なら必ず好材料だ' },
    },
    calls: 'コール出来高（契約）', puts: 'プット出来高（契約）', shares: '株数', offExchange: '場外約定比率', volume: '場外出来高（株）',
    filing: 'SEC開示原文', tradeDate: '取引日', code: '取引コード', plan: '10b5-1計画取引', derivative: 'デリバティブ取引', yes: 'はい', no: 'いいえ',
    unprovided: '資料不足・未提供／未確認', source: '出典', app: '自分の銘柄で試す', method: '資料と判定基準',
    methods: ['ログイン・支払いは不要です。検討済みの固定規則で判定し、AI呼び出しはありません。',
      '運用APIと同じ保存資料を読みます。オプションはIntrinio EOD、場外はFINRA日次資料で、日中リアルタイムではありません。数値は原資料の精度のままです。',
      '取得資料は5分キャッシュです。オプション・場外は7日以内、内部者の開示日・取引日は90日以内を使用します。観測日は日付単位で表示します（オプション・場外の原資料は日付のみ、内部者の開示受付時刻も日付のみ表示）。取得時刻は観測時刻ではありません。',
      '内部者事例はキャッシュされた最初の30開示から有効な最新取引1件です。全取引や純売買集計ではありません。同日なら非デリバティブのS取引を優先します。',
      'Intrinio資料は10b5-1の有無を提供しません。未提供を計画なしと読まないでください。開示リンクがなければ計画の確認も資料不足です。',
      '優先銘柄が欠損ならリスト内の別銘柄に置き換えます。全候補が欠損でも事例を残し、資料不足と表示します。',
      '金融教育用情報です。投資勧誘・収益予測・個別の投資助言ではありません。'],
    limits: {
      options: 'この合計では取引者の身元、買い・売りの主導、新規・決済、戦略上のヘッジ、上昇確信は確認できません。',
      darkPool: 'FINRAの場外取引にはATSと卸売業者の内部約定が含まれます。機関の身元・買い越し・買い集めの意図はこの比率では分かりません。空売り出来高も売り越しとは異なります。',
      insider: '取引コードだけでは売却動機や将来の好悪材料は分かりません。計画情報が未提供なら計画取引か裁量取引かも未確認です。',
    },
    reading: {
      options: 'まず同じ観測日のコール・プット出来高を比較します。コール優勢でも強気買いとは断定せず、取引方向・満期・行使価格・複数レッグ・建玉変化を確認しましょう。',
      darkPool: '同一銘柄の平常比率・実際の出来高・観測日を比較しましょう。場外比率をATSだけの比率や買い集めシグナルに置き換えないでください。',
      insider: 'S（売却）とM（オプション行使）、F（税関連処分）を区別します。行使と売却の関連、開示全体・脚注・10b5-1表記を確認しましょう。計画取引でも好悪材料は確定しません。',
    },
    codeNames: { P: '購入', S: '売却', M: 'オプション行使', F: '税関連処分', A: '付与', G: '贈与', C: '転換' },
  },
};

/** 정수부에 천 단위 쉼표만 넣는다 — 반올림·소수 자릿수 변경 없음(51.123456789 → 51.123456789). */
export const grouped = (n: number): string => {
  const [int, frac] = String(n).split('.');
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac !== undefined ? `.${frac}` : '');
};
/** 원본 값의 문자열 변환만 수행. 비율 계산·반올림·숫자 보간 없음. */
export function evidence(kind: Kind, f: Facts, l: ReadLocale): Array<[string, string]> {
  const c = READ_COPY[l];
  if (kind === 'options' && f.options) return [[c.calls, grouped(f.options.callVol)], [c.puts, grouped(f.options.putVol)]];
  if (kind === 'darkPool' && f.darkPool) return [[c.offExchange, `${f.darkPool.pct}%`], [c.volume, grouped(f.darkPool.volume)]];
  const i = f.insider;
  if (kind !== 'insider' || !i) return [];
  const flag = (v: boolean | null) => v === null ? c.unprovided : v ? c.yes : c.no;
  return [[c.code, `${i.code} · ${c.codeNames[i.code]}`], [c.shares, grouped(i.shares)], [c.tradeDate, i.transactionDate],
    [c.plan, flag(i.plan)], [c.derivative, flag(i.derivative)]];
}
