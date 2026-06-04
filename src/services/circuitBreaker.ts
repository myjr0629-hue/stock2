export interface CircuitBreakerConfig {
  maxDrawdownPct: number;
  dailyLossLimitPct: number;
  positionLossLimitPct: number;
}

export interface CircuitBreakerAction {
  type: 'REDUCE_ALL' | 'LIQUIDATE_POSITION' | 'HALT_NEW_ORDERS' | 'INCREASE_CASH';
  ticker?: string;
  reason: string;
}

export interface CircuitBreakerResult {
  triggered: boolean;
  level: 'NONE' | 'CAUTION' | 'WARNING' | 'HALT';
  message: string;
  actions: CircuitBreakerAction[];
}

export const DEFAULT_CONFIG: CircuitBreakerConfig = {
  maxDrawdownPct: -8,
  dailyLossLimitPct: -3,
  positionLossLimitPct: -12,
};

const i18nMessages: Record<string, {
  positionLoss: (ticker: string, pct: string, limit: number) => string;
  dailyLoss: (pct: string, limit: number) => string;
  drawdown: (pct: string, limit: number) => string;
  cashRaise: (pct: string) => string;
  normal: string;
  circuitBreaker: (level: string, messages: string) => string;
}> = {
  ko: {
    positionLoss: (ticker, pct, limit) => `${ticker} 포지션 손실 ${pct}%가 한도 ${limit}% 초과`,
    dailyLoss: (pct, limit) => `일일 손익 ${pct}%가 일일 한도 ${limit}% 초과`,
    drawdown: (pct, limit) => `포트폴리오 낙폭 ${pct}%가 최대 허용 ${limit}% 초과`,
    cashRaise: (pct) => `낙폭 ${pct}%에 따른 방어적 현금 비중 확대 발동`,
    normal: '모든 리스크 지표가 정상 범위 내에 있습니다',
    circuitBreaker: (level, messages) => `서킷 브레이커 ${level}: ${messages}`,
  },
  ja: {
    positionLoss: (ticker, pct, limit) => `${ticker}ポジション損失${pct}%が制限${limit}%を超過`,
    dailyLoss: (pct, limit) => `日次損益${pct}%が制限${limit}%を超過`,
    drawdown: (pct, limit) => `ドローダウン${pct}%が最大制限${limit}%を超過`,
    cashRaise: (pct) => `${pct}%ドローダウンによる防御的キャッシュ引き上げ`,
    normal: '全リスク指標が正常範囲内',
    circuitBreaker: (level, messages) => `サーキットブレーカー${level}: ${messages}`,
  },
  en: {
    positionLoss: (ticker, pct, limit) => `${ticker} position loss ${pct}% exceeds limit of ${limit}%`,
    dailyLoss: (pct, limit) => `Daily P&L ${pct}% exceeds limit of ${limit}%`,
    drawdown: (pct, limit) => `Portfolio drawdown ${pct}% exceeds max drawdown limit of ${limit}%`,
    cashRaise: (pct) => `Defensive cash raise triggered by ${pct}% drawdown`,
    normal: 'All risk parameters within normal range',
    circuitBreaker: (level, messages) => `Circuit breaker ${level}: ${messages}`,
  },
};

export function evaluateCircuitBreaker(
  currentNAV: number,
  highWaterMark: number,
  dailyStartNAV: number,
  positions: Array<{ ticker: string; costBasis: number; currentValue: number }>,
  config: CircuitBreakerConfig = DEFAULT_CONFIG,
  locale: string = 'en'
): CircuitBreakerResult {
  const actions: CircuitBreakerAction[] = [];
  let level = 'NONE' as string;
  const messages: string[] = [];
  const t = i18nMessages[locale] || i18nMessages.en;

  // 1. Check individual position losses
  for (const pos of positions) {
    if (pos.costBasis <= 0) continue;

    const positionPnlPct = ((pos.currentValue - pos.costBasis) / pos.costBasis) * 100;

    if (positionPnlPct <= config.positionLossLimitPct) {
      actions.push({
        type: 'LIQUIDATE_POSITION',
        ticker: pos.ticker,
        reason: t.positionLoss(pos.ticker, positionPnlPct.toFixed(1), config.positionLossLimitPct),
      });
      messages.push(t.positionLoss(pos.ticker, positionPnlPct.toFixed(1), config.positionLossLimitPct));

      if (level !== 'WARNING' && level !== 'HALT') {
        level = 'WARNING';
      }
    }
  }

  // 2. Check daily P&L
  if (dailyStartNAV > 0) {
    const dailyPnlPct = ((currentNAV - dailyStartNAV) / dailyStartNAV) * 100;

    if (dailyPnlPct <= config.dailyLossLimitPct) {
      actions.push({
        type: 'HALT_NEW_ORDERS',
        reason: t.dailyLoss(dailyPnlPct.toFixed(1), config.dailyLossLimitPct),
      });
      messages.push(t.dailyLoss(dailyPnlPct.toFixed(1), config.dailyLossLimitPct));

      if (level !== 'HALT') {
        level = 'WARNING';
      }
    }
  }

  // 3. Check drawdown from high water mark
  if (highWaterMark > 0) {
    const drawdownPct = ((currentNAV - highWaterMark) / highWaterMark) * 100;

    if (drawdownPct <= config.maxDrawdownPct) {
      actions.push({
        type: 'REDUCE_ALL',
        reason: t.drawdown(drawdownPct.toFixed(1), config.maxDrawdownPct),
      });
      actions.push({
        type: 'INCREASE_CASH',
        reason: t.cashRaise(drawdownPct.toFixed(1)),
      });
      messages.push(t.drawdown(drawdownPct.toFixed(1), config.maxDrawdownPct));
      level = 'HALT';
    }
  }

  const triggered = actions.length > 0;
  const message = triggered
    ? t.circuitBreaker(level, messages.join('; '))
    : t.normal;

  return { triggered, level: level as CircuitBreakerResult['level'], message, actions };
}
