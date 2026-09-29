'use client';

// ============================================================================
// LevelValue — 옵션 레벨 칸 하나(앱 공용): 값 · «범위 밖» · «—»  [2026-09-30]
//
// 판정·글자는 lib/optionLevelGate 의 공용 함수(levelCellState·levelOutOfRangeText) 하나에서 나온다.
//   «범위 밖» = 판본은 있는데 정의상 값이 없다(얇은 체인 등) — 보조 글자색, 값과 같은 자리(줄 높이는 부모 그대로 → 카드 크기 불변).
//   «—»      = 판본이 아직 없다. 가림 빈칸(실패)과 «정의상 없음»을 화면에서 구분한다.
//   값 글자 기본 = «$» + formatLevelPrice(행사가를 반올림하지 않는다 — 337.5 는 «$337.5», 0.5 는 «$0.5»).
// ============================================================================

import type { CSSProperties } from 'react';
import { formatLevelPrice, levelCellState, levelOutOfRangeText, type LevelField, type LevelMeta } from '@/lib/optionLevelGate';

export function LevelValue({
  value,
  meta,
  field,
  locale,
  format = dollarLevel,
  dash = '—',
}: {
  value: unknown;
  meta: LevelMeta;
  field: LevelField;
  locale: string;
  /** 값 글자 — 생략하면 «$» + formatLevelPrice */
  format?: (n: number) => string;
  /** 판본이 없을 때의 글자 — 화면마다 쓰던 모양 그대로('—' · '$—' · '--') */
  dash?: string;
}) {
  const state = levelCellState(value, meta, field);
  if (state === 'value') return <>{format(Number(value))}</>;
  if (state === 'outOfRange') return <span style={OUT_OF_RANGE}>{levelOutOfRangeText(locale)}</span>;
  return <>{dash}</>;
}

const dollarLevel = (n: number) => `$${formatLevelPrice(n)}`;

// 값 글꼴보다 작게(카드 폭 안에 한 줄), 줄 높이 1 — 부모 줄 상자(값 글꼴 높이)를 넘지 않아 카드 크기가 그대로다.
const OUT_OF_RANGE: CSSProperties = {
  font: '700 12px/1 var(--f-sans)',
  color: 'var(--text-muted)',
  letterSpacing: 0,
  whiteSpace: 'nowrap',
};

export default LevelValue;
