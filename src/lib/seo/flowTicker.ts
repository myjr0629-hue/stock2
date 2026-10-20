/** Public flow pages and their UC data endpoint use the same symbol contract.
 * Class shares retain the dot used by structure snapshots and Intrinio.
 */
const FLOW_TICKER_RE = /^(?:[A-Z]{1,6}|[A-Z]{1,5}\.[A-Z])$/;

export function isFlowTicker(ticker: string): boolean {
  return FLOW_TICKER_RE.test(ticker) && ticker !== 'NULL';
}
