'use client';

/**
 * 실물경제 지표 스트립 — 고용·물가·정책금리·소비심리.
 *
 * [왜 «가격 스트립»과 섞지 않는가]
 *   위 리스크 스트립(VIX·SPX·NDX·F&G)은 초 단위로 변하는 실시간 값이다.
 *   이 블록은 «월간·분기간» 관측이다. 같은 줄에 놓으면 사용자가 CPI 를
 *   오늘 값으로 읽는다. 그래서 블록을 나누고, 값마다 관측일을 붙인다.
 *
 * [2026-09-14 재설계 — 대표 지적 3건]
 *   ① 「전부 왼쪽으로 몰려 있다」
 *      → 카드 격자를 버리고 «라벨 왼쪽 / 숫자 오른쪽» 정렬 행으로 바꿨다.
 *        숫자가 한 열에 세로로 정렬되면 눈이 훑는다. tabular-nums 로 자릿수를 고정한다.
 *   ② 「상승·하락 강조가 없다. 너무 밋밋하다」
 *      → 색을 넣되 «올랐다=초록»이 아니다. 실업률 상승과 고용 상승은 뜻이 정반대라서
 *        지표마다 `favorable`(어느 쪽이 우호적인가)을 선언하게 하고 그걸로 색을 정한다.
 *        방향을 모르는 지표(정책금리)는 중립색으로 둔다 — 지어낸 판정을 하지 않는다.
 *   ③ 「공간을 너무 크게 쓴다」
 *      → 2열 카드를 한 줄 목록으로 바꾸고 행 높이를 조였다.
 *        실측(375px 뷰포트 · getBoundingClientRect): 재설계 전 약 252px → 후 205px.
 *        ※ 처음엔 «60% 줄였다»고 썼고 다음엔 «190px»이라 썼는데 둘 다 재지 않은 숫자였다.
 *          공간 절약은 약 19%다. 진짜 개선은 크기가 아니라 «훑을 수 있게 된 것»이고,
 *          숫자를 쓸 때는 재고 쓴다.
 *   ④ 「주목해야 할 것은 강조해달라」
 *      → 임계값을 넘은 지표만 맨 위로 끌어올리고 이유를 한 줄로 쓴다.
 *        (커브 역전 · CPI 3% 상회 · 실업률 급등 · 고용 감소 · 역성장)
 *        평상시에는 강조가 하나도 안 뜬다 — 그게 정상이고, 그래야 뜰 때 의미가 생긴다.
 */
import { useEffect, useState } from 'react';

type Trend = 'UP' | 'DOWN' | 'FLAT';
type Favorable = 'up' | 'down' | 'neutral';

interface Metric {
    key: string;
    label: { en: string; ko: string; ja: string };
    value: number;
    unit: 'percent' | 'index' | 'thousands' | 'billions';
    asOf: string;
    change: number | null;
    trend: Trend;
    favorable: Favorable;
    watch: { on: boolean; reason: { en: string; ko: string; ja: string } } | null;
    cadence: 'daily' | 'monthly' | 'quarterly';
}

const COPY = {
    ko: { title: '실물경제', sub: '가격이 말하지 않는 «왜»', source: '출처', watch: '주목' },
    en: { title: 'REAL ECONOMY', sub: 'The why behind the price', source: 'Source', watch: 'WATCH' },
    ja: { title: '実体経済', sub: '価格が語らない「なぜ」', source: '出典', watch: '注目' },
} as const;

const GOOD = 'var(--green)';
const BAD = 'var(--red)';
const NEUTRAL = 'var(--app-lbl-aux)';

/** 변화의 «의미»로 색을 정한다. 방향 자체로 정하지 않는다. */
function changeColor(m: Metric): string {
    if (m.change == null || m.change === 0 || m.trend === 'FLAT') return NEUTRAL;
    if (m.favorable === 'neutral') return NEUTRAL;
    const rising = m.change > 0;
    const good = m.favorable === 'up' ? rising : !rising;
    return good ? GOOD : BAD;
}

function fmtValue(m: Metric): string {
    if (m.unit === 'percent') {
        const d = m.key === 'curve10y2y' || m.key === 'fedFunds' ? 2 : 1;
        return `${m.value.toFixed(d)}%`;
    }
    if (m.unit === 'thousands') return `${m.value >= 0 ? '+' : ''}${m.value.toLocaleString()}K`;
    return m.value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function fmtChange(m: Metric): string | null {
    if (m.change == null || m.change === 0) return null;   // «+0» 은 정보가 아니라 소음이다
    const arrow = m.change > 0 ? '▲' : '▼';
    const abs = Math.abs(m.change);
    if (m.unit === 'thousands') return `${arrow}${abs.toLocaleString()}K`;
    return `${arrow}${abs.toFixed(2).replace(/\.?0+$/, '')}`;
}

/** 2026-08-01 → 08-01 (연도는 반복이라 버린다. 공간이 곧 정보다) */
const shortDate = (d: string) => (d.length >= 10 ? d.slice(5) : d);

export default function MacroEconomyStrip({ locale = 'en' }: { locale?: 'ko' | 'en' | 'ja' }) {
    const [metrics, setMetrics] = useState<Metric[] | null>(null);
    const [attribution, setAttribution] = useState<string>('');
    const [failed, setFailed] = useState(false);
    const t = COPY[locale] || COPY.en;

    useEffect(() => {
        let alive = true;
        fetch('/api/market/economy')
            .then((r) => r.json())
            .then((j) => {
                if (!alive) return;
                if (Array.isArray(j?.metrics) && j.metrics.length) {
                    setMetrics(j.metrics);
                    setAttribution(String(j.attribution || ''));
                } else setFailed(true);
            })
            .catch(() => { if (alive) setFailed(true); });
        return () => { alive = false; };
    }, []);

    // 실패하면 조용히 빠진다 — 빈 껍데기를 그리면 사용자는 0 으로 읽는다
    if (failed) return null;

    const watched = (metrics || []).filter((m) => m.watch?.on);
    const rest = (metrics || []).filter((m) => !m.watch?.on);

    const Row = ({ m, hi }: { m: Metric; hi: boolean }) => {
        const cc = changeColor(m);
        const chg = fmtChange(m);
        return (
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: hi ? '6px 9px' : '3.5px 9px',
                borderRadius: hi ? 9 : 0,
                borderLeft: hi ? '2px solid var(--amber)' : '2px solid transparent',
                background: hi ? 'linear-gradient(90deg, rgba(245,158,11,0.10), rgba(15,23,42,0.20))' : 'transparent',
            }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{
                        font: `${hi ? 800 : 700} 9.5px/1.2 'Inter'`,
                        color: hi ? 'var(--amber)' : 'var(--app-lbl-anchor)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                        {m.label[locale] || m.label.en}
                    </div>
                    {hi && m.watch && (
                        <div style={{ marginTop: 2, font: "600 9px/1.15 'Inter'", color: 'var(--app-lbl-aux)' }}>
                            {m.watch.reason[locale] || m.watch.reason.en}
                        </div>
                    )}
                </div>

                {/* 숫자는 오른쪽에 «한 열»로 세운다 — 눈이 세로로 훑을 수 있어야 한다 */}
                <span className="tnum" style={{
                    font: `950 ${hi ? 14.5 : 13}px/1 'Inter'`,
                    color: 'var(--app-lbl-signal)',
                    minWidth: 58, textAlign: 'right',
                }}>
                    {fmtValue(m)}
                </span>
                <span className="tnum" style={{
                    font: "800 9.5px/1 'Inter'", color: cc,
                    minWidth: 46, textAlign: 'right',
                }}>
                    {chg || ''}
                </span>
                <span className="tnum" style={{
                    font: "700 8.5px/1 'Inter'", color: 'var(--app-lbl-aux)',
                    minWidth: 34, textAlign: 'right',
                }}>
                    {shortDate(m.asOf)}
                </span>
            </div>
        );
    };

    return (
        <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, marginBottom: 5, flexWrap: 'wrap' }}>
                <span style={{ font: "900 10px/1 'Inter'", letterSpacing: '0.10em', color: '#22d3ee', textTransform: 'uppercase' }}>
                    {t.title}
                </span>
                <span style={{ font: "600 9px/1 'Inter'", color: 'var(--app-lbl-aux)' }}>{t.sub}</span>
                {watched.length > 0 && (
                    <span style={{
                        marginLeft: 'auto',
                        font: "900 8.5px/1 'Inter'", letterSpacing: '0.06em',
                        color: 'var(--amber)', background: 'rgba(245,158,11,0.12)',
                        border: '1px solid rgba(245,158,11,0.30)',
                        borderRadius: 999, padding: '3px 7px',
                    }}>
                        {t.watch} {watched.length}
                    </span>
                )}
            </div>

            <div style={{
                borderRadius: 12,
                border: '1px solid transparent',
                background: 'rgba(2,6,23,0.38)',
                padding: 4,
            }}>
                {metrics == null
                    ? Array.from({ length: 4 }).map((_, i) => (
                        <div key={`sk-${i}`} className="app-skeleton" style={{ height: 16, margin: '4px 9px', borderRadius: 5 }} />
                    ))
                    : (
                        <>
                            {watched.map((m) => <Row key={m.key} m={m} hi />)}
                            {watched.length > 0 && rest.length > 0 && (
                                <div style={{ height: 1, margin: '3px 9px', background: 'rgba(255,255,255,0.06)' }} />
                            )}
                            {rest.map((m) => <Row key={m.key} m={m} hi={false} />)}
                        </>
                    )}
            </div>

            {attribution && (
                <div style={{ marginTop: 3, font: "700 7.5px/1 'Inter'", color: 'var(--app-lbl-aux)', textAlign: 'right' }}>
                    {t.source}: {attribution}
                </div>
            )}
        </div>
    );
}
