'use client';

/**
 * 실물경제 지표 스트립 — 고용·물가·정책금리·소비심리.
 *
 * 왜 «가격 스트립»과 섞지 않는가:
 *   위 매크로 카드(VIX·SPX·NDX·F&G)는 초 단위로 변하는 실시간 값이다.
 *   이 블록은 «월간·분기간» 관측이다. 같은 줄에 놓으면 사용자가 CPI 를
 *   오늘 값으로 읽는다. 그래서 블록을 나누고, 각 값에 관측일을 붙인다.
 *   날짜 없는 거시지표는 거짓말이 된다.
 */
import { useEffect, useState } from 'react';

type Trend = 'UP' | 'DOWN' | 'FLAT';
type Cadence = 'daily' | 'monthly' | 'quarterly';

interface Metric {
    key: string;
    label: { en: string; ko: string; ja: string };
    value: number;
    unit: 'percent' | 'index' | 'thousands' | 'billions';
    asOf: string;
    change: number | null;
    trend: Trend;
    cadence: Cadence;
}

const COPY = {
    ko: { title: '실물경제', sub: '가격이 아니라 «왜»를 보는 축', asOf: '기준', none: '지표를 불러오지 못했습니다' },
    en: { title: 'REAL ECONOMY', sub: 'The why behind the price', asOf: 'as of', none: 'Indicators unavailable' },
    ja: { title: '実体経済', sub: '価格ではなく「なぜ」を見る軸', asOf: '基準', none: '指標を取得できませんでした' },
} as const;

function fmt(m: Metric): string {
    if (m.unit === 'percent') return `${m.value.toFixed(m.key === 'curve10y2y' || m.key === 'fedFunds' ? 2 : 1)}%`;
    if (m.unit === 'thousands') return `${m.value >= 0 ? '+' : ''}${m.value.toLocaleString()}K`;
    return m.value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function fmtChange(m: Metric): string | null {
    if (m.change == null) return null;
    // 변화가 0 이면 아무것도 찍지 않는다. «· +0» 은 정보가 아니라 소음이다.
    if (m.change === 0) return null;
    if (m.unit === 'thousands') return `${m.change >= 0 ? '+' : ''}${m.change.toLocaleString()}K`;
    return `${m.change >= 0 ? '+' : ''}${m.change.toFixed(2).replace(/\.?0+$/, '') || '0'}`;
}

/** 방향에 색을 입히지 않는다 — 실업률 상승과 고용 상승은 뜻이 정반대다.
 *  판정은 사용자 몫으로 두고, 우리는 «변화의 방향»만 중립색으로 보여준다. */
const TREND_MARK: Record<Trend, string> = { UP: '▲', DOWN: '▼', FLAT: '·' };

export default function MacroEconomyStrip({ locale = 'en' }: { locale?: 'ko' | 'en' | 'ja' }) {
    const [metrics, setMetrics] = useState<Metric[] | null>(null);
    const [failed, setFailed] = useState(false);
    const t = COPY[locale] || COPY.en;

    useEffect(() => {
        let alive = true;
        fetch('/api/market/economy')
            .then((r) => r.json())
            .then((j) => { if (alive) { if (Array.isArray(j?.metrics) && j.metrics.length) setMetrics(j.metrics); else setFailed(true); } })
            .catch(() => { if (alive) setFailed(true); });
        return () => { alive = false; };
    }, []);

    // 실패했으면 «조용히» 빠진다 — 빈 껍데기를 그리면 사용자는 0 으로 읽는다
    if (failed || (metrics && metrics.length === 0)) return null;

    return (
        <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 7 }}>
                <span style={{ font: "900 10px/1 'Inter'", letterSpacing: '0.10em', color: '#22d3ee', textTransform: 'uppercase' }}>
                    {t.title}
                </span>
                <span style={{ font: "600 9.5px/1 'Inter'", color: 'var(--app-lbl-aux)' }}>{t.sub}</span>
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 5,
                padding: 4,
                borderRadius: 14,
                border: '1px solid transparent',
                background: 'rgba(2,6,23,0.38)',
            }}>
                {(metrics || Array.from({ length: 6 }).map(() => null)).map((m, i) => (
                    <div key={m ? m.key : `sk-${i}`} style={{
                        minWidth: 0,
                        padding: '8px 9px',
                        borderRadius: 10,
                        border: '1px solid transparent',
                        background: 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(15,23,42,0.30))',
                    }}>
                        {m ? (
                            <>
                                <div style={{
                                    font: "800 8.5px/1.15 'Inter'", color: 'var(--text-dim)',
                                    letterSpacing: '0.03em', textTransform: 'uppercase',
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                }}>
                                    {m.label[locale] || m.label.en}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 3 }}>
                                    <span className="tnum" style={{ font: "950 15px/1 'Inter'", color: 'var(--app-lbl-signal)' }}>
                                        {fmt(m)}
                                    </span>
                                    {fmtChange(m) && (
                                        <span className="tnum" style={{ font: "800 9.5px/1 'Inter'", color: 'var(--app-lbl-aux)' }}>
                                            {TREND_MARK[m.trend]} {fmtChange(m)}
                                        </span>
                                    )}
                                </div>
                                <div style={{ marginTop: 3, font: "700 8px/1 'Inter'", color: 'var(--app-lbl-aux)' }}>
                                    {t.asOf} {m.asOf}
                                </div>
                            </>
                        ) : (
                            <div className="app-skeleton" style={{ height: 34, borderRadius: 7 }} />
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
