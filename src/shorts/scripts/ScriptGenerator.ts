// ============================================================================
// ScriptGenerator — Generate 7-act video scripts
// Uses Bedrock Haiku or templates. Interface-ready for AI generation.
// ============================================================================

import type { ScriptBeat, TickerStructure } from '../types';

/** Generate a Hidden Wall script from ticker data */
export function generateHiddenWallScript(ticker: TickerStructure): ScriptBeat[] {
  if (!ticker.callWall || !ticker.putFloor) {
    throw new Error(`Cannot generate Hidden Wall script: missing wall levels for ${ticker.ticker}`);
  }

  const distToCall = ((ticker.callWall - ticker.price) / ticker.price) * 100;
  const gexLabel = ticker.gexValue >= 0
    ? `positive $${(ticker.gexValue / 1e6).toFixed(0)} million`
    : `negative $${(Math.abs(ticker.gexValue) / 1e6).toFixed(0)} million`;

  return [
    {
      id: 'hook', label: 'hook', startSec: 0, endSec: 1.5,
      text: 'THE WALL IS NOT ON YOUR CHART.',
      emphasis: ['WALL', 'NOT'],
    },
    {
      id: 'curiosity', label: 'curiosity', startSec: 1.5, endSec: 4,
      text: 'Most traders only see price.',
      emphasis: ['only'],
    },
    {
      id: 'reveal', label: 'reveal', startSec: 4, endSec: 8,
      text: 'But options structure reveals hidden pressure zones that never appear on a chart.',
      emphasis: ['hidden', 'pressure zones'],
    },
    {
      id: 'data', label: 'data', startSec: 8, endSec: 14,
      text: `${ticker.ticker} is trading at $${ticker.price.toFixed(0)}. The call wall sits at $${ticker.callWall} — just ${distToCall.toFixed(1)}% away. Gamma exposure is ${gexLabel}.`,
      emphasis: [`$${ticker.callWall}`, `${distToCall.toFixed(1)}%`],
    },
    {
      id: 'metaphor', label: 'metaphor', startSec: 14, endSec: 23,
      text: `Price is approaching an invisible ceiling. The put floor at $${ticker.putFloor}${ticker.gammaFlipLevel ? ` and gamma flip at $${ticker.gammaFlipLevel}` : ''} create a pressure channel. This structure is not visible on any standard chart.`,
      emphasis: ['invisible ceiling', 'pressure channel'],
    },
    {
      id: 'meaning', label: 'meaning', startSec: 23, endSec: 31,
      text: 'This is not a directional prediction. It indicates where the market structure may become most sensitive to the next move.',
      emphasis: ['not a directional prediction', 'most sensitive'],
    },
    {
      id: 'product', label: 'product', startSec: 31, endSec: 38,
      text: 'SignumHQ tracks these hidden structural layers across 30 institutional-grade tickers. Every day.',
      emphasis: ['hidden structural layers', 'Every day'],
    },
    {
      id: 'cta', label: 'cta', startSec: 38, endSec: 42,
      text: 'See what others cannot.',
      emphasis: ['See', 'cannot'],
    },
  ];
}
