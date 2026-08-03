// ============================================================================
// /api/cron/breaking-detect — 급변동·반전 감지 → Redis 기록 (→ 나중에 푸시)
// ----------------------------------------------------------------------------
// 정본: .agent/BREAKING_ALERT_PLAN.md
//
// 🅢 섀도 모드가 «기본»이다.
//   임계값(2.5σ / 30분)은 2026-08-03 하루치 실측으로 정했다. 하루치다.
//   알림을 켜기 전에 며칠 돌려 «정말 종목당 하루 1~2건인가»를 확인해야 한다.
//   그래서 이 크론은 기본적으로 감지 결과를 Redis에만 쌓는다. 사용자 영향 0.
//   실전 전환은 ?live=1 (또는 env BREAKING_LIVE=1) 을 명시적으로 켜야 한다.
//
// 게이트 (전부 AND) — §2
//   ① 정규장(개장 15분 후 ~ 마감)  ② σ 임계  ③ 거래량 확인
//   ④ 종목별 쿨다운 45분  ⑤ 하루 최대 3건  ⑥ 지수 발동 시 개별종목 억제
//
// 사용:
//   /api/cron/breaking-detect?secret=...              → 섀도(기록만)
//   /api/cron/breaking-detect?secret=...&dry=1        → 아무것도 안 쓰고 판정만 반환
//   /api/cron/breaking-detect?secret=...&live=1       → 실전(푸시 단계 붙은 뒤)
// ============================================================================

import { NextResponse } from 'next/server';
import { getFromCache, setInCache } from '@/services/redisClient';
import { getSigmaProfile, etDate } from '@/services/breaking/sigmaEngine';
import { detectForSymbol, isRegularSessionNow, TUNING, type MoveSignal } from '@/services/breaking/detectMove';
import { buildWhyContext, buildWhyText, buildHeadline, type Locale } from '@/services/breaking/whyBuilder';
import {
  FEED_KEY, SHADOW_KEY, HEARTBEAT_KEY, DAY_KEY, SPIKE_KEY, LASTPUB_KEY, COOL_KEY,
  type BreakingItem,
} from '@/services/breaking/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 지수 = 시장 전체. 이게 발동하면 개별종목 알림은 억제한다(§2 게이트 ⑤).
const INDEX_SYMBOLS = ['SPY', 'QQQ'];
// 개별종목 — 사용자가 실제로 들고 있을 법한 것 위주. event-detect의 30종보다 좁게
// 시작한다(크론 1회 예산 60초 안에 들어와야 한다).
const STOCK_SYMBOLS = [
  'NVDA', 'AAPL', 'MSFT', 'TSLA', 'AMD', 'AVGO', 'META', 'GOOGL', 'AMZN',
  'PLTR', 'COIN', 'MU', 'SMH', 'SOXL',
];

const COOLDOWN_MS = 45 * 60 * 1000;
const MAX_DAILY = 3;
// [FIX 2026-08-03 · 백테스트가 잡음] 위 두 개만으로는 부족했다.
// 8/3 재현에서 발행 3건이 «14:12·14:15·14:18 — 6분 안에» 다 나가고 하루 예산이
// 개장 45분 만에 소진됐다. 그러면 정작 제일 흥미로운 REVERSAL(15:24 GOOGL,
// 15:28 SOXL, 15:33 MSFT)이 전부 잘린다. 반전은 «직전 다리»가 있어야 성립하므로
// 구조적으로 장 후반에 나온다 — 선착순이면 영원히 굶는다.
//   ① 전역 간격: 어떤 두 알림 사이 최소 60분 → 하루에 고르게 퍼진다
//   ② SPIKE 상한 2건 → 나머지 1자리는 REVERSAL 몫으로 남긴다
// 적용 후 8/3 재현: 2건(14:12 NVDA 5.28σ SPIKE / 15:24 GOOGL REVERSAL), 72분 간격.
const GLOBAL_GAP_MS = 60 * 60 * 1000;
const MAX_DAILY_SPIKE = 2;
const LOCALES: Locale[] = ['ko', 'en', 'ja'];


export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  const authHeader = request.headers.get('authorization');
  const secretParam = searchParams.get('secret');

  if (process.env.NODE_ENV === 'production' && cronSecret) {
    const ok = authHeader === `Bearer ${cronSecret}` || secretParam === cronSecret;
    if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dry = searchParams.get('dry') === '1';
  const live = searchParams.get('live') === '1' || process.env.BREAKING_LIVE === '1';
  const force = searchParams.get('force') === '1';   // 장외 검증용
  const mode: 'shadow' | 'live' = live ? 'live' : 'shadow';

  if (!force && !isRegularSessionNow()) {
    if (!dry) {
      await setInCache(HEARTBEAT_KEY, {
        atISO: new Date().toISOString(), mode, scanned: 0, regularSession: false,
      }, 3 * 3600).catch(() => null);
    }
    return NextResponse.json({ ok: true, skipped: true, reason: 'not-regular-session' });
  }

  const today = etDate();

  // 생존 신호는 «게이트보다 먼저» 남긴다 — 장외 스킵도 "돌았다"로 세야
  // 크론이 죽었는지 그냥 조용한 건지 구분할 수 있다.
  if (!dry) {
    await setInCache(HEARTBEAT_KEY, {
      atISO: new Date().toISOString(),
      mode, scanned: 0, regularSession: isRegularSessionNow(),
    }, 3 * 3600).catch(() => null);
  }

  // ── 1) 감지 ──────────────────────────────────────────────────────────────
  // σ 프로파일을 먼저 병렬로 데운다(당일 캐시라 첫 호출만 비용 발생).
  const all = [...INDEX_SYMBOLS, ...STOCK_SYMBOLS];
  const profiles = await Promise.all(all.map((s) => getSigmaProfile(s).catch(() => null)));

  const detected = (await Promise.all(
    all.map((s, i) => detectForSymbol(s, profiles[i]).catch(() => null)),
  )).filter(Boolean) as MoveSignal[];

  // 지수가 발동했으면 개별종목은 버린다 — "시장 전체"가 이미 답이다.
  const indexHits = detected.filter((d) => INDEX_SYMBOLS.includes(d.symbol));
  const pool = indexHits.length > 0 ? indexHits : detected;
  pool.sort((a, b) => b.priority - a.priority);

  // 섀도 관측 로그는 «게이트 이전»에 남긴다. 튜닝 근거는 걸러지기 전 숫자여야 한다.
  if (!dry) {
    const prev = (await getFromCache<any[]>(SHADOW_KEY(today))) ?? [];
    prev.push({
      at: new Date().toISOString(),
      scanned: all.length,
      detected: detected.map((d) => ({
        s: d.symbol, k: d.kind, pct: +d.changePct.toFixed(2),
        sig: +d.sigmaMult.toFixed(2), vol: +d.volumeMult.toFixed(2), at: d.atET,
      })),
    });
    await setInCache(SHADOW_KEY(today), prev.slice(-400), 3 * 86400);
  }

  if (!dry) {
    await setInCache(HEARTBEAT_KEY, {
      atISO: new Date().toISOString(),
      mode, scanned: all.length, regularSession: true,
    }, 3 * 3600).catch(() => null);
  }

  if (pool.length === 0) {
    return NextResponse.json({ ok: true, mode, scanned: all.length, detected: 0, published: 0 });
  }

  // ── 2) 쿨다운·일일 상한 ─────────────────────────────────────────────────
  const dailyCount = (await getFromCache<number>(DAY_KEY(today))) ?? 0;
  const dailySpike = (await getFromCache<number>(SPIKE_KEY(today))) ?? 0;
  const lastPubAt = (await getFromCache<number>(LASTPUB_KEY(today))) ?? 0;
  const published: BreakingItem[] = [];
  let count = dailyCount;
  let spikes = dailySpike;
  let lastAt = lastPubAt;

  for (const signal of pool) {
    if (count >= MAX_DAILY) break;
    // 전역 간격 — 한 크론 틱에서도, 틱 사이에서도 60분을 지킨다
    if (lastAt && Date.now() - lastAt < GLOBAL_GAP_MS) break;
    // SPIKE 상한 — 마지막 한 자리는 REVERSAL 몫
    if (signal.kind === 'SPIKE' && spikes >= MAX_DAILY_SPIKE) continue;

    const cooledAt = await getFromCache<number>(COOL_KEY(signal.symbol));
    if (cooledAt && Date.now() - cooledAt < COOLDOWN_MS) continue;

    // ── 3) «왜» 조립 (3언어, AI 호출 없음) ────────────────────────────────
    const contexts = await Promise.all(
      LOCALES.map((l) => buildWhyContext(signal, l).catch(() => null)),
    );
    const copy = {} as BreakingItem['copy'];
    const context = {} as BreakingItem['context'];
    LOCALES.forEach((l, i) => {
      const ctx = contexts[i] ?? { news: [], calendar: [], confidence: 'NONE' as const, corroborationCount: 0, newsAligned: null };
      context[l] = ctx;
      copy[l] = { headline: buildHeadline(signal, l), why: buildWhyText(signal, ctx, l) };
    });

    const item: BreakingItem = {
      id: `${today}-${signal.symbol}-${signal.kind}-${signal.atET.replace(':', '')}`,
      signal, copy, context,
      createdAt: new Date().toISOString(),
      mode,
    };
    published.push(item);
    count++;
    if (signal.kind === 'SPIKE') spikes++;
    lastAt = Date.now();

    if (!dry) {
      await setInCache(COOL_KEY(signal.symbol), Date.now(), 6 * 3600);
    }
  }

  if (!dry && published.length > 0) {
    const feed = (await getFromCache<BreakingItem[]>(FEED_KEY(today))) ?? [];
    // 같은 id는 덮어쓴다(크론 재시도 대비)
    const merged = [...feed.filter((f) => !published.some((p) => p.id === f.id)), ...published];
    await setInCache(FEED_KEY(today), merged.slice(-10), 26 * 3600);
    await setInCache(DAY_KEY(today), count, 26 * 3600);
    await setInCache(SPIKE_KEY(today), spikes, 26 * 3600);
    await setInCache(LASTPUB_KEY(today), lastAt, 26 * 3600);
  }

  // ── 4) 실전 모드에서만 푸시 (아직 미배선 — 3단계에서 붙인다) ─────────────
  // 섀도에서는 여기 도달해도 아무것도 보내지 않는다.
  const pushed = 0;

  return NextResponse.json({
    ok: true,
    mode, dry,
    scanned: all.length,
    detected: detected.length,
    published: published.length,
    pushed,
    dailyCount: count,
    items: published.map((p) => ({
      id: p.id,
      symbol: p.signal.symbol,
      kind: p.signal.kind,
      changePct: +p.signal.changePct.toFixed(2),
      priorPct: p.signal.priorPct != null ? +p.signal.priorPct.toFixed(2) : undefined,
      sigmaMult: +p.signal.sigmaMult.toFixed(2),
      volumeMult: +p.signal.volumeMult.toFixed(2),
      confidence: p.context.ko.confidence,
      ko: p.copy.ko,
      en: p.copy.en,
    })),
    tuning: TUNING,
  });
}
