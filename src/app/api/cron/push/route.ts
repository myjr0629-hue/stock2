// ============================================================================
// /api/cron/push — sends scheduled push notifications (Morning Brief / Closing
// Report) to all registered devices via FCM. Triggered by Vercel Cron.
//   ?type=morning | closing   (default: closing)
//   ?dry=1   (2026-10-12) 보내지 않고 «지금 보낼 페이로드»(ko/en/ja 제목·본문·AI 판정 사유)·대상 수·관문 상태만 돌려준다.
//            발송 표식·통계를 쓰지 않는다. &date=YYYY-MM-DD 로 마감 본문을 그날 브리프로 미리 볼 수 있다(모닝은 저장본이 하루치뿐이라 오늘만).
// Auth: Authorization: Bearer ${CRON_SECRET}  (or ?secret=) — same as other crons.
//
// ★2026-10-12 본문 «AI 한 줄»(lib/push/aiLine) — 제목은 그대로, 본문만: 모닝 = 오늘(ET) AI 모닝 브리핑 첫 문장, 마감 = 앱이 보여 주는
//   크로스섹터 브리프의 marketOverview.summary 첫 문장. 템플릿·degraded·금지어·예측어·언어 혼입 등은 예전 정적 문구로.
// ★2026-10-12 계측 — 실제 발송마다 push:stats:{type}:{ET날짜}(TTL 60일): 대상·성공·실패·토글로 끈 기기·언어·플랫폼별 + 본문 판정. scripts/mkt-push.js 가 읽는다.
// ============================================================================
import { NextResponse } from 'next/server';
import { sendPushByType, planPush, PUSH_CONTENT, type PushSendStats } from '@/lib/push/send';
import { getFromCache, setInCache } from '@/services/redisClient';
import { fetchMassive } from '@/services/massiveClient';
import { morningAiLines, closingAiLines, etToday, PUSH_LOCALES, type AiLineResult, type MorningBriefRecord, type PushLocale } from '@/lib/push/aiLine';
import { selectServedBrief } from '@/lib/ai/crossBriefServe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  // [Security] CRON_SECRET check — mirrors the other cron routes.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  const { searchParams } = new URL(request.url);
  const secretParam = searchParams.get('secret');

  if (process.env.NODE_ENV === 'production' && cronSecret) {
    const isHeaderValid = authHeader === `Bearer ${cronSecret}`;
    const isParamValid = secretParam === cronSecret;
    if (!isHeaderValid && !isParamValid) {
      console.warn('[Cron/Push] Unauthorized request');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const type = searchParams.get('type') === 'morning' ? 'morning' : 'closing';

  // [TEST] ?test=1 (with a valid secret) bypasses the report-ready + de-dupe gates
  // and sends immediately — lets us verify real delivery on demand without waiting
  // for the 08:00/17:00 ET publication. Secret-guarded by the auth check above.
  // ?dry=1 이 함께 오면 절대 보내지 않는다(드라이런이 우선).
  if (searchParams.get('test') === '1' && searchParams.get('dry') !== '1') {
    try {
      const result = await sendPushByType(type);
      console.log(`[Cron/Push] TEST type=${type} sent=${result.sent}/${result.total} pruned=${result.pruned}`);
      return NextResponse.json({ ok: true, test: true, type, ...result });
    } catch (err: any) {
      console.error('[Cron/Push] TEST send failed:', err?.message || err);
      return NextResponse.json({ ok: false, error: err?.message || 'send failed' }, { status: 500 });
    }
  }

  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const dry = searchParams.get('dry') === '1';

  // 1) Verify the report/brief was ACTUALLY generated TODAY before notifying — never
  //    send a premature or empty push if generation was delayed or failed.
  const gate = await checkReady(type, todayET);
  if (!dry && !gate.ready) {
    return NextResponse.json({ ok: gate.reason === 'market-holiday', skipped: true, reason: gate.reason, type });
  }

  // 2) De-dupe: the morning cron fires at two UTC times (one per DST season, so the
  //    push always lands ~10min after 08:00 ET), and Vercel may retry — only ever send
  //    one push per type per ET day.
  const sentKey = `push:sent:${type}:${todayET}`;
  const alreadySent = await getFromCache<string>(sentKey);

  if (dry) {
    // 드라이런 — 보내지 않는다. 표식·통계도 쓰지 않는다.
    const dateParam = searchParams.get('date');
    const previewDate = type === 'closing' && /^\d{4}-\d{2}-\d{2}$/.test(dateParam || '') ? dateParam! : todayET;
    const lines = await composeLines(type, previewDate);
    let targets: Record<string, unknown> | null = null;
    try {
      const plan = await planPush(type);
      const count = (p: 'ios' | 'android') => Object.fromEntries(PUSH_LOCALES.map((l) => [l, plan.targets[p][l].length]));
      targets = { total: plan.total, ios: count('ios'), android: count('android'), optedOut: plan.optedOut, noRecord: plan.noRecord, seen1d: plan.seen1d, seen7d: plan.seen7d, new7d: plan.new7d };
    } catch (e: any) { targets = { error: e?.message || 'plan failed' }; }
    const payloads = Object.fromEntries(PUSH_LOCALES.map((l) => [l, {
      title: PUSH_CONTENT[type][l].title,
      body: lines[l].line || PUSH_CONTENT[type][l].body,
      ai: !!lines[l].line,
      reason: lines[l].reason,
    }]));
    return NextResponse.json({ ok: true, dry: true, type, todayET, previewDate, gate, alreadySent: alreadySent || null, payloads, targets });
  }

  if (alreadySent) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'already-sent', type });
  }

  try {
    // 본문 AI 한 줄 — 무슨 일이 있어도 발송을 막지 않는다(실패 = 정적 문구)
    const lines = await composeLines(type, todayET);
    const bodies = Object.fromEntries(PUSH_LOCALES.map((l) => [l, lines[l].line])) as Record<PushLocale, string | null>;
    const result = await sendPushByType(type, { bodies });
    await setInCache(sentKey, new Date().toISOString(), 60 * 60 * 18);
    await writeStats(type, todayET, result.stats, lines);
    const aiTag = PUSH_LOCALES.map((l) => `${l}:${lines[l].line ? 'ai' : lines[l].reason}`).join(',');
    console.log(`[Cron/Push] type=${type} sent=${result.sent}/${result.total} targets=${result.stats.targets} optedOut=${result.stats.optedOut} pruned=${result.pruned} body=${aiTag}`);
    return NextResponse.json({ ok: true, type, total: result.total, sent: result.sent, pruned: result.pruned, targets: result.stats.targets, optedOut: result.stats.optedOut, body: aiTag });
  } catch (err: any) {
    console.error('[Cron/Push] send failed:', err?.message || err);
    return NextResponse.json({ ok: false, error: err?.message || 'send failed' }, { status: 500 });
  }
}

type Gate = { ready: boolean; reason: string };

/** 발송 관문 — 예전 순서·조건 그대로(드라이런이 상태를 보여 줄 수 있게 함수로 뺐을 뿐) */
async function checkReady(type: 'morning' | 'closing', todayET: string): Promise<Gate> {
  if (type === 'morning') {
    // Morning brief is generated ~08:00 ET by the EC2 worker (guardian/briefing/generate),
    // which stamps guardian:morning_briefing.generatedAt.
    const brief = await getFromCache<{ generatedAt?: string }>('guardian:morning_briefing');
    const genET = brief?.generatedAt
      ? new Date(brief.generatedAt).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      : null;
    if (genET !== todayET) {
      console.warn(`[Cron/Push] morning brief not ready (gen=${genET}, today=${todayET}) — skipping`);
      return { ready: false, reason: 'report-not-ready' };
    }
    return { ready: true, reason: 'ready' };
  }
  // [HOLIDAY GUARD] The snapshot/brief crons run on weekday holidays too (they have
  // no market-calendar awareness) and can stamp today's markers from stale data —
  // which would push a "closing report" on a day with NO session (e.g. 7/3 observed
  // Independence Day). Data-driven check: a real session leaves a SPY daily bar.
  try {
    const aggs = await fetchMassive(`/v2/aggs/ticker/SPY/range/1/day/${todayET}/${todayET}`, { adjusted: 'true', limit: '2' });
    if (!aggs?.results?.length) {
      console.warn(`[Cron/Push] no SPY session bar for ${todayET} (market holiday) — skipping closing push`);
      return { ready: false, reason: 'market-holiday' };
    }
  } catch { /* vendor check failed — fall through; the report gates below still protect */ }

  // Closing push requires BOTH signals to be TODAY's, so it only fires once the full
  // report set is genuinely published:
  //  1) all 10 sector snapshots swept — snapshot cron stamps this after cloud_fortress
  //  2) the comprehensive cross-sector brief (CROSS-SECTOR INTELLIGENCE) generated
  // [ROOT-CAUSE FIX] The brief has TWO producers writing DIFFERENT keys: the EC2/Lambda
  // pipeline writes v3 (reliable — what the app's GET actually serves first) and the
  // Vercel POST self-generator writes v4 (often dies on the 60s limit). Gating on v4
  // alone meant the closing push NEVER fired even though the report was live in the
  // app. Check the same chain the app serves: v4 → v3 → v2.
  const ready = await getFromCache<string>('push:report-ready:closing');
  if (ready !== todayET) {
    console.warn(`[Cron/Push] closing sectors not ready (marker=${ready}, today=${todayET}) — skipping`);
    return { ready: false, reason: 'sectors-not-ready' };
  }
  let brief: { generatedAt?: string } | null = null;
  for (const v of ['v4', 'v3', 'v2']) {
    brief = await getFromCache<{ generatedAt?: string }>(`postmarket:cross-brief-${v}:${todayET}`);
    if (brief?.generatedAt) break;
  }
  const briefET = brief?.generatedAt
    ? new Date(brief.generatedAt).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    : null;
  if (briefET !== todayET) {
    console.warn(`[Cron/Push] comprehensive brief not ready (gen=${briefET}, today=${todayET}) — skipping`);
    return { ready: false, reason: 'brief-not-ready' };
  }
  return { ready: true, reason: 'ready' };
}

const STATIC_LINES = (reason: string): Record<PushLocale, AiLineResult> =>
  Object.fromEntries(PUSH_LOCALES.map((l) => [l, { line: null, reason }])) as Record<PushLocale, AiLineResult>;

/** 본문 AI 한 줄(ko/en/ja) — 읽기 실패·예외는 전부 정적 문구(발송을 막지 않는다) */
async function composeLines(type: 'morning' | 'closing', date: string): Promise<Record<PushLocale, AiLineResult>> {
  try {
    if (type === 'morning') {
      const recs = await Promise.all(PUSH_LOCALES.map((l) => getFromCache<MorningBriefRecord>(`guardian:morning_briefing:${l}`)));
      return morningAiLines({ ko: recs[0], en: recs[1], ja: recs[2] });
    }
    // 앱 Intel 화면이 실제로 보여 주는 판(v4 가드 통과 → v3 → v2)과 같은 것을 고른다
    const sel = await selectServedBrief((key) => getFromCache<any>(key), [date]);
    return closingAiLines(sel?.brief, sel?.date ?? null, date, Number(date.slice(0, 4)) || etToday().year);
  } catch (e: any) {
    console.warn(`[Cron/Push] AI line compose failed — static body: ${e?.message || e}`);
    return STATIC_LINES('error');
  }
}

/** push:stats:{type}:{ET날짜} — 발송 결과 + 본문 판정(60일). 실패해도 발송 결과에는 영향 없음 */
async function writeStats(type: 'morning' | 'closing', day: string, stats: PushSendStats, lines: Record<PushLocale, AiLineResult>) {
  try {
    const body = Object.fromEntries(PUSH_LOCALES.map((l) => [l, {
      ai: !!lines[l].line,
      reason: lines[l].reason,
      text: lines[l].line || PUSH_CONTENT[type][l].body,
    }]));
    await setInCache(`push:stats:${type}:${day}`, { ...stats, day, body }, 60 * 60 * 24 * 60);
  } catch (e: any) {
    console.warn(`[Cron/Push] stats write failed: ${e?.message || e}`);
  }
}
