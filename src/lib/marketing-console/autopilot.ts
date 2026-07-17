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
  X_CHANNELS, DAILY_CAP, REPLY_CAP, ST_TICKERS,
  getKillSwitch, getVolume, bumpVolume, bumpVolumeCapped,
  isDuplicateSkeleton, recordSkeleton, appendAudit,
  getAutoModes, getLastAutoPost, markAutoPost, MIN_INTERVAL_MS,
  deadmanTripped, recordGateResult,
  getRepliedIds, markReplied,
  marketSession, jpSession,
  type AutoMode, type AutoChannel,
} from './mkt';
import { fetchStructure, extractLevels, type Levels, type ScanTweet } from './xScan';
import { generateDrafts, lint, type Channel as GenChannel } from './generate';
import { draftReply } from './xApi';
import { createPost } from '@/lib/marketing/bufferClient';
import { bskyPost, bskySearchTargets, bskyReply } from './bluesky';
import { getConnection, fetchInbox, postReply, type Acct } from './xOAuth';

// Verified Buffer channel IDs (BUFFER_OPS §1).
const BUFFER_CH: Record<string, string> = {
  'x-us': '6a518928404834462892924a',
  'x-jp': '6a53936480cc80cdcaa625d0',
  bluesky: '69ca84bbaf47dacb696d9d0f',
};

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.signumhq.com';

// Build the hosted level-ladder card URL (Buffer fetches it as the post image).
// Same /api/og/level card the console uses — grounded, no fabricated numbers.
function ogCardUrl(ticker: string, lv: Levels): string {
  const q = new URLSearchParams({ ticker });
  if (typeof lv.price === 'number') q.set('price', String(lv.price));
  if (typeof lv.maxPain === 'number') q.set('maxPain', String(lv.maxPain));
  if (typeof lv.gammaFlip === 'number') q.set('gammaFlip', String(lv.gammaFlip));
  if (typeof lv.callWall === 'number') q.set('callWall', String(lv.callWall));
  if (typeof lv.putFloor === 'number') q.set('putFloor', String(lv.putFloor));
  return `${SITE}/api/og/level?${q.toString()}`;
}

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
  const ogUrl = ogCardUrl(pick.ticker, pick.levels); // level card image for every channel

  // Deadman counts ONE result per RUN (not per channel): a single bad Bedrock
  // generation blocking all 3 channels must not insta-trip the 3-strike breaker
  // (that's what halted everything on 2026-07-16). Quality pass on ANY channel
  // resets the streak; dup-blocks are not quality failures.
  let runQualityFail = false, runQualityPass = false;

  for (const p of active) {
    const mode = modes[p.ch];
    const draft = gen.drafts.find((d) => d.channel === p.draftKey);
    const text = (draft?.text || '').trim();

    // Grounded gate — no real levels or empty draft = block.
    if (!gen.grounded || !draft || !text) {
      runQualityFail = true;
      out.push({ channel: p.ch, mode, action: 'block', ok: false, detail: 'grounded 실패/빈 초안' });
      continue;
    }
    // Quality/compliance lint (§6.1 items 1-2): links, emoji, metric count, prediction, buy/sell, length.
    if (!draft.lint.pass) {
      runQualityFail = true;
      const failed = draft.lint.checks.filter((c) => !c.ok).map((c) => c.key).join(',');
      out.push({ channel: p.ch, mode, action: 'block', ok: false, detail: `린트 실패: ${failed}` });
      continue;
    }
    // Skeleton dedup (§6.1 item 4) — per-channel scope so cross-channel mirrors
    // (x-us and bluesky share the EN text) don't block each other.
    if (await isDuplicateSkeleton(text, p.ch)) {
      out.push({ channel: p.ch, mode, action: 'block', ok: false, detail: '중복 구조 차단(72h)' });
      continue;
    }

    // All gates passed → act per mode.
    let ok = false;
    let detail = '';
    try {
      if (p.bluesky && mode === 'live') {
        // Bluesky live → direct AT-Protocol post (image embed is a follow-up).
        const r = await bskyPost(text);
        ok = r.ok; detail = r.ok ? 'bluesky published' : (r.error || 'bsky 실패');
      } else {
        // X (shadow=draft / live=publish) AND Bluesky shadow → Buffer. Drafts now
        // hold correctly (createPost omits dueAt for drafts, mode 'shareNow'), so
        // shadow no longer silently publishes. mediaUrl = hosted level card.
        const r = await createPost({ channelIds: [p.bufferId], text, mediaUrl: ogUrl, dryRun: false, draft: mode !== 'live' });
        ok = r.success; detail = r.success ? (mode === 'live' ? 'published' : 'draft 적재') : (r.error || 'buffer 실패');
      }
    } catch (e) {
      detail = (e as Error).message;
    }

    if (ok) {
      runQualityPass = true;
      await bumpVolume(p.volKey);
      await recordSkeleton(text, p.ch);
      await markAutoPost(p.ch);
      await appendAudit('autopilot', mode === 'live' ? 'auto-publish' : 'auto-draft', `${p.ch} $${pick.ticker} — ${detail}`);
      out.push({ channel: p.ch, mode, action: mode === 'live' ? 'published' : 'drafted', ok: true, detail: `$${pick.ticker}` });
    } else {
      out.push({ channel: p.ch, mode, action: 'fail', ok: false, detail });
    }
  }
  // one deadman sample per run
  if (runQualityPass) await recordGateResult(true);
  else if (runQualityFail) await recordGateResult(false);
  return out;
}

// ---------------------------------------------------------------------------
// Reply automation. Bluesky cold replies are fully allowed (no restriction) →
// find groundable posts, draft, auto-reply. X only allows API replies to users
// who mentioned us (self-reply), so X uses the mentions inbox. Both grounded +
// gated + deduped (never reply to the same post twice) + daily-capped.
// ---------------------------------------------------------------------------
function asTweet(id: string, author: string, text: string, ticker: string | null): ScanTweet {
  return {
    id, author, text, ticker, createdAt: '', likes: 0, replies: 0, retweets: 0,
    impressions: 0, score: 0, url: '', replySettings: 'everyone', canReply: true,
  };
}

const BSKY_PER_TICK = 3; // grounded Bluesky replies attempted per run
const X_PER_TICK = 2;    // self-replies per account per run

export async function runAutopilotReplies(): Promise<AutoResult[]> {
  const out: AutoResult[] = [];
  if (await getKillSwitch()) return [{ channel: 'reply', mode: 'off', action: 'halt', ok: false, detail: '킬스위치 ON' }];
  const dm = await deadmanTripped();
  if (dm.tripped) return [{ channel: 'reply', mode: 'off', action: 'halt', ok: false, detail: `데드맨: ${dm.reason}` }];

  const modes = await getAutoModes();
  const replied = await getRepliedIds();

  // ---- Bluesky cold replies (fully automatable) ----
  const bMode = modes['bluesky-reply'];
  if (bMode !== 'off') {
    const capCh = 'bluesky-reply';
    let vol = await getVolume(capCh);
    if (vol >= REPLY_CAP) {
      out.push({ channel: 'bluesky-reply', mode: bMode, action: 'skip', ok: false, detail: `캡 ${vol}/${REPLY_CAP}` });
    } else {
      const targets = (await bskySearchTargets(30))
        .filter((t) => t.ticker && !replied.has(t.uri))
        .sort((a, b) => b.likes - a.likes)
        .slice(0, BSKY_PER_TICK);
      if (targets.length === 0) {
        out.push({ channel: 'bluesky-reply', mode: bMode, action: 'skip', ok: false, detail: '적합 답글 대상 없음' });
      }
      for (const t of targets) {
        if (vol >= REPLY_CAP) break;
        const d = await draftReply(asTweet(t.uri, t.author, t.text, t.ticker), 'en');
        if (!d.grounded || !d.draft) { out.push({ channel: 'bluesky-reply', mode: bMode, action: 'block', ok: false, detail: `grounded 실패 $${t.ticker}` }); continue; }
        // reply lint failures don't feed the deadman (originals runs are its signal)
        if (!lint(d.draft, 'en').pass) { out.push({ channel: 'bluesky-reply', mode: bMode, action: 'block', ok: false, detail: '린트 실패' }); continue; }
        if (bMode === 'shadow') {
          await markReplied(t.uri);
          await appendAudit('autopilot', 'auto-reply-draft', `bluesky @${t.author} $${t.ticker}: ${d.draft.slice(0, 80)}`);
          out.push({ channel: 'bluesky-reply', mode: bMode, action: 'drafted', ok: true, detail: `@${t.author} $${t.ticker}` });
          continue;
        }
        const r = await bskyReply(t, d.draft);
        if (r.ok) {
          await markReplied(t.uri);
          const b = await bumpVolumeCapped(capCh, REPLY_CAP); vol = b.count;
          await recordGateResult(true);
          await appendAudit('autopilot', 'auto-reply', `bluesky @${t.author} $${t.ticker} (${vol}/${REPLY_CAP})`);
          out.push({ channel: 'bluesky-reply', mode: bMode, action: 'published', ok: true, detail: `@${t.author} $${t.ticker}` });
        } else {
          out.push({ channel: 'bluesky-reply', mode: bMode, action: 'fail', ok: false, detail: r.error });
        }
      }
    }
  }

  // ---- X self-replies (only API-allowed replies: users who mentioned us) ----
  // No Buffer-draft path for replies, so X self-reply acts only when the account's
  // channel is 'live'; shadow/off = skip (nothing to stage).
  for (const acct of ['en', 'jp'] as Acct[]) {
    const chMode = modes[acct === 'en' ? 'x-us' : 'x-jp'];
    if (chMode !== 'live') continue;
    const capCh = acct === 'en' ? 'x-us-reply' : 'x-jp-reply';
    let vol = await getVolume(capCh);
    if (vol >= REPLY_CAP) continue;
    const conn = await getConnection(acct);
    if (!conn.connected) { out.push({ channel: capCh, mode: chMode, action: 'skip', ok: false, detail: '계정 미연결' }); continue; }
    const inbox = await fetchInbox(acct);
    if (!inbox.ok || !inbox.items) { out.push({ channel: capCh, mode: chMode, action: 'skip', ok: false, detail: inbox.error || '멘션 없음' }); continue; }
    const { detectTicker } = await import('./xScan');
    const cands = inbox.items.filter((m) => !replied.has(m.id) && detectTicker(m.text)).slice(0, X_PER_TICK);
    for (const m of cands) {
      if (vol >= REPLY_CAP) break;
      const tk = detectTicker(m.text);
      const d = await draftReply(asTweet(m.id, m.author, m.text, tk), acct === 'jp' ? 'ja' : 'en');
      if (!d.grounded || !d.draft || !lint(d.draft, acct === 'jp' ? 'ja' : 'en').pass) { out.push({ channel: capCh, mode: chMode, action: 'block', ok: false, detail: 'grounded/린트 실패' }); continue; }
      const r = await postReply(acct, m.id, d.draft);
      if (r.ok) {
        await markReplied(m.id);
        const b = await bumpVolumeCapped(capCh, REPLY_CAP); vol = b.count;
        await appendAudit('autopilot', 'auto-reply', `${capCh} @${m.author} $${tk} (${vol}/${REPLY_CAP})`);
        out.push({ channel: capCh, mode: chMode, action: 'published', ok: true, detail: `@${m.author} $${tk}` });
      } else {
        out.push({ channel: capCh, mode: chMode, action: 'fail', ok: false, detail: r.error });
      }
    }
  }

  return out;
}
