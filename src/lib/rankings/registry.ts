// ============================================================================
// 랭킹 등록부 — «무엇을 재는가»와 «왜 가치 있는가»를 코드 옆에 둔다.
//
// 설명을 문서로 따로 빼면 코드가 바뀔 때 설명만 남아 거짓말이 된다.
// 여기 적힌 what/why 는 API 응답으로 그대로 나가고, 다른 에이전트가
// 그걸 읽고 쓴다.
//
// ★ 2026-09-28: 공개 페이지(/en·/ja/rankings/*)가 what/why/guards 를 그대로 찍어
//   영어·일본어 페이지의 메타 설명·OG·구조화 데이터·본문이 전부 «한국어»였다(22장).
//   번역은 원문 «바로 옆»에 둔다(따로 두면 원문만 고쳐지고 번역이 거짓말이 된다).
//   i18n·sourcePublic 은 필수 필드다 — 새 랭킹이 번역 없이 추가되면 타입 검사가 막는다.
//   원문(what/why/guards)을 고치면 같은 항목의 i18n 도 같이 고친다.
// ============================================================================
import { Phase } from './engine';

export type Loc = { ko: string; en: string; ja: string };
/** 공개 페이지용 번역 한 벌 — 원문 what/why/guards 와 같은 뜻 */
export type SpecCopy = { what: string; why: string; guards: string[] };

export type RankingSpec = {
    id: string;
    phase: Phase;
    /** 마감 후에만 자료가 들어오는가 (다크풀) */
    needsPostClose?: boolean;
    name: Loc;
    /** 무엇을 재는가 — 계산의 정의 */
    what: string;
    /** 왜 가치 있는가 — 이게 없으면 그냥 숫자 나열이다 */
    why: string;
    source: string;
    /** 이 랭킹이 놓기 쉬운 함정과, 그걸 막은 방법 */
    guards: string[];
    /** 값의 방향 — 클수록 이례적인가, 작을수록인가 */
    direction: 'deviation' | 'proximity';
    /**
     * 이 랭킹이 돌려면 필요한 «이력». 자료가 찰 때까지 엔진이 진행률을 보고하고,
     * 차면 코드 수정 없이 저절로 켜진다. (앞으로 만들 랭킹도 이 방식을 쓴다.)
     */
    requires?: { field: string; sessions: number; source: 'gex' | 'flow'; why: string };
    /** 공개 페이지용 영어·일본어(한국어는 위 원문). */
    i18n: { en: SpecCopy; ja: SpecCopy };
    /** 공개 페이지의 «자료원» — 내부 키·테이블 이름(source) 대신 원천을 말한다 */
    sourcePublic: Loc;
};

/** 페이지가 쓸 한 벌 — ko 는 원문, en·ja 는 번역 */
export function specCopy(spec: RankingSpec, l: 'ko' | 'en' | 'ja'): SpecCopy & { source: string } {
    const c = l === 'ko' ? { what: spec.what, why: spec.why, guards: spec.guards } : spec.i18n[l];
    return { ...c, source: spec.sourcePublic[l] };
}

const SRC_CHAIN: Loc = {
    ko: '옵션 체인 일별 스냅샷(자체 수집 이력)',
    en: 'Daily options-chain snapshots (our own collected history)',
    ja: 'オプションチェーンの日次スナップショット（自社収集の履歴）',
};
const SRC_STRUCTURE: Loc = {
    ko: '옵션 체인 미결제약정 — 하루 여러 차례 계산하는 구조 스냅샷',
    en: 'Options-chain open interest — structure snapshots computed several times a day',
    ja: 'オプションチェーンの建玉 — 1日に数回計算する構造スナップショット',
};
const SRC_FINRA: Loc = {
    ko: 'FINRA Reg SHO 일별 공매도 거래량(장외 보고분)',
    en: 'FINRA Reg SHO daily short-sale volume (off-exchange reports)',
    ja: 'FINRA Reg SHO 日次空売り出来高（取引所外の報告分）',
};

export const RANKINGS: RankingSpec[] = [
    // ── 장중 ────────────────────────────────────────────────────────────
    {
        id: 'deviation', phase: 'intraday',
        name: { ko: '평소 대비 이탈', en: 'Break from own normal', ja: '平常からの乖離' },
        what: '종목별 옵션 지표(풋콜 비율·콜/풋 미결제약정·옵션 자금)를 그 종목 자신의 최근 30일 중앙값과 비교해, 가장 크게 벗어난 순으로 세운다. 그날 시장의 중앙 배수로 나눠 «시장이 같이 움직인 몫»을 뺀 뒤 잰다.',
        why: '절대 순위(옵션 프리미엄 TOP)는 시가총액을 따라가서 NVDA·TSLA·AAPL 이 거의 매일 상위다. 답을 미리 아는 랭킹은 볼 이유가 없다. 「이 종목이 평소와 다르다」만이 매일 답이 달라지고, 기관이 실제로 보는 축이다.',
        source: 'DynamoDB signum-flow-history',
        guards: ['대표 스냅샷(그날 총 OI 최대)', '만기 롤오버(같은 규모 체인만 비교)', 'MAD 분모 붕괴 방지', '|z|≥3 · 배수≥1.35', '시장 중앙 배수로 정규화(풋 미결제약정 동조율 90% 실측)', '축은 실측으로 선별 — 하루안 변동이 날짜간 변동보다 큰 축은 그날의 값이 없어 제외(whaleScore·dex·squeezeProbability)'],
        direction: 'deviation',
        sourcePublic: SRC_CHAIN,
        i18n: {
            en: {
                what: 'Each stock’s options metrics — put/call ratio, call and put open interest, and options premium — are compared with that stock’s own 30-day median, and the names furthest from normal rank first. Each ratio is divided by the market-wide median ratio for the day, so moves the whole market shared are taken out first.',
                why: 'Absolute rankings (top options premium) just track market cap, so NVDA, TSLA and AAPL sit on top almost every day. A ranking whose answer you already know is not worth checking. Only “this stock is behaving unlike itself” changes day to day — and it is the axis institutions actually watch.',
                guards: ['One representative snapshot per day (the one with the largest total open interest)', 'Expiry roll-overs: only chains of comparable size are compared', 'Guard against a collapsing MAD denominator', 'Thresholds: |z| ≥ 3 and a ratio of at least 1.35×', 'Normalized by the market-wide median ratio (put open interest moved together across 90% of names when measured)', 'Axes chosen by measurement — an axis that swings more within a day than between days has no stable daily value and is left out (whale score, DEX, squeeze probability)'],
            },
            ja: {
                what: '銘柄ごとのオプション指標（プット・コール比率、コール／プットの建玉、オプション資金）をその銘柄自身の直近30日の中央値と比べ、最も大きく外れた順に並べます。その日の市場全体の中央倍率で割り、市場全体が一緒に動いた分を差し引いてから測ります。',
                why: '絶対値のランキング（オプション資金トップなど）は時価総額に連動するため、NVDA・TSLA・AAPLがほぼ毎日上位に来ます。答えが分かっているランキングを見る理由はありません。「この銘柄がいつもと違う」だけが毎日答えの変わる軸であり、機関投資家が実際に見ている軸です。',
                guards: ['1日1枚の代表スナップショット（その日の総建玉が最大のもの）', '満期ロールオーバー：同じ規模のチェーン同士だけを比較', 'MAD（中央絶対偏差）の分母崩壊を防止', '閾値：|z| ≥ 3 かつ倍率1.35倍以上', '市場全体の中央倍率で正規化（実測でプット建玉の連動率90%）', '軸は実測で選別 — 日中の変動が日ごとの変動より大きい軸は「その日の値」が定まらないため除外（ホエールスコア・DEX・スクイーズ確率）'],
            },
        },
    },
    {
        id: 'multi-axis', phase: 'intraday',
        name: { ko: '다축 동시 이탈', en: 'Multiple axes at once', ja: '複数軸の同時乖離' },
        what: '한 종목이 두 개 이상의 축에서 «동시에» 평소를 벗어난 경우만 모은다. 축 수가 많은 순, 같으면 이탈 크기 합이 큰 순.',
        why: '한 축만 튀는 건 우연일 수 있다. 미결제약정도 늘고 대형거래도 늘고 스퀴즈 확률도 오르면 그건 같은 사건의 세 얼굴이다. 단일 축 랭킹이 못 잡는 «강도»를 잡는다.',
        source: 'deviation 결과 재집계',
        guards: ['deviation 의 모든 게이트를 그대로 승계'],
        direction: 'deviation',
        sourcePublic: {
            ko: '«평소 대비 이탈» 결과를 다시 모은 것',
            en: 'Re-aggregated from the “Break from own normal” results',
            ja: '「平常からの乖離」の結果を再集計',
        },
        i18n: {
            en: {
                what: 'Collects only stocks that broke from their own normal on two or more axes at the same time. More axes rank higher; ties go to the larger combined deviation.',
                why: 'A spike on one axis can be noise. When open interest, block trades and squeeze odds all rise together, those are three faces of the same event. This catches the intensity a single-axis ranking misses.',
                guards: ['Inherits every gate of the “Break from own normal” ranking'],
            },
            ja: {
                what: '2つ以上の軸で«同時に»平常から外れた銘柄だけを集めます。軸の数が多い順、同じなら乖離の大きさの合計が大きい順です。',
                why: '1つの軸だけが跳ねるのは偶然かもしれません。建玉も大口取引もスクイーズ確率も同時に上がれば、それは同じ出来事の3つの顔です。単一軸のランキングでは捉えられない«強さ»を捉えます。',
                guards: ['「平常からの乖離」ランキングのゲートをすべてそのまま継承'],
            },
        },
    },
    {
        id: 'maxpain-gap', phase: 'intraday',
        name: { ko: '맥스페인 이격도', en: 'Max pain gap', ja: 'マックスペイン乖離' },
        // ⚠️ 2026-09-28 정의 수정: «옵션 보유자 총 손실이 최소가 되는 가격»은 반대말이었다.
        //    맥스페인 = 가장 많은 옵션이 휴지가 되는 행사가(= 매수자 전체의 손실이 가장 큰 가격).
        //    /learn/max-pain 의 정의와 같게 맞춘다.
        what: '현재가가 맥스페인(가장 많은 옵션이 휴지가 되는 행사가)에서 몇 % 떨어져 있는지. 먼 순.',
        why: '만기가 가까울수록 주가가 맥스페인 쪽으로 끌리는 경향이 관찰된다(핀 현상). 이격이 크다는 건 그 인력이 아직 작동하지 않았거나, 반대로 강한 힘이 밀어내고 있다는 뜻이다. 「종가가 어디로 끌리나」라는 서사가 붙는다.',
        source: 'Redis structure:part:* (structure-build 가 2,001종목을 굽는다)',
        guards: ['맥스페인이 현재가에서 ±35% 밖이면 계산 오류로 보고 버린다', '대표 스냅샷 사용'],
        direction: 'deviation',
        sourcePublic: SRC_STRUCTURE,
        i18n: {
            en: {
                what: 'How far, in percent, the current price sits from max pain — the strike at which the most open options would expire worthless. Widest gap first.',
                why: 'Near expiry, price has been observed to drift toward max pain (pinning). A wide gap means that pull has not taken hold yet — or that a stronger force is pushing price away. It puts a number on the question “where is the close being pulled?”',
                guards: ['A max pain more than ±35% away from the current price is treated as a calculation error and dropped', 'Uses one representative snapshot'],
            },
            ja: {
                what: '現在値がマックスペイン（最も多くのオプションが無価値で満期を迎える権利行使価格）から何％離れているか。離れている順。',
                why: '満期が近づくほど株価がマックスペインに引き寄せられる傾向が観察されています（ピン現象）。乖離が大きいのは、その引力がまだ働いていないか、逆に強い力が押し返しているということです。「終値はどこへ引き寄せられるか」という問いに数字を与えます。',
                guards: ['マックスペインが現在値から±35%を超えて離れている場合は計算エラーとみなして除外', '代表スナップショットを使用'],
            },
        },
    },
    {
        id: 'gamma-flip', phase: 'intraday',
        name: { ko: '감마플립 근접', en: 'Near gamma flip', ja: 'ガンマフリップ接近' },
        what: '현재가가 감마 플립 레벨에서 몇 % 이내인지. 가까운 순.',
        why: '플립 레벨 위에서는 딜러가 «변동성을 죽이는» 방향(하락 시 매수·상승 시 매도)으로, 아래에서는 «변동성을 키우는» 방향으로 헤지한다. 그 경계에 붙어 있는 종목은 작은 움직임이 성격을 바꾼다. 예측이 아니라 포지셔닝 판독이다.',
        source: 'Redis structure:part:* (structure-build 가 2,001종목을 굽는다)',
        guards: ['플립 레벨이 현재가 ±25% 밖이면 버린다', '대표 스냅샷 사용'],
        direction: 'proximity',
        sourcePublic: {
            ko: '옵션 체인 GEX — 하루 여러 차례 계산하는 구조 스냅샷',
            en: 'Options-chain gamma exposure — structure snapshots computed several times a day',
            ja: 'オプションチェーンのGEX — 1日に数回計算する構造スナップショット',
        },
        i18n: {
            en: {
                what: 'How close, in percent, the current price is to the gamma flip level. Closest first.',
                why: 'Above the flip level, dealers hedge in a way that dampens volatility (buying dips, selling rallies); below it, their hedging amplifies moves. For a stock sitting on that boundary, a small move can change the character of trading. This is a read on positioning, not a forecast.',
                guards: ['Flip levels more than ±25% away from the current price are dropped', 'Uses one representative snapshot'],
            },
            ja: {
                what: '現在値がガンマフリップ水準から何％以内にあるか。近い順。',
                why: 'フリップ水準より上ではディーラーは«変動を抑える»方向（下落で買い・上昇で売り）に、下では«変動を増幅する»方向にヘッジします。その境界に張り付いた銘柄は、小さな動きで値動きの性格が変わります。予測ではなく、ポジショニングの読み取りです。',
                guards: ['フリップ水準が現在値から±25%を超えて離れている場合は除外', '代表スナップショットを使用'],
            },
        },
    },
    {
        id: 'money-vs-oi', phase: 'intraday',
        name: { ko: '돈과 포지션의 불일치', en: 'Dollars vs positions', ja: '資金と建玉の不一致' },
        what: '«돈»(콜/풋 프리미엄 비)과 «쌓인 포지션»(콜/풋 미결제약정 비)이 서로 반대를 가리키는 정도. 어긋난 순.',
        why: '미결제약정은 풋이 많은데 돈은 콜에 몰리는 상황이 실제로 나온다 — 싼 풋을 수로 깔아두고 비싼 콜에 자금을 넣는 그림이다. 둘 중 하나만 보면 정반대로 읽는다. 이 모순 자체가 정보다.',
        source: 'DynamoDB signum-flow-history (callPremium·putPremium·OI, 같은 스냅샷)',
        guards: ['프리미엄과 OI 를 반드시 «같은 스냅샷»에서 읽는다', '양쪽 모두 0보다 커야 한다'],
        direction: 'deviation',
        sourcePublic: {
            ko: '옵션 체인 일별 스냅샷 — 프리미엄과 미결제약정(같은 스냅샷)',
            en: 'Daily options-chain snapshots — premium and open interest from the same snapshot',
            ja: 'オプションチェーンの日次スナップショット — プレミアムと建玉（同じスナップショット）',
        },
        i18n: {
            en: {
                what: 'How strongly the money (the call/put premium ratio) and the standing positions (the call/put open-interest ratio) point in opposite directions. Largest mismatch first.',
                why: 'It really happens that open interest is put-heavy while the money flows into calls — cheap puts stacked up by count, with the dollars going into pricier calls. Read only one of the two and you get the opposite story. The contradiction itself is the information.',
                guards: ['Premium and open interest are always read from the same snapshot', 'Both sides must be greater than zero'],
            },
            ja: {
                what: '«お金»（コール／プットのプレミアム比）と«積み上がった建玉»（コール／プットの建玉比）が逆を指している度合い。食い違いが大きい順。',
                why: '建玉はプットが多いのに、お金はコールに集まるという状況が実際に起きます — 安いプットを枚数で積み、高いコールに資金を入れる構図です。片方だけを見ると正反対に読んでしまいます。この矛盾そのものが情報です。',
                guards: ['プレミアムと建玉は必ず«同じスナップショット»から読む', '両側とも0より大きいこと'],
            },
        },
    },

    // ── 마감 후 ─────────────────────────────────────────────────────────
    {
        id: 'darkpool-volume', phase: 'postclose', needsPostClose: true,
        name: { ko: '장외 물량 이탈', en: 'Off-exchange volume', ja: '取引所外の出来高乖離' },
        what: '장외(다크풀) 체결량이 그 종목의 20일 평균 대비 몇 배인지를, 다시 그날 시장 전체의 중앙 배수로 나눈 값. 시장 대비 이탈이 큰 순.',
        why: '거래소 밖 체결은 기관이 시장가를 흔들지 않으려 할 때 늘어난다. 다만 시장 전체가 조용한 날엔 모든 종목이 같이 줄어 «이탈»처럼 보인다 — 그래서 시장 대비로 본다.',
        source: 'FINRA Reg SHO (Redis finra:offexchange)',
        guards: ['시장 중앙 배수로 정규화', 'ETF 제외(이탈 상위를 오염시킨다)', '마지막으로 끝난 정규장 기준 — 날짜를 달고, 두 세션 이상 뒤처지면 뺀다'],
        direction: 'deviation',
        sourcePublic: SRC_FINRA,
        i18n: {
            en: {
                what: 'Off-exchange (dark pool) volume as a multiple of the stock’s own 20-day average, divided again by the market-wide median multiple for the day. Largest deviation versus the market first.',
                why: 'Off-exchange executions rise when institutions want to move size without disturbing the quote. But on a quiet day every stock’s volume shrinks together and looks like a “deviation” — so we measure against the market.',
                guards: ['Normalized by the market-wide median multiple', 'ETFs excluded (they would crowd the top of the list)', 'Based on the last completed regular session — dated, and left out once it falls two or more sessions behind'],
            },
            ja: {
                what: '取引所外（ダークプール）の約定量がその銘柄の20日平均の何倍かを、さらにその日の市場全体の中央倍率で割った値。市場比の乖離が大きい順。',
                why: '取引所外の約定は、機関投資家が価格を動かさずに大口を動かしたいときに増えます。ただし市場全体が静かな日は全銘柄が一緒に減って«乖離»に見えるため、市場比で見ます。',
                guards: ['市場全体の中央倍率で正規化', 'ETFは除外（乖離の上位を埋め尽くしてしまうため）', '直近に終わった通常取引のセッション基準 — 日付を付け、2セッション以上遅れたら外す'],
            },
        },
    },
    {
        id: 'darkpool-short', phase: 'postclose', needsPostClose: true,
        name: { ko: '장외 공매도 비중 이탈', en: 'Off-exchange shorts', ja: '取引所外の空売り比率乖離' },
        what: '장외 체결 중 공매도 비중이 그 종목의 평소보다 몇 %p 벗어났는지. 이탈이 큰 순.',
        why: '⚠️ 공매도 «비중» 자체는 방향성이 아니다. 시장 중앙값이 약 49% 인데, 도매업자가 소매 매수의 상대가 될 때 일단 공매도로 팔고 되사기 때문에 절반은 구조적으로 찍힌다. 「46% 공매도 = 하락 베팅」은 오독이다. 그 종목의 평소 대비 이탈만이 정보다.',
        source: 'FINRA Reg SHO (Redis finra:offexchange)',
        guards: ['배수가 아니라 %p 로 잰다(49%→65% 는 배수로 1.33뿐이지만 큰 이탈이다)', '±8%p 이상만', '날짜 일치 확인'],
        direction: 'deviation',
        sourcePublic: SRC_FINRA,
        i18n: {
            en: {
                what: 'How many percentage points the short share of off-exchange volume departed from the stock’s own normal. Largest departure first.',
                why: '⚠️ The short share by itself is not a directional bet. The market-wide median is about 49%, because wholesalers filling retail buy orders sell short first and cover later — about half of it is structural. Reading “46% short” as a bearish bet is a misread. Only the departure from the stock’s own normal carries information.',
                guards: ['Measured in percentage points, not multiples (49% → 65% is only 1.33× but a large departure)', 'Only departures of ±8 points or more', 'Dates must match'],
            },
            ja: {
                what: '取引所外約定のうち空売りの比率が、その銘柄の平常から何ポイント外れたか。乖離が大きい順。',
                why: '⚠️ 空売り«比率»そのものは方向性を示しません。市場の中央値は約49%で、ホールセラーが個人の買い注文の相手方になる際にいったん空売りで売って後で買い戻すため、半分は構造的に記録されます。「空売り46%＝下落への賭け」は誤読です。その銘柄の平常からの乖離だけが情報です。',
                guards: ['倍率ではなくポイントで測る（49%→65%は倍率では1.33倍にすぎないが大きな乖離）', '±8ポイント以上のみ', '日付の一致を確認'],
            },
        },
    },
    {
        id: 'stealth', phase: 'postclose', needsPostClose: true,
        name: { ko: '은밀 축적·분산', en: 'Stealth accumulation', ja: '静かな買い集め' },
        what: '장외 물량은 평소보다 많은데(volP↑) 그 물량 중 공매도 비중은 평소보다 낮은(shortP↓) 조합을 0~100 점으로. 70 이상 축적, 30 이하 분산.',
        why: '호가창 밖에서 «사 모으는» 그림과 «조용히 내보내는» 그림을 구분한다. 물량만 보면 방향을 모르고, 공매도만 보면 구조적 절반에 속는다. 둘을 겹쳐야 방향이 나온다. 예측이 아니라 포지셔닝 판독이다.',
        source: 'FINRA Reg SHO 파생(stealth·regime)',
        guards: ['백분위 표본 10일 미만이면 판정하지 않는다', 'ETF 제외', '날짜 일치 확인'],
        direction: 'deviation',
        sourcePublic: {
            ko: 'FINRA Reg SHO 일별 자료에서 파생(종목별 자기 20일 백분위)',
            en: 'Derived from FINRA Reg SHO daily data (each stock’s own 20-day percentiles)',
            ja: 'FINRA Reg SHO 日次データからの派生（各銘柄自身の20日パーセンタイル）',
        },
        i18n: {
            en: {
                what: 'Scores from 0 to 100 the combination of off-exchange volume above its normal (volume percentile up) with a below-normal short share of that volume (short percentile down). 70 and above reads as accumulation, 30 and below as distribution.',
                why: 'It separates quietly buying off the public book from quietly selling. Volume alone has no direction, and the short share alone is fooled by its structural half. Only overlaying the two gives a direction. This is a read on positioning, not a forecast.',
                guards: ['No verdict with fewer than 10 days of percentile history', 'ETFs excluded', 'Dates must match'],
            },
            ja: {
                what: '取引所外の出来高が平常より多く（出来高パーセンタイル↑）、そのうち空売り比率が平常より低い（空売りパーセンタイル↓）組み合わせを0〜100で点数化。70以上は買い集め、30以下は売り抜け。',
                why: '板の外で«買い集める»構図と«静かに売り抜ける»構図を区別します。出来高だけでは方向が分からず、空売りだけでは構造的な半分に惑わされます。両方を重ねて初めて方向が出ます。予測ではなく、ポジショニングの読み取りです。',
                guards: ['パーセンタイルの標本が10日未満なら判定しない', 'ETFは除外', '日付の一致を確認'],
            },
        },
    },
    // ── 세션 무관 ───────────────────────────────────────────────────────
    {
        id: 'insider-conviction', phase: 'anytime',
        name: { ko: '내부자 자신감 매집', en: 'Insider conviction buys', ja: 'インサイダーの本気買い' },
        what: '미국 시장 «전체» 내부자 신고에서 SEC 코드 P(장내 매수)만 골라, 한 종목에 들어간 금액을 합쳐 세운다. 보상·무상취득(A)·옵션행사(M)·세금납부(F)는 전부 제외한다.',
        why: '회사 사정을 가장 잘 아는 사람이 «자기 돈»으로 시장에서 산 것만 남긴다. 보상으로 받은 주식은 아무 말도 안 한다 — 실측 908건 중 절반 이상이 그런 것이었다. 그리고 이건 우리 유니버스 25종목이 아니라 시장 전체를 훑는 «발굴형»이라, 아무도 모르던 티커가 올라온다.',
        source: 'Intrinio insider_transaction_filings (전역)',
        guards: ['SEC 코드 P 만', '파생거래 제외', '주식수·단가 둘 다 있어야 함', '금액과 «지분 증가율»을 함께 표기(대주주가 금액으로만 이기지 않게)'],
        direction: 'deviation',
        sourcePublic: {
            ko: 'SEC Form 4 내부자 신고(시장 전체)',
            en: 'SEC Form 4 insider filings (entire market)',
            ja: 'SEC フォーム4のインサイダー届出（市場全体）',
        },
        i18n: {
            en: {
                what: 'From insider filings across the entire US market, only SEC transaction code P (open-market purchases) is kept, and the dollar amounts are summed per stock. Grants and awards (A), option exercises (M) and tax withholding (F) are all excluded.',
                why: 'It keeps only what the people who know the company best bought in the open market with their own money. Stock received as compensation says nothing — in our sample, more than half of 908 filings were exactly that. And because it scans the whole market rather than a fixed watchlist, it surfaces tickers nobody was watching.',
                guards: ['SEC code P only', 'Derivative transactions excluded', 'Both share count and price must be present', 'Shown with both the dollar amount and the percentage increase in holdings (so large holders cannot win on dollars alone)'],
            },
            ja: {
                what: '米国市場«全体»のインサイダー届出から、SEC取引コードP（市場内での買付）だけを選び、銘柄ごとの金額を合計して並べます。報酬・無償取得（A）、オプション行使（M）、納税のための処分（F）はすべて除外します。',
                why: '会社の事情を最もよく知る人が«自分のお金»で市場で買ったものだけを残します。報酬として受け取った株は何も語りません — 実測では908件のうち半分以上がそうでした。さらに、固定の監視銘柄ではなく市場全体を走査する«発掘型»なので、誰も注目していなかったティッカーが上がってきます。',
                guards: ['SECコードPのみ', 'デリバティブ取引は除外', '株数と単価の両方が必要', '金額と«持分の増加率»を併記（大株主が金額だけで上位に来ないように）'],
            },
        },
    },
    {
        id: 'deep-value-fcf', phase: 'anytime',
        name: { ko: '현금창출 대비 저평가', en: 'Cash-rich but cheap', ja: 'キャッシュ創出に対し割安' },
        what: '잉여현금흐름 수익률(FCF ÷ 시가총액)이 높으면서, EV/EBITDA 가 유니버스 중앙값보다 40% 이상 싸고, 장기부채/자기자본이 0.8 이하인 종목.',
        why: '차트가 아니라 «돈»으로 보는 축이다. 현금은 미친 듯이 버는데 주가만 빠진 종목을 찾는다. 다른 랭킹이 전부 옵션·수급이라 단기 트레이더용인데, 이건 스윙·가치 투자자에게 걸린다 — 시청자층이 다르다.',
        source: 'Intrinio fundamentals → standardized_financials + marketcap',
        guards: ['업종 평균이 아니라 «유니버스 중앙값» 대비다 — 업종 매핑이 없으므로 그렇게 라벨한다', '부채비율 게이트', '세 값 중 하나라도 없으면 제외(추정하지 않는다)'],
        direction: 'deviation',
        sourcePublic: {
            ko: '기업 재무제표(표준화 재무) + 시가총액',
            en: 'Company financial statements (standardized) plus market cap',
            ja: '企業の財務諸表（標準化）＋時価総額',
        },
        i18n: {
            en: {
                what: 'Stocks with a high free-cash-flow yield (FCF ÷ market cap) whose EV/EBITDA is at least 40% below the universe median and whose long-term debt-to-equity is 0.8 or less.',
                why: 'This axis looks at cash, not charts: companies generating strong cash whose share price has fallen anyway. Every other ranking here is about options and flows, built for short-term traders; this one speaks to swing and value investors — a different audience.',
                guards: ['Compared with the universe median, not a sector average — there is no sector mapping, so it is labeled that way', 'Debt-ratio gate', 'Excluded if any of the three values is missing (nothing is estimated)'],
            },
            ja: {
                what: 'フリーキャッシュフロー利回り（FCF÷時価総額）が高く、EV/EBITDAがユニバースの中央値より40%以上割安で、長期負債／自己資本が0.8以下の銘柄。',
                why: 'チャートではなく«お金»で見る軸です。現金はしっかり稼いでいるのに株価だけが下がった銘柄を探します。他のランキングはすべてオプション・需給で短期トレーダー向けですが、これはスイング・バリュー投資家向けです — 見る人が違います。',
                guards: ['業種平均ではなく«ユニバースの中央値»との比較 — 業種の対応表がないため、そう表示しています', '負債比率のゲート', '3つの値のうち1つでも欠けていれば除外（推定はしない）'],
            },
        },
    },
    {
        id: 'volatility-bet', phase: 'postclose',
        name: { ko: '조용한데 비싸진 옵션', en: 'Priced, no catalyst', ja: '材料なしで高くなったオプション' },
        what: 'ATM 내재변동성이 그 종목 자신의 이력에서 상위 백분위(IV 세션 백분위)인데, 실적 일정이 14일 이내에 «없는» 종목. IV 세션 백분위가 높은 순.',
        why: '시장이 움직임에 값을 치르고 있다는 뜻인데, 그 이유가 달력에 없다. ⚠️ 대형주 IV 급등의 대부분은 예정된 실적이다 — 그것만 뽑으면 무료 실적 달력을 다시 말하는 것이고 우위가 없다. 그래서 «아는 것(실적)»을 빼고 남는 것만 본다. 실적이 아니라면 FDA·M&A·소송·가이던스 같은 비정형 사건이다.',
        source: 'DynamoDB signum-gex-history(atmIv) + 실적일: FMP 실적 캘린더(공용 규칙 lib/earningsDate · 없으면 signum-pattern-db EARNINGS:)',
        guards: ['실적 D-14 이내 제외(이게 이 랭킹의 핵심이다)', 'IV 세션 백분위는 그 종목 자신의 이력 백분위 — 절대 IV 가 아니다', '이력이 20세션 미만이면 랭킹을 내지 않고 진행률만 보고한다'],
        direction: 'deviation',
        requires: {
            field: 'atmIv', sessions: 20, source: 'gex',
            why: 'IV 세션 백분위는 그 종목 IV 이력의 백분위다. 2026-09-01 에 생산자 버그(implied_volatility 를 greeks 안에서 찾던 것)를 고쳐 그날부터 쌓기 시작했으므로, 약 4주 뒤 켜진다.',
        },
        sourcePublic: {
            ko: '옵션 체인 ATM 내재변동성 이력 + 실적 일정',
            en: 'At-the-money implied volatility history from the options chain, plus the earnings calendar',
            ja: 'オプションチェーンのATMインプライド・ボラティリティ履歴＋決算カレンダー',
        },
        i18n: {
            en: {
                what: 'Stocks whose at-the-money implied volatility sits in a high percentile of their own history (IV session percentile) while no earnings date falls within the next 14 days. Highest IV session percentile first.',
                why: 'The market is paying up for a move, yet the reason is not on the calendar. ⚠️ Most IV spikes in large caps are scheduled earnings — ranking those would just repeat a free earnings calendar, with no edge. So we remove what is known (earnings) and look only at what is left. If it is not earnings, it tends to be an unscheduled event: FDA decisions, M&A, litigation or guidance.',
                guards: ['Names with earnings within 14 days are excluded (the core of this ranking)', 'IV session percentile is a percentile of the stock’s own IV history — not absolute IV', 'With fewer than 20 sessions of history, no ranking is published — only progress is reported'],
            },
            ja: {
                what: 'ATMのインプライド・ボラティリティがその銘柄自身の履歴の上位パーセンタイル（IVセッション百分位）にあるのに、14日以内に決算予定が«ない»銘柄。IVセッション百分位が高い順。',
                why: '市場が値動きに対価を払っているのに、その理由がカレンダーにありません。⚠️ 大型株のIV急上昇の大半は予定された決算です — それだけを拾えば無料の決算カレンダーを言い直すだけで、優位性はありません。そこで«分かっていること（決算）»を除き、残ったものだけを見ます。決算でなければ、FDA・M&A・訴訟・ガイダンスのような予定外の出来事です。',
                guards: ['決算まで14日以内の銘柄は除外（このランキングの核心）', 'IVセッション百分位はその銘柄自身のIV履歴のパーセンタイル — 絶対値のIVではない', '履歴が20セッション未満ならランキングを出さず、進捗だけを報告する'],
            },
        },
    },
];

export const byId = (id: string) => RANKINGS.find((r) => r.id === id) || null;
