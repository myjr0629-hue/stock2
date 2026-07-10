// ============================================================================
// WIM (Why'd It Move?) — cause bank: the 8 move-attribution categories.
// Per WIM_BUILD_BLUEPRINT §4. Every label in ko/en/ja, OBSERVER tone (what a
// cause IS — never advice/prediction). Distractors are drawn from `confusable`
// so wrong answers stay plausible (same "family" of causes).
// ============================================================================

export type Loc = { ko: string; en: string; ja: string };

export type CauseCategoryId =
  | 'own_earnings' | 'peer_sector_news' | 'analyst_action'   // L1 (beginner)
  | 'filing_8k' | 'sector_rotation' | 'macro'                // L2 (intermediate)
  | 'options_structure' | 'insti_flow';                      // L3 (institutional)

export interface CauseEntry {
  label: Loc;            // choice button text
  short: Loc;            // compact chip text
  level: 1 | 2 | 3;      // education depth
  confusable: CauseCategoryId[]; // best distractor companions
}

export const CAUSE_BANK: Record<CauseCategoryId, CauseEntry> = {
  own_earnings: {
    label: {
      ko: '회사 자체 소식 — 실적·가이던스·신제품 발표',
      en: 'Company news — earnings, guidance or a product announcement',
      ja: '会社自身のニュース — 決算・ガイダンス・新製品発表',
    },
    short: { ko: '회사 소식', en: 'Company news', ja: '会社ニュース' },
    level: 1,
    confusable: ['analyst_action', 'filing_8k', 'peer_sector_news'],
  },
  peer_sector_news: {
    label: {
      ko: '동종업계 파장 — 경쟁사·같은 업종 뉴스에 같이 움직임',
      en: 'Peer ripple — moved together with a competitor or its industry',
      ja: '同業の波及 — 競合や同業種のニュースに連動',
    },
    short: { ko: '동종업계', en: 'Peer ripple', ja: '同業波及' },
    level: 1,
    confusable: ['sector_rotation', 'own_earnings', 'macro'],
  },
  analyst_action: {
    label: {
      ko: '애널리스트 액션 — 등급·목표가 변경 리포트',
      en: 'Analyst action — a rating or price-target change',
      ja: 'アナリスト・アクション — 格付け/目標株価の変更',
    },
    short: { ko: '애널리스트', en: 'Analyst', ja: 'アナリスト' },
    level: 1,
    confusable: ['own_earnings', 'insti_flow', 'filing_8k'],
  },
  filing_8k: {
    label: {
      ko: '공시(8-K) — 회사가 SEC에 직접 신고한 사실',
      en: 'SEC filing (8-K) — something the company itself disclosed',
      ja: '開示(8-K) — 会社がSECに直接届け出た事実',
    },
    short: { ko: '공시', en: 'Filing', ja: '開示' },
    level: 2,
    confusable: ['own_earnings', 'analyst_action', 'insti_flow'],
  },
  sector_rotation: {
    label: {
      ko: '섹터 로테이션 — 업종 전체로 자금이 들어오거나 빠짐',
      en: 'Sector rotation — money flowing into or out of the whole sector',
      ja: 'セクターローテーション — 業種全体への資金流出入',
    },
    short: { ko: '섹터 자금', en: 'Rotation', ja: 'ローテーション' },
    level: 2,
    confusable: ['macro', 'peer_sector_news', 'insti_flow'],
  },
  macro: {
    label: {
      ko: '거시 변수 — 금리·지표·정책 등 시장 전체 요인',
      en: 'Macro — rates, economic data or policy moving the whole market',
      ja: 'マクロ要因 — 金利・指標・政策など市場全体の要因',
    },
    short: { ko: '거시', en: 'Macro', ja: 'マクロ' },
    level: 2,
    confusable: ['sector_rotation', 'peer_sector_news', 'options_structure'],
  },
  options_structure: {
    label: {
      ko: '옵션 구조 — 감마·만기 포지션이 가격을 증폭',
      en: 'Options structure — gamma/expiry positioning amplifying the move',
      ja: 'オプション構造 — ガンマ/満期ポジションが値動きを増幅',
    },
    short: { ko: '옵션 구조', en: 'Options', ja: 'オプション' },
    level: 3,
    confusable: ['insti_flow', 'macro', 'sector_rotation'],
  },
  insti_flow: {
    label: {
      ko: '기관 수급 — 대형 블록·다크풀 등 큰손의 매매 흔적',
      en: 'Institutional flow — big blocks / dark-pool footprints of large players',
      ja: '機関フロー — 大口ブロックやダークプールの足跡',
    },
    short: { ko: '기관 수급', en: 'Insti flow', ja: '機関フロー' },
    level: 3,
    confusable: ['options_structure', 'analyst_action', 'filing_8k'],
  },
};

export const CAUSE_IDS = Object.keys(CAUSE_BANK) as CauseCategoryId[];

// Deterministic distractor pick: correct's confusables first, then fill from the
// rest, seeded by (ticker+date) so the same unit always shows the same 4 choices.
export function pickChoices(correct: CauseCategoryId, seedStr: string): CauseCategoryId[] {
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
  const pool = [
    ...CAUSE_BANK[correct].confusable,
    ...CAUSE_IDS.filter((c) => c !== correct && !CAUSE_BANK[correct].confusable.includes(c)),
  ];
  const distractors = pool.slice(0, 3 + Math.floor(rand() * 2)).sort(() => rand() - 0.5).slice(0, 3);
  const all = [correct, ...distractors];
  // seeded shuffle so the correct answer position is stable per unit but varies across units
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}

export const DISCLAIMER: Loc = {
  ko: '교육용 시장 정보입니다. 투자 조언이 아니며 정확성을 보장하지 않습니다.',
  en: 'Educational market information only. Not investment advice; accuracy not guaranteed.',
  ja: '教育目的の市場情報です。投資助言ではなく、正確性は保証されません。',
};
