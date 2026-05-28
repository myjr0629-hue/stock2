// ============================================================================
// Marketing V2 — Health Check
// 전체 마케팅 시스템 상태를 한눈에 확인
// ============================================================================

import { NextResponse } from 'next/server';
import { loadContentPackage, getETDate } from '@/lib/marketing-v2/core/store';
import { getChannelSummary, getAllActiveChannels } from '@/lib/marketing-v2/core/channels';
import type { ContentSlot } from '@/lib/marketing-v2/core/types';

export const dynamic = 'force-dynamic';

const SLOTS: ContentSlot[] = ['close', 'morning', 'spacex', 'education', 'pulse', 'spotlight'];

export async function GET() {
  const date = getETDate();

  // Check each slot
  const slotStatus: Record<string, any> = {};
  for (const slot of SLOTS) {
    const pkg = await loadContentPackage(slot, date);
    slotStatus[slot] = pkg ? {
      ready: true,
      preparedAt: pkg.preparedAt,
      images: Object.keys(pkg.images).length,
      langs: Object.keys(pkg.text).length,
    } : { ready: false };
  }

  // Channel status
  const channels = getAllActiveChannels();

  // EC2 status
  let ec2Status = 'unknown';
  try {
    const res = await fetch('https://ws.signumhq.com/capture-health', { signal: AbortSignal.timeout(5000) });
    ec2Status = res.ok ? 'healthy' : `error:${res.status}`;
  } catch { ec2Status = 'unreachable'; }

  return NextResponse.json({
    system: 'Marketing V2',
    date,
    timestamp: new Date().toISOString(),
    channels: {
      summary: getChannelSummary(),
      activeCount: channels.length,
    },
    ec2: ec2Status,
    slots: slotStatus,
    endpoints: {
      prepare: '/api/marketing/prepare?type={slot}',
      send: '/api/marketing/send?platform={platform}&slot={slot}&dry_run=false',
      health: '/api/marketing/health',
    },
  });
}
