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
  marketSession, jpSession, etDate,
  getRecentTickers, markRecentTicker,
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
// v2: per-channel language + rotating visual theme (deterministic by
// ticker+date+channel) so the feed doesn't look like one repeated template.
const OG_THEMES = ['gold', 'ocean', 'ember'] as const;
function pickTheme(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return OG_THEMES[h % OG_THEMES.length];
}
function ogCardUrl(ticker: string, lv: Levels, lang: 'en' | 'ja' = 'en', theme = 'gold'): string {
  const q = new URLSearchParams({ ticker, lang, theme });
  if (typeof lv.price === 'number') q.set('price', String(lv.price));
  if (typeof lv.maxPain === 'number') q.set('maxPain', String(lv.maxPain));
  if (typeof lv.gammaFlip === 'number') q.set('gammaFlip', String(lv.gammaFlip));
  if (typeof lv.callWall === 'number') q.set('callWall', String(lv.callWall));
  if (typeof lv.putFloor === 'number') q.set('putFloor', String(lv.putFloor));
  return `${SITE}/api/og/level?${q.toString()}`;
}

// ---- 분산 발행 페이서 -------------------------------------------------------
// 고정 크론 시각 대신 30분 슬롯마다 확률로 발행을 결정해, 하루 캡(3)이 채널
// 활동창 전체에 매일 다른 시각으로 흩어지게 한다. target = CAP × 창 경과율.
// 뒤처지면(behind≥1) 즉시 발행해 쿼터를 보장, 그 외엔 behind×0.5 확률(지터).
// 캡·90분 간격·세션창 게이트가 그대로 중첩되므로 과발행은 불가능하다.
function windowFraction(ch: string): number {
  if (ch === 'x-jp') {
    // JST 활동창(jpSession good): 07-10 + 20-05 = 12h, 07시 시작 순서.
    const jst = parseInt(
      new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', hour: '2-digit', hour12: false }).format(new Date()),
      10
    );
    const seq = [7, 8, 9, 20, 21, 22, 23, 0, 1, 2, 3, 4];
    const idx = seq.indexOf(jst);
    return idx < 0 ? 1 : (idx + 0.5) / seq.length;
  }
  // x-us / bluesky-post: ET 09:30~20:00 (open+after 창과 일치)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => parseInt(parts.find((p) => p.type === t)?.value || '0', 10);
  const t = g('hour') * 60 + g('minute');
  return Math.min(1, Math.max(0, (t - 570) / (1200 - 570)));
}
function paceGate(ch: string, vol: number): { post: boolean; detail: string } {
  const target = DAILY_CAP * windowFraction(ch);
  const behind = target - vol;
  if (behind >= 1) return { post: true, detail: 'catch-up' };
  if (behind > 0 && Math.random() < behind * 0.5) return { post: true, detail: 'jitter' };
  return { post: false, detail: `페이싱 대기(target ${target.toFixed(1)}, 발행 ${vol})` };
}

export interface TickerPick { ticker: string; reason: string; notability: number; levels: Levels }

// Scan the watchlist, rank by how notable the options structure is right now
// (max-pain gap % is the strongest "the chart doesn't show it" hook; gamma-flip
// proximity adds tension). Same scoring the console's /generate/suggest uses.
export async function pickBestTicker(): Promise<TickerPick | null> {
  // 확장 풀(26)에서 매 틱 셔플 12개만 샘플 — fetch 폭주 없이 풀 전체를 순환.
  // 최근 48h 포스팅 종목은 후순위(전부 최근이면 최고점 허용) → 종목 다양성.
  const recent = await getRecentTickers();
  const pool = [...ST_TICKERS].sort(() => Math.random() - 0.5).slice(0, 12);
  const scored = await Promise.all(
    pool.map(async (ticker): Promise<TickerPick | null> => {
      const lv = extractLevels(await fetchStructure(ticker));
      if (!lv || typeof lv.price !== 'number' || lv.price <= 0) return null;
      const price = lv.price;
      const maxPainGap = typeof lv.maxPain === 'number' ? Math.abs(price - lv.maxPain) / price : 0;
      const flipGap = typeof lv.gammaFlip === 'number' ? Math.abs(price - lv.gammaFlip) / price : 0;
      const wallGap = typeof lv.callWall === 'number' ? Math.abs(price - lv.callWall) / price : 1;
      const floorGap = typeof lv.putFloor === 'number' ? Math.abs(price - lv.putFloor) / price : 1;
      // Level-test drama: price pressing a wall/floor is a story in itself.
      const notability =
        maxPainGap * 100 + (flipGap < 0.01 ? 3 : 0) + (wallGap < 0.005 ? 2 : 0) + (floorGap < 0.005 ? 2 : 0);
      // English only — this string feeds the generation prompt, and Korean here
      // leaked Hangul into a live @signumhq_jp post (2026-07-18 incident).
      const reason =
        maxPainGap >= 0.03 ? `max-pain divergence ${(maxPainGap * 100).toFixed(1)}%`
          : wallGap < 0.005 ? 'call-wall test'
            : floorGap < 0.005 ? 'put-floor test'
              : flipGap < 0.01 ? 'gamma-flip proximity'
                : 'structure watch';
      return { ticker, reason, notability, levels: lv };
    })
  );
  const ranked = scored
    .filter((x): x is TickerPick => x !== null)
    .sort((a, b) => b.notability - a.notability);
  return ranked.find((x) => !recent.has(x.ticker)) || ranked[0] || null;
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
    // Bluesky audience is EN/US-market — pace it on the US window (was 24/7).
    { ch: 'bluesky-post', volKey: X_CHANNELS.bsky, draftKey: 'x_en', bufferId: BUFFER_CH.bluesky, good: us.goodToPost, bluesky: true },
  ];

  // Only spend a Bedrock generation if at least one channel is active AND eligible
  // right now (mode≠off, in a good window, under cap, past the interval, and the
  // pacer's slot lottery says now — that last one is what spreads posts across
  // the day instead of firing at fixed cron minutes).
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
    const pace = paceGate(p.ch, vol);
    if (!pace.post) { out.push({ channel: p.ch, mode, action: 'skip', ok: false, detail: pace.detail }); continue; }
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
  // Autopilot only consumes x_en/x_ja — don't burn Bedrock tokens on the
  // console-manual channels (toss/stocktwits).
  const gen = await generateDrafts(pick.ticker, pick.reason, ['x_en', 'x_ja']);

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

    // All gates passed → act per mode. Card: per-channel language (ja for x-jp)
    // + rotating theme so consecutive posts don't look like one repeated template.
    const ogUrl = ogCardUrl(
      pick.ticker, pick.levels,
      p.ch === 'x-jp' ? 'ja' : 'en',
      pickTheme(pick.ticker + etDate() + p.ch)
    );
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
      await markRecentTicker(pick.ticker); // 48h 종목 회전
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
      const seenAuthors = new Set<string>();
      const targets = (await bskySearchTargets(30))
        .filter((t) => t.ticker && !replied.has(t.uri))
        .sort((a, b) => b.likes - a.likes)
        .filter((t) => { // one reply per author per tick (no pestering)
          const a = t.author.toLowerCase();
          if (seenAuthors.has(a)) return false;
          seenAuthors.add(a);
          return true;
        })
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
