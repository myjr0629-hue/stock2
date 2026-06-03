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

export function evaluateCircuitBreaker(
  currentNAV: number,
  highWaterMark: number,
  dailyStartNAV: number,
  positions: Array<{ ticker: string; costBasis: number; currentValue: number }>,
  config: CircuitBreakerConfig = DEFAULT_CONFIG
): CircuitBreakerResult {
  const actions: CircuitBreakerAction[] = [];
  let level = 'NONE' as string;
  const messages: string[] = [];

  // 1. Check individual position losses
  for (const pos of positions) {
    if (pos.costBasis <= 0) continue;

    const positionPnlPct = ((pos.currentValue - pos.costBasis) / pos.costBasis) * 100;

    if (positionPnlPct <= config.positionLossLimitPct) {
      actions.push({
        type: 'LIQUIDATE_POSITION',
        ticker: pos.ticker,
        reason: `${pos.ticker} position loss ${positionPnlPct.toFixed(1)}% exceeds limit of ${config.positionLossLimitPct}%`,
      });
      messages.push(`${pos.ticker} hit position loss limit (${positionPnlPct.toFixed(1)}%)`);

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
        reason: `Daily P&L ${dailyPnlPct.toFixed(1)}% exceeds limit of ${config.dailyLossLimitPct}%`,
      });
      messages.push(`Daily loss limit breached (${dailyPnlPct.toFixed(1)}%)`);

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
        reason: `Portfolio drawdown ${drawdownPct.toFixed(1)}% exceeds max drawdown limit of ${config.maxDrawdownPct}%`,
      });
      actions.push({
        type: 'INCREASE_CASH',
        reason: `Defensive cash raise triggered by ${drawdownPct.toFixed(1)}% drawdown`,
      });
      messages.push(`Max drawdown breached (${drawdownPct.toFixed(1)}%)`);
      level = 'HALT';
    }
  }

  const triggered = actions.length > 0;
  const message = triggered
    ? `Circuit breaker ${level}: ${messages.join('; ')}`
    : 'All risk parameters within normal range';

  return { triggered, level: level as CircuitBreakerResult['level'], message, actions };
}
