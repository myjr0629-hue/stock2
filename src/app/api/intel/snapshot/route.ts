// ============================================================================
// /api/intel/snapshot — Sector Snapshot API
// POST: Save post-market snapshot (cron/manual trigger)
// GET:  Retrieve latest or specific-date snapshot
// ============================================================================

import { NextResponse } from 'next/server';
import { saveSnapshot, getLatestSnapshot, getSnapshotByDate } from '@/lib/supabase/snapshot';
import type { SnapshotData, TickerSnapshot, SectorSummary } from '@/types/sector';

// Sector ticker lists
const SECTOR_TICKERS: Record<string, string[]> = {
    m7: ['AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA'],
    physical_ai: ['PLTR', 'SERV', 'PL', 'TER', 'SYM', 'RKLB', 'ISRG'],
};

/**
 * GET /api/intel/snapshot?sector=m7&date=2026-02-10
 * Retrieve latest or date-specific snapshot
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const sector = searchParams.get('sector');
    const date = searchParams.get('date');

    if (!sector) {
        return NextResponse.json(
            { error: 'Missing sector parameter' },
            { status: 400 }
        );
    }

    try {
        const snapshot = date
            ? await getSnapshotByDate(sector, date)
            : await getLatestSnapshot(sector);

        if (!snapshot) {
            return NextResponse.json(
                { error: 'No snapshot found', sector, date },
                { status: 404 }
            );
        }

        return NextResponse.json({
            success: true,
            snapshot: snapshot.data_json,
            snapshot_date: snapshot.snapshot_date,
            created_at: snapshot.created_at,
        });
    } catch (e: any) {
        console.error('[Snapshot API] GET error:', e);
        return NextResponse.json(
            { error: 'Failed to fetch snapshot' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/intel/snapshot
 * Body: { sector: 'm7' }
 * Triggered after market close to capture and save snapshot
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const sector = body.sector as string;

        if (!sector || !SECTOR_TICKERS[sector]) {
            return NextResponse.json(
                { error: 'Invalid sector', valid: Object.keys(SECTOR_TICKERS) },
                { status: 400 }
            );
        }

        const baseUrl = request.url.split('/api/')[0];
        const tickers = SECTOR_TICKERS[sector];

        // ── Fetch current live data from existing Intel API ──
        const liveApiUrl = sector === 'm7'
            ? `${baseUrl}/api/intel/m7`
            : `${baseUrl}/api/intel/physicalai`;

        const res = await fetch(liveApiUrl, { cache: 'no-store' });
        if (!res.ok) {
            return NextResponse.json(
                { error: 'Failed to fetch live data for snapshot' },
                { status: 502 }
            );
        }

        const text = await res.text();
        if (!text) {
            return NextResponse.json(
                { error: 'Empty response from live API' },
                { status: 502 }
            );
        }

        let liveData: any;
        try { liveData = JSON.parse(text); } catch {
            return NextResponse.json(
                { error: 'Invalid JSON from live API' },
                { status: 502 }
            );
        }

        if (!liveData?.data || liveData.data.length === 0) {
            return NextResponse.json(
                { error: 'No ticker data available' },
                { status: 502 }
            );
        }

        // ── Build snapshot data ──
        const now = new Date();
        const snapshotDate = now.toISOString().split('T')[0]; // YYYY-MM-DD

        // Next market close (approximate: next weekday at ET 21:00 UTC)
        const nextClose = new Date(now);
        nextClose.setDate(nextClose.getDate() + 1);
        // Skip weekends
        if (nextClose.getDay() === 0) nextClose.setDate(nextClose.getDate() + 1);
        if (nextClose.getDay() === 6) nextClose.setDate(nextClose.getDate() + 2);
        nextClose.setUTCHours(21, 0, 0, 0); // ET 16:00 = UTC 21:00

        const tickerSnapshots: TickerSnapshot[] = liveData.data.map((q: any) => {
            // Generate AI verdict based on indicators
            const verdict = generateVerdict(q);
            const analysis = generateAnalysisKR(q, verdict);

            return {
                ticker: q.ticker,
                close_price: q.price || 0,
                change_pct: q.changePct || 0,
                alpha_score: q.alphaScore || 0,
                grade: q.grade || '-',
                volume: q.volume || 0,
                gex: q.gex || 0,
                pcr: q.pcr || 0,
                gamma_regime: q.gammaRegime || 'NEUTRAL',
                max_pain: q.maxPain || 0,
                call_wall: q.callWall || 0,
                put_floor: q.putFloor || 0,
                rsi: q.rsi || 0,
                rvol: q.rvol || 0,
                sparkline: q.sparkline || [],
                verdict,
                analysis_kr: analysis,
            };
        });

        // ── Build sector summary ──
        const gainers = tickerSnapshots.filter(t => t.change_pct > 0).length;
        const losers = tickerSnapshots.filter(t => t.change_pct < 0).length;
        const avgAlpha = tickerSnapshots.reduce((sum, t) => sum + t.alpha_score, 0) / tickerSnapshots.length;
        const avgPcr = tickerSnapshots.reduce((sum, t) => sum + t.pcr, 0) / tickerSnapshots.length;
        const totalGex = tickerSnapshots.reduce((sum, t) => sum + t.gex, 0);

        const regimeCounts = { LONG: 0, SHORT: 0, NEUTRAL: 0 };
        tickerSnapshots.forEach(t => {
            if (t.gamma_regime in regimeCounts) {
                regimeCounts[t.gamma_regime as keyof typeof regimeCounts]++;
            }
        });
        const dominantRegime = regimeCounts.LONG >= regimeCounts.SHORT ? 'LONG' : 'SHORT';

        const outlook = avgPcr < 0.8 ? 'BULLISH' : avgPcr > 1.2 ? 'BEARISH' : 'NEUTRAL';

        const briefingResult = generateNextDayBriefing(tickerSnapshots, {
            dominantRegime, avgPcr, totalGex, gainers, losers, outlook
        });

        const sectorSummary: SectorSummary = {
            avg_alpha: Math.round(avgAlpha * 10) / 10,
            gainers,
            losers,
            dominant_regime: dominantRegime,
            avg_pcr: Math.round(avgPcr * 100) / 100,
            total_gex: totalGex,
            outlook,
            next_day_briefing_kr: briefingResult.legacy,
            briefing: briefingResult.briefing,
        };

        const snapshotData: SnapshotData = {
            meta: {
                snapshot_timestamp: now.toISOString(),
                sector,
                locked_until: nextClose.toISOString(),
            },
            tickers: tickerSnapshots,
            sector_summary: sectorSummary,
        };

        // ── Save to Supabase ──
        const result = await saveSnapshot(sector, snapshotDate, snapshotData);

        if (!result.success) {
            return NextResponse.json(
                { error: 'Failed to save snapshot', details: result.error },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            sector,
            snapshot_date: snapshotDate,
            tickers_count: tickerSnapshots.length,
            outlook: sectorSummary.outlook,
        });

    } catch (e: any) {
        console.error('[Snapshot API] POST error:', e);
        return NextResponse.json(
            { error: 'Failed to create snapshot', message: e.message },
            { status: 500 }
        );
    }
}

// ============================================================================
// AI Verdict Generation (rule-based, using available indicators)
// ============================================================================

function generateVerdict(q: any): string {
    const score = q.alphaScore || 0;
    const gex = q.gex || 0;
    const pcr = q.pcr || 1;
    const changePct = q.changePct || 0;

    // Strong signals
    if (score >= 70 && pcr < 0.7 && changePct > 1) return 'BUY_DIP';
    if (score < 30 && pcr > 1.3 && changePct < -1) return 'HEDGE';
    if (score >= 60 && gex < 0 && pcr < 0.8) return 'BUY_DIP';
    if (score < 40 && gex < 0 && pcr > 1.1) return 'TRIM';

    // Moderate signals
    if (changePct > 2 && pcr < 0.6) return 'TRIM';  // Overextended
    if (changePct < -2 && score >= 50) return 'BUY_DIP';  // Dip on strong stock

    return 'HOLD';
}

function generateAnalysisKR(q: any, verdict: string): string {
    const t = q.ticker;
    const gex = q.gex || 0;
    const pcr = q.pcr || 1;
    const regime = q.gammaRegime || 'NEUTRAL';
    const changePct = (q.changePct || 0).toFixed(2);
    const maxPain = q.maxPain || 0;
    const price = q.price || 0;
    const callWall = q.callWall || 0;
    const putFloor = q.putFloor || 0;

    const regimeKR = regime === 'LONG' ? 'Long Gamma(변동성 억제)' :
        regime === 'SHORT' ? 'Short Gamma(변동성 확대)' : '중립';

    const pcrKR = pcr < 0.7 ? '강세 포지셔닝' :
        pcr > 1.2 ? '약세 포지셔닝' : '균형 포지셔닝';

    const maxPainDist = maxPain > 0 ? ((price - maxPain) / maxPain * 100).toFixed(1) : '0';
    const maxPainDir = parseFloat(maxPainDist) > 0 ? '상단' : '하단';

    // Key level proximity
    let levelNote = '';
    if (callWall > 0 && price > 0) {
        const distToWall = ((callWall - price) / price * 100).toFixed(1);
        if (parseFloat(distToWall) < 2 && parseFloat(distToWall) > 0) {
            levelNote = ` Call Wall $${callWall} 근접(${distToWall}%), 돌파 시 감마스퀴즈 가능.`;
        }
    }
    if (putFloor > 0 && price > 0) {
        const distToFloor = ((price - putFloor) / price * 100).toFixed(1);
        if (parseFloat(distToFloor) < 2 && parseFloat(distToFloor) > 0) {
            levelNote = ` Put Floor $${putFloor} 근접(${distToFloor}%), 하방 지지 예상.`;
        }
    }

    const verdictKR: Record<string, string> = {
        'BUY_DIP': '조정 시 매수 기회',
        'HOLD': '보유 유지',
        'HEDGE': '헷지 권고',
        'TRIM': '일부 차익실현 고려',
    };

    return `${changePct > '0' ? '▲' : '▼'} ${changePct}%. ${regimeKR}. PCR ${pcr.toFixed(2)} (${pcrKR}). Max Pain $${maxPain} 대비 ${maxPainDir} ${Math.abs(parseFloat(maxPainDist))}% 마감.${levelNote} [${verdictKR[verdict] || verdict}]`;
}

function generateNextDayBriefing(
    tickers: TickerSnapshot[],
    summary: { dominantRegime: string; avgPcr: number; totalGex: number; gainers: number; losers: number; outlook: string }
): { legacy: string; briefing: { headline: string; bullets: string[]; watchpoints: string[] } } {
    const sorted = [...tickers].sort((a, b) => b.change_pct - a.change_pct);
    const topGainer = sorted[0];
    const topLoser = sorted[sorted.length - 1];

    const regimeKR = summary.dominantRegime === 'LONG' ? 'Long Gamma (변동성 억제)' : 'Short Gamma (변동성 확대 가능)';
    const outlookKR = summary.outlook === 'BULLISH' ? '강세 편향' : summary.outlook === 'BEARISH' ? '약세 편향' : '중립';

    const gammaCount = tickers.filter(t => t.gamma_regime === 'LONG').length;

    // ── Legacy string (backward compat) ──
    let legacy = `세션 결과: ${summary.gainers}↑ ${summary.losers}↓. `;
    legacy += `주도주 ${topGainer.ticker}(${topGainer.change_pct >= 0 ? '+' : ''}${topGainer.change_pct.toFixed(2)}%), `;
    legacy += `약세 ${topLoser.ticker}(${topLoser.change_pct.toFixed(2)}%). `;
    legacy += `감마 환경: ${gammaCount}/${tickers.length} ${regimeKR}. `;
    legacy += `PCR 평균 ${summary.avgPcr.toFixed(2)} → ${outlookKR}. `;

    // ── Structured briefing ──
    // Headline
    const allDown = summary.gainers === 0;
    const allUp = summary.losers === 0;
    let headline = '';
    if (allUp) {
        headline = `전 종목 상승 — ${topGainer.ticker} ${topGainer.change_pct >= 0 ? '+' : ''}${topGainer.change_pct.toFixed(2)}% 선도, 리스크 온 모드`;
    } else if (allDown) {
        headline = `전 종목 하락 — ${topLoser.ticker} ${topLoser.change_pct.toFixed(2)}% 최대 낙폭, 방어 전환 필요`;
    } else if (summary.gainers <= 2) {
        headline = `${topGainer.ticker} 주도 반등, 그러나 ${tickers.length}종 중 ${summary.losers}종 하락 — 변동성은 여전하다`;
    } else {
        headline = `${summary.gainers}종 상승 vs ${summary.losers}종 하락 — ${outlookKR} 장세, 선별적 접근 필요`;
    }

    // Bullets
    const bullets: string[] = [];
    // Bullet 1: Leader & Laggard
    if (topGainer.change_pct > 0) {
        bullets.push(`📈 주도주: <mark>${topGainer.ticker} ${topGainer.change_pct >= 0 ? '+' : ''}${topGainer.change_pct.toFixed(2)}%</mark>${summary.gainers === 1 ? ', 유일한 상승 종목' : ` 외 ${summary.gainers - 1}종 상승`}`);
    } else {
        bullets.push(`📉 전 종목 하락: 최소 낙폭 <mark>${topGainer.ticker} ${topGainer.change_pct.toFixed(2)}%</mark>`);
    }
    // Bullet 2: Gamma Regime
    const regimeEmoji = summary.dominantRegime === 'LONG' ? '🛡️' : '⚡';
    if (gammaCount === tickers.length) {
        bullets.push(`${regimeEmoji} 감마 환경: 전 종목 <mark>${summary.dominantRegime === 'LONG' ? 'Long Gamma' : 'Short Gamma'}</mark> — ${summary.dominantRegime === 'LONG' ? '변동성 억제 구간' : '변동성 확대 구간'}`);
    } else {
        bullets.push(`${regimeEmoji} 감마 환경: ${gammaCount}/${tickers.length} Long Gamma, <mark>${tickers.length - gammaCount}종 Short Gamma</mark> — 혼조세`);
    }
    // Bullet 3: PCR & Outlook
    const pcrEmoji = summary.avgPcr < 0.8 ? '🟢' : summary.avgPcr > 1.2 ? '🔴' : '🟡';
    bullets.push(`${pcrEmoji} PCR 평균 <mark>${summary.avgPcr.toFixed(2)}</mark> → ${outlookKR}. ${summary.avgPcr < 0.8 ? '콜 우위 — 상방 기대' : summary.avgPcr > 1.2 ? '풋 우위 — 하방 압력' : '옵션 시장 중립적 포지셔닝'}`);

    // Watchpoints
    const watchpoints: string[] = [];
    const nearCallWall = tickers.filter(t =>
        t.call_wall > 0 && t.close_price > 0 &&
        ((t.call_wall - t.close_price) / t.close_price * 100) < 3
    );
    nearCallWall.forEach(t => {
        const dist = ((t.call_wall - t.close_price) / t.close_price * 100).toFixed(1);
        watchpoints.push(`🎯 ${t.ticker} Call Wall $${t.call_wall} 근접 (${dist}%), 돌파 시 감마 스퀴즈 가능`);
    });

    const nearPutFloor = tickers.filter(t =>
        t.put_floor > 0 && t.close_price > 0 &&
        ((t.close_price - t.put_floor) / t.close_price * 100) < 3
    );
    nearPutFloor.forEach(t => {
        const dist = ((t.close_price - t.put_floor) / t.close_price * 100).toFixed(1);
        watchpoints.push(`🛡️ ${t.ticker} Put Floor $${t.put_floor} 근접 (${dist}%), 하방 지지 예상`);
    });

    if (watchpoints.length === 0) {
        watchpoints.push(`📊 주요 옵션 레벨 근접 종목 없음 — 레인지 내 등락 예상`);
    }

    // Legacy string watchpoints
    if (nearCallWall.length > 0) {
        legacy += `관전 포인트: ${nearCallWall.map(t => `${t.ticker} Call Wall $${t.call_wall} 근접`).join(', ')}.`;
    }

    return { legacy, briefing: { headline, bullets, watchpoints } };
}

