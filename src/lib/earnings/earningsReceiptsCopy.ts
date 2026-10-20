import type { Loc } from '../earningsWeek';
import type { ReceiptIssue, ReceiptProvenance, EarningsReceipts } from './earningsReceipts';

interface ReceiptCopy {
  title: string; description: string; week: string; show: string; languages: string;
  columns: [string, string, string, string, string];
  hour: { bmo: string; amc: string; '': string };
  provenance: Record<ReceiptProvenance, string>;
  issues: Record<ReceiptIssue, string>;
  noRecord: string; captured: string; session: string; expiry: string; source: string;
  calculated: string; price: string; within: string; outside: string; notCompared: string;
  fmp: string; single: string; provisional: string; method: string; methods: string[];
  summary: (s: EarningsReceipts['summary']) => string;
  summaryLabels: Record<keyof EarningsReceipts['summary'], string>;
  details: string;
}

export const RECEIPT_COPY: Record<Loc, ReceiptCopy> = {
  ko: {
    title: '실적 검증 영수증',
    description: '옵션 예상 변동폭의 사전 기록, 발표 후 종가 반응, 누락과 사후 보강을 함께 확인합니다.',
    week: '주 선택 (미국 동부 월요일)', show: '보기', languages: '언어',
    columns: ['종목 · 발표 (ET)', '옵션 예상 변동폭', '발표 후 실제 반응', '범위 비교', '기록 구분 · 누락 이유'],
    hour: { bmo: '장전 · 정확한 시각 미공지', amc: '장후 · 정확한 시각 미공지', '': '발표 시각 미공지' },
    provenance: { pre: '발표 전 기록', backfilled: '사후 보강', unverified: '사전 시점 확인 불가', missing: '기록 없음' },
    issues: {
      unavailable: '저장소 읽기 실패', no_schedule: '이 주의 확정 일정이 등록되어 있지 않음',
      no_record: '저장 기록 미보관·120일 보관 만료·저장소 응답 불가를 구분할 수 없음',
      invalid_record: '저장 형식 또는 종목·날짜·발표 구분 불일치', unknown_hour: '발표 시각 구분이 없어 반응 기간을 정할 수 없음',
      no_expected: '유효한 예상폭 기록 없음', invalid_expected: '예상폭의 세션·만기·출처·관측 시각을 검증할 수 없음',
      no_actual: '유효한 발표 후 종가 기록 없음', pending_actual: '반응일 정규장 종가 확정 대기',
      invalid_actual: '종가·변동률·평가 기간·계산 시각 불일치',
    },
    noRecord: '기록 없음', captured: '관측·저장 capturedAt (UTC)', session: '옵션 세션 (ET)', expiry: '옵션 만기', source: '회사 일정 근거',
    calculated: '실제 계산 시각 (UTC)', price: '정규장 종가 (USD)', within: '범위 안', outside: '범위 밖', notCompared: '비교 불가',
    fmp: 'Intrinio · FMP 종가 대조 일치', single: 'Intrinio 단독 · 독립 대조 없음', provisional: '참고 비교 · 사전 기록 집계 제외',
    method: '방법과 한계',
    methods: [
      '대상은 회사 공지 기반 CONFIRMED_EARNINGS 목록에 등록된 해당 주의 전체 종목입니다. 미국 시장 전체가 아니며, 목록은 나중에 추가·정정될 수 있습니다. 누락 행도 남깁니다.',
      '예상폭은 ATM 콜·풋 스트래들 가격 ÷ 현물 가격입니다. ±%는 옵션 만기까지의 시장 가격 반영폭이며 SIGNUM의 예측이나 수익률이 아닙니다.',
      'capturedAt은 저장 시각입니다. 정확한 발표시각 이전에 저장된 값만 사전으로 인정합니다. 시각 미공지 시 장전은 발표일 00:00 ET 이전, 장후는 정규장 마감 이전만 인정하므로 일부 실제 사전 기록도 확인 불가로 남습니다.',
      'EOD 체인 복원(src=eod-chain)과 발표 후 저장된 값은 사후 보강으로 표시합니다. 발표 당일 시점이 불분명한 값은 확인 불가입니다. 이 두 구분은 사전 기록 집계에서 제외하며 행의 범위 비교는 참고용입니다.',
      '실제 반응은 장전 발표: 직전 거래일 종가 → 발표일 종가, 장후 발표: 발표일 종가 → 다음 거래일 종가입니다. 반응일 마감 30분 뒤부터 확정으로 취급하며 시간외 가격은 쓰지 않습니다.',
      '예상폭은 만기까지, 실제는 한 거래일 반응으로 기간이 다릅니다. |실제| ≤ 예상이면 범위 안입니다. 안팎 개수는 투자 성과나 예측 정확도를 뜻하지 않습니다.',
      '저장 기록은 120일 보관되며 영구 불변 장부가 아닙니다. 수동 보강·가격 정정·덮어쓰기가 가능하고 과거 수정 이력 전체는 제공하지 않습니다. FMP 대조 일치 허용 오차는 0.1%입니다. 자료가 없으면 0%로 대체하지 않습니다.',
    ],
    summary: (s) => `확정 일정 ${s.total}건 · 사전 비교 ${s.pre}건 (안 ${s.within} · 밖 ${s.outside}) · 사후 보강 ${s.backfilled}건 · 시점 확인 불가 ${s.unverified}건 · 비교 자료 누락 ${s.missing}건`,
    summaryLabels: { total: '확정 일정', pre: '사전 비교', within: '사전 비교 · 범위 안', outside: '사전 비교 · 범위 밖', backfilled: '사후 보강', unverified: '시점 확인 불가', missing: '비교 자료 누락' },
    details: '상세 기록',
  },
  en: {
    title: 'Earnings verification receipts',
    description: 'Inspect recorded options-implied ranges, post-announcement closing reactions, missing data and later reconstructions.',
    week: 'Week (New York Monday)', show: 'View', languages: 'Language',
    columns: ['Stock · release (ET)', 'Options-implied range', 'Actual reaction', 'Range comparison', 'Record status · missing data'],
    hour: { bmo: 'Before open · exact time not announced', amc: 'After close · exact time not announced', '': 'Release timing not announced' },
    provenance: { pre: 'Pre-announcement record', backfilled: 'Later reconstruction', unverified: 'Pre-announcement timing unverified', missing: 'No record' },
    issues: {
      unavailable: 'Storage read failed', no_schedule: 'No confirmed announcements registered for this week',
      no_record: 'Cannot distinguish unrecorded data, expired 120-day retention, or unavailable storage',
      invalid_record: 'Invalid record or mismatched symbol, date or release timing', unknown_hour: 'Unknown release timing prevents a reaction window',
      no_expected: 'No valid implied-range record', invalid_expected: 'Cannot verify option session, expiry, source or capture time',
      no_actual: 'No valid post-announcement closing record', pending_actual: 'Waiting for the reaction session close to become final',
      invalid_actual: 'Closing prices, percentage, reaction window or calculation time do not match',
    },
    noRecord: 'No record', captured: 'Observed/stored capturedAt (UTC)', session: 'Option session (ET)', expiry: 'Option expiry', source: 'Company schedule source',
    calculated: 'Actual calculated (UTC)', price: 'Regular-session close (USD)', within: 'Within range', outside: 'Outside range', notCompared: 'Not comparable',
    fmp: 'Intrinio · both closes checked against FMP', single: 'Intrinio only · no independent check', provisional: 'Reference comparison · excluded from pre-announcement counts',
    method: 'Method and limitations',
    methods: [
      'The universe is every announcement registered in CONFIRMED_EARNINGS for this week, based on company announcements. It is not the whole US market. The list may be expanded or corrected later. Missing rows remain visible.',
      'The implied range is the ATM call-plus-put straddle price divided by spot. ±% reflects option pricing through expiry, rather than a SIGNUM forecast or return.',
      'capturedAt is the storage timestamp. Only captures before the known release time qualify as pre-announcement. Without an exact time, we require before 00:00 ET on BMO release day, or before the regular close for AMC. This conservative rule can leave genuine earlier records unverified.',
      'EOD-chain reconstructions (src=eod-chain) and records stored after release are labeled as later reconstructions. Ambiguous same-day captures remain unverified. Both are excluded from pre-announcement counts; their row comparisons are for reference.',
      'BMO reaction: previous trading close to release-day close. AMC: release-day close to next trading close. Daily bars become final 30 minutes after the reaction session closes. Extended-hours prices are excluded.',
      'The implied range extends through option expiry; the actual reaction covers one session. The horizons differ. |Actual| ≤ implied is within range. Counts do not measure investment performance or prediction accuracy.',
      'Records have 120-day retention and are not an immutable ledger. Manual reconstruction, price corrections and overwrites are possible; complete revision history is unavailable. The FMP closing-price check uses 0.1% tolerance. Missing data is never replaced with 0%.',
    ],
    summary: (s) => `${s.total} scheduled · ${s.pre} pre-announcement pairs (${s.within} within · ${s.outside} outside) · ${s.backfilled} later reconstructions · ${s.unverified} unverified timing · ${s.missing} missing comparisons`,
    summaryLabels: { total: 'Scheduled', pre: 'Pre-announcement pairs', within: 'Pre-announcement · within range', outside: 'Pre-announcement · outside range', backfilled: 'Later reconstructions', unverified: 'Unverified timing', missing: 'Missing comparisons' },
    details: 'Record details',
  },
  ja: {
    title: '決算検証レシート',
    description: 'オプション予想変動幅の事前記録、発表後の終値反応、欠損と事後補完を確認できます。',
    week: '週を選択（米国東部の月曜日）', show: '表示', languages: '言語',
    columns: ['銘柄・発表（ET）', 'オプション予想変動幅', '発表後の実際の反応', '範囲比較', '記録区分・欠損理由'],
    hour: { bmo: '寄り付き前・正確な時刻は未公表', amc: '引け後・正確な時刻は未公表', '': '発表時刻は未公表' },
    provenance: { pre: '発表前の記録', backfilled: '事後補完', unverified: '事前時点を確認できず', missing: '記録なし' },
    issues: {
      unavailable: '保存先の読み取り失敗', no_schedule: 'この週の確定日程が未登録',
      no_record: '未保存・120日保存期限切れ・保存先の応答不可を区別できません',
      invalid_record: '保存形式または銘柄・日付・発表区分の不一致', unknown_hour: '発表区分がなく反応期間を特定できません',
      no_expected: '有効な予想幅記録なし', invalid_expected: 'セッション・満期・出所・取得時刻を検証できません',
      no_actual: '有効な発表後の終値記録なし', pending_actual: '反応日の終値確定待ち',
      invalid_actual: '終値・変動率・評価期間・計算時刻の不一致',
    },
    noRecord: '記録なし', captured: '観測・保存 capturedAt（UTC）', session: 'オプションセッション（ET）', expiry: 'オプション満期', source: '企業の日程根拠',
    calculated: '実際の計算時刻（UTC）', price: '通常取引終値（USD）', within: '範囲内', outside: '範囲外', notCompared: '比較不可',
    fmp: 'Intrinio・両終値をFMPと照合', single: 'Intrinio単独・独立照合なし', provisional: '参考比較・事前記録の集計対象外',
    method: '方法と限界',
    methods: [
      '対象は企業発表に基づくCONFIRMED_EARNINGSに登録された当該週の全銘柄です。米国市場全体ではなく、一覧は後から追加・訂正される場合があります。欠損行も表示します。',
      '予想幅はATMコール・プットのストラドル価格÷現物価格です。±%は満期までの市場価格の織り込みで、SIGNUMの予測や収益率ではありません。',
      'capturedAtは保存時刻です。公表された発表時刻より前の保存のみ事前と認定します。正確な時刻がなければ、寄り付き前の発表は当日00:00 ETより前、引け後の発表は通常取引終了より前に限定するため、実際の事前記録でも確認不可となる場合があります。',
      'EODチェーンの復元（src=eod-chain）と発表後の保存は事後補完です。当日の前後関係が不明なら確認不可です。両区分は事前記録の集計から除外し、各行の比較は参考として表示します。',
      '実際の反応は寄り付き前発表：前営業日終値→発表日終値、引け後発表：発表日終値→翌営業日終値です。反応日の引け30分後から確定とみなし、時間外価格は使いません。',
      '予想幅は満期まで、実際は1セッションの反応で期間が異なります。|実際|≤予想なら範囲内です。件数は投資成績や予測精度を意味しません。',
      '保存期間は120日で、不変の永久台帳ではありません。手動補完・価格訂正・上書きが可能で、全修正履歴は提供していません。FMP終値照合の許容誤差は0.1%です。欠損を0%に置き換えません。',
    ],
    summary: (s) => `確定日程${s.total}件・事前比較${s.pre}件（内${s.within}・外${s.outside}）・事後補完${s.backfilled}件・時点確認不可${s.unverified}件・比較資料欠損${s.missing}件`,
    summaryLabels: { total: '確定日程', pre: '事前比較', within: '事前比較・範囲内', outside: '事前比較・範囲外', backfilled: '事後補完', unverified: '時点確認不可', missing: '比較資料欠損' },
    details: '記録の詳細',
  },
};
