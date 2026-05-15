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

// ── Dedup Lock (send에서 호출 — 중복 발행 완벽 차단) ──
// ★ Threads 블록 방지: Redis 에러 시에도 발송 차단 (안전한 방향)
// ★ Upstash SET NX (atomic) 사용 → race condition 제거
// ★ TTL 24시간 → 같은 날 재발행 100% 차단
export async function acquireLock(slot: ContentSlot, platform: string, date: string): Promise<boolean> {
  const key = makeLockKey(slot, platform, date);
  try {
    // Upstash setnx: atomic — 이미 존재하면 false 반환
    const { Redis } = await import('@upstash/redis');
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!url || !token) {
      console.error(`[MktV2/Lock] ❌ No Redis credentials — BLOCKING send for safety`);
      return false;
    }
    const redis = new Redis({ url, token });
    
    // SET key value NX EX 86400 — atomic: 키 없으면 'OK', 있으면 null
    const result = await redis.set(key, new Date().toISOString(), { nx: true, ex: 86400 });
    
    if (result) {
      console.log(`[MktV2/Lock] ✅ Lock acquired: ${key}`);
      return true;
    } else {
      console.warn(`[MktV2/Lock] 🚫 DUPLICATE blocked: ${key} — already sent today`);
      return false;
    }
  } catch (err: any) {
    // ★ Redis 에러 시 발송 차단 (이전: 발송 허용 → 중복 위험)
    console.error(`[MktV2/Lock] ❌ Redis error — BLOCKING send for safety: ${err.message}`);
    return false;
  }
}

// ── 현재 ET 날짜 (content key 기준) ──
export function getETDate(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}
