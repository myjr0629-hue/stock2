import { giftStore } from './server';
import { BUMP_LUA, validEvent, funnelKey, field, kstDay } from './funnel.cjs';

/** after()에서 호출. 선물 Upstash 저장소와 동일 접두사, 45일 보존. */
export async function bumpGiftFunnel(stage: string, surface: string, platform: string, detail = 'all', day = kstDay()): Promise<void> {
  if (!validEvent(stage, surface, platform, detail) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
  try {
    await giftStore()?.eval(BUMP_LUA, [funnelKey(day, process.env.VERCEL_ENV === 'production')], [field(stage, surface, platform, detail), 45 * 86400]);
  } catch { /* 계측 실패가 응답·배정을 바꾸지 않는다 */ }
}
