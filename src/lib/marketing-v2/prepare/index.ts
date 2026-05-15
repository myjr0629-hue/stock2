// ============================================================================
// Marketing V2 — Prepare Registry
// 모든 prepare 함수를 한 곳에서 export
// ============================================================================

export { prepareClose } from './close';
export { prepareMorning } from './morning';
export { prepareSpacex } from './spacex';
export { prepareEducation } from './education';
export { preparePulse } from './pulse';
export { prepareSpotlight } from './spotlight';
export { prepareEvent } from './event';

import { ContentSlot, ContentPackage } from '../core/types';
import { prepareClose } from './close';
import { prepareMorning } from './morning';
import { prepareSpacex } from './spacex';
import { prepareEducation } from './education';
import { preparePulse } from './pulse';
import { prepareSpotlight } from './spotlight';
import { prepareEvent } from './event';

type PrepareOpts = { date?: string; dryRun?: boolean; topic?: string; ticker?: string };

const PREPARE_MAP: Record<string, (opts: PrepareOpts) => Promise<ContentPackage>> = {
  close: prepareClose,
  morning: prepareMorning,
  spacex: prepareSpacex,
  education: prepareEducation,
  pulse: preparePulse,
  spotlight: prepareSpotlight,
  event: prepareEvent,
};

/**
 * 슬롯 이름으로 prepare 실행
 */
export async function runPrepare(slot: ContentSlot, opts: PrepareOpts = {}): Promise<ContentPackage> {
  const fn = PREPARE_MAP[slot];
  if (!fn) throw new Error(`Unknown prepare slot: ${slot}`);
  return fn(opts);
}
