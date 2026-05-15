// ============================================================================
// Marketing V2 — Redis Store
// ContentPackage를 Redis에 저장/조회하는 단일 인터페이스
// 모든 prepare와 send가 이 파일만 통해 Redis에 접근
// ============================================================================

import { getFromCache, setInCache } from '@/services/redisClient';
import { ContentPackage, ContentSlot } from './types';

const TTL = 86400; // 24시간

// ── Redis key 규칙 ──
function makeKey(slot: ContentSlot, date: string): string {
  return `mktv2:${slot}:${date}`;
}

function makeLockKey(slot: ContentSlot, platform: string, date: string): string {
  return `mktv2:lock:${slot}:${platform}:${date}`;
}

// ── Store (prepare에서 호출) ──
export async function storeContentPackage(pkg: ContentPackage): Promise<void> {
  const key = makeKey(pkg.slot, pkg.date);
  await setInCache(key, JSON.stringify(pkg), TTL);
  console.log(`[MktV2/Store] Saved ${key} (${Object.keys(pkg.images).length} images, ${Object.keys(pkg.text).length} langs)`);
}

// ── Load (send에서 호출) ──
export async function loadContentPackage(slot: ContentSlot, date: string): Promise<ContentPackage | null> {
  const key = makeKey(slot, date);
  try {
    const raw = await getFromCache(key);
    if (!raw) return null;
    return typeof raw === 'string' ? JSON.parse(raw) : raw as ContentPackage;
  } catch (err: any) {
    console.error(`[MktV2/Store] Load failed for ${key}:`, err.message);
    return null;
  }
}

// ── Dedup Lock (send에서 호출 — Vercel 재시도 중복 방지) ──
export async function acquireLock(slot: ContentSlot, platform: string, date: string): Promise<boolean> {
  const key = makeLockKey(slot, platform, date);
  try {
    const existing = await getFromCache(key).catch(() => null);
    if (existing) {
      console.warn(`[MktV2/Lock] ${key} already sent, skipping`);
      return false;  // 이미 발송됨
    }
    await setInCache(key, new Date().toISOString(), 3600); // 1시간 TTL
    return true;  // 락 획득 성공
  } catch {
    return true;  // 락 체크 실패 시 발송 허용 (안전한 방향)
  }
}

// ── 현재 ET 날짜 (content key 기준) ──
export function getETDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}
