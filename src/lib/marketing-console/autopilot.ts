// ============================================================================
// Autopilot — the quality-gated automation engine. Picks the most post-worthy
// ticker, generates GROUNDED drafts (numbers only from real options structure),
// runs every §6 safety gate, then acts per channel mode:
//   shadow → Buffer DRAFT (human still publishes)   live → actually publish
// Hardcoded caps / ≥90-min interval / skeleton dedup / deadman / killswitch make
// the 2026-07 "1000-post spray" structurally impossible even in live mode.
// Bedrock import (via generate) → any route calling this MUST set maxDuration=60.
// ============================================================================

import {
  X_CHANNELS, DAILY_CAP, ST_TICKERS,
  getKillSwitch, getVolume, bumpVolume,
  isDuplicateSkeleton, recordSkeleton, appendAudit,
  getAutoModes, getLastAutoPost, markAutoPost, MIN_INTERVAL_MS,
  deadmanTripped, recordGateResult,
  marketSession, jpSession,
  type AutoMode, type AutoChannel,
} from './mkt';
import { fetchStructure, extractLevels, type Levels } from './xScan';
import { generateDrafts, type Channel as GenChannel } from './generate';
import { createPost } from '@/lib/marketing/bufferClient';
import { bskyPost } from './bluesky';

// Verified Buffer channel IDs (BUFFER_OPS §1).
const BUFFER_CH: Record<string, string> = {
  'x-us': '6a518928404834462892924a',
  'x-jp': '6a53936480cc80cdcaa625d0',
  bluesky: '69ca84bbaf47dacb696d9d0f',
};

export interface TickerPick { ticker: string; reason: string; notability: number; levels: Levels }

// Scan the watchlist, rank by how notable the options structure is right now
// (max-pain gap % is the strongest "the chart doesn't show it" hook; gamma-flip
// proximity adds tension). Same scoring the console's /generate/suggest uses.
export async function pickBestTicker(): Promise<TickerPick | null> {
  const scored = await Promise.all(
    ST_TICKERS.map(async (ticker): Promise<TickerPick | null> => {
      const lv = extractLevels(await fetchStructure(ticker));
      if (!lv || typeof lv.price !== 'number' || lv.price <= 0) return null;
      const price = lv.price;
      const maxPainGap = typeof lv.maxPain === 'number' ? Math.abs(price - lv.maxPain) / price : 0;
      const flipGap = typeof lv.gammaFlip === 'number' ? Math.abs(price - lv.gammaFlip) / price : 0;
      const notability = maxPainGap * 100 + (flipGap < 0.01 ? 3 : 0);
      const reason =
        maxPainGap >= 0.03 ? `맥스페인 ${(maxPainGap * 100).toFixed(1)}% 괴리`
          : flipGap < 0.01 ? '감마플립 근접(긴장)'
            : '구조 관찰';
      return { ticker, reason, notability, levels: lv };
    })
  );
  const ranked = scored
    .filter((x): x is TickerPick => x !== null)
    .sort((a, b) => b.notability - a.notability);
  return ranked[0] || null;
}

export interface AutoResult {
  channel: string;
  mode: AutoMode;
  action: 'published' | 'drafted' | 'skip' | 'block' | 'fail' | 'halt';
  ok: boolean;
  detail?: string;
}

interface ChannelPlan {
  ch: Extract<AutoChannel, 'x-us' | 'x-jp' | 'bluesky-post'>;
  volKey: string;
  draftKey: GenChannel;
  bufferId: string;
  good: boolean; // is now a high-value posting window for this channel?
  bluesky?: boolean;
}

/**
 * Run one autopilot tick for ORIGINAL posts (x-us / x-jp / bluesky-post).
 * Posts at most one item per eligible channel; every gate can veto. Replies are
 * a separate engine. Returns a per-channel action log (also written to audit).
 */
export async function runAutopilotOriginals(): Promise<AutoResult[]> {
  // Defense in depth — killswitch and deadman halt everything first.
  if (await getKillSwitch()) {
    return [{ channel: '*', mode: 'off', action: 'halt', ok: false, detail: '킬스위치 ON — 전체 정지' }];
  }
  const dm = await deadmanTripped();
  if (dm.tripped) {
    return [{ channel: '*', mode: 'off', action: 'halt', ok: false, detail: `데드맨 정지: ${dm.reason}` }];
  }

  const modes = await getAutoModes();
  const jp = jpSession();
  const us = marketSession();
  const plan: ChannelPlan[] = [
    { ch: 'x-us', volKey: X_CHANNELS.en, draftKey: 'x_en', bufferId: BUFFER_CH['x-us'], good: us.goodToPost },
    { ch: 'x-jp', volKey: X_CHANNELS.ja, draftKey: 'x_ja', bufferId: BUFFER_CH['x-jp'], good: jp.goodToPost },
    { ch: 'bluesky-post', volKey: X_CHANNELS.bsky, draftKey: 'x_en', bufferId: BUFFER_CH.bluesky, good: true, bluesky: true },
  ];

  // Only spend a Bedrock generation if at least one channel is active AND eligible
  // right now (mode≠off, in a good window, under cap, past the interval).
  const active: ChannelPlan[] = [];
  const out: AutoResult[] = [];
  for (const p of plan) {
    const mode = modes[p.ch];
    if (mode === 'off') continue;
    if (!p.good) { out.push({ channel: p.ch, mode, action: 'skip', ok: false, detail: '발행 시간대 아님' }); continue; }
    const vol = await getVolume(p.volKey);
    if (vol >= DAILY_CAP) { out.push({ channel: p.ch, mode, action: 'skip', ok: false, detail: `캡 ${vol}/${DAILY_CAP}` }); continue; }
    const since = Date.now() - (await getLastAutoPost(p.ch));
    if (since < MIN_INTERVAL_MS) { out.push({ channel: p.ch, mode, action: 'skip', ok: false, detail: `간격 미달 ${Math.round(since / 60000)}m<90m` }); continue; }
    active.push(p);
  }
  if (active.length === 0) {
    if (out.length === 0) out.push({ channel: '*', mode: 'off', action: 'skip', ok: false, detail: '활성 채널 없음' });
    return out;
  }

  const pick = await pickBestTicker();
  if (!pick) {
    out.push({ channel: '*', mode: 'off', action: 'skip', ok: false, detail: '적합 종목 없음(데이터 부족)' });
    return out;
  }
  const gen = await generateDrafts(pick.ticker, pick.reason);

  for (const p of active) {
    const mode = modes[p.ch];
    const draft = gen.drafts.find((d) => d.channel === p.draftKey);
    const text = (draft?.text || '').trim();

    // Grounded gate — no real levels or empty draft = block (counts toward deadman).
    if (!gen.grounded || !draft || !text) {
      await recordGateResult(false);
      out.push({ channel: p.ch, mode, action: 'block', ok: false, detail: 'grounded 실패/빈 초안' });
      continue;
    }
    // Quality/compliance lint (§6.1 items 1-2): links, emoji, metric count, prediction, buy/sell, length.
    if (!draft.lint.pass) {
      await recordGateResult(false);
      const failed = draft.lint.checks.filter((c) => !c.ok).map((c) => c.key).join(',');
      out.push({ channel: p.ch, mode, action: 'block', ok: false, detail: `린트 실패: ${failed}` });
      continue;
    }
    // Skeleton dedup (§6.1 item 4) — same template within 72h = the disaster's fingerprint.
    if (await isDuplicateSkeleton(text)) {
      out.push({ channel: p.ch, mode, action: 'block', ok: false, detail: '중복 구조 차단(72h)' });
      continue;
    }

    // All gates passed → act per mode.
    let ok = false;
    let detail = '';
    try {
      if (p.bluesky && mode === 'live') {
        const r = await bskyPost(text);
        ok = r.ok; detail = r.ok ? 'bluesky published' : (r.error || 'bsky 실패');
      } else {
        // X live/shadow AND bluesky shadow all go through Buffer (draft flag differs).
        // dryRun MUST be false or Buffer never actually receives the post.
        const r = await createPost({ channelIds: [p.bufferId], text, dryRun: false, draft: mode !== 'live' });
        ok = r.success; detail = r.success ? (mode === 'live' ? 'published' : 'draft 적재') : (r.error || 'buffer 실패');
      }
    } catch (e) {
      detail = (e as Error).message;
    }

    if (ok) {
      await bumpVolume(p.volKey);
      await recordSkeleton(text);
      await markAutoPost(p.ch);
      await recordGateResult(true);
      await appendAudit('autopilot', mode === 'live' ? 'auto-publish' : 'auto-draft', `${p.ch} $${pick.ticker} — ${detail}`);
      out.push({ channel: p.ch, mode, action: mode === 'live' ? 'published' : 'drafted', ok: true, detail: `$${pick.ticker}` });
    } else {
      out.push({ channel: p.ch, mode, action: 'fail', ok: false, detail });
    }
  }
  return out;
}
