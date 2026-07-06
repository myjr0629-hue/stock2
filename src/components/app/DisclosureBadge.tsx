'use client';

// ============================================================================
// DisclosureBadge — 8-K material disclosure affordance for ticker views.
// Fetches /api/stocks/disclosures?t=X (empty for ETFs / no events → renders
// NOTHING, so it can sit in empty space without ever distorting layout).
//
//   variant="badge" (Command): one slim pill for the most recent high-impact
//     event within 7 days. Tap → centered popup (MetricInfo pattern).
//   variant="strip" (Intel): up to 3 compact rows from the last 90 days.
//
// Popup lists events with AI one-line summary + SEC source link.
// ============================================================================

import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';

type Loc = 'ko' | 'en' | 'ja';
interface DiscEvent {
    date: string; url: string; primary: string; tertiary: string; highImpact: boolean;
    label: Record<Loc, string>; summary: Record<Loc, string>;
}

const T = {
    title: { ko: '중대 공시 (8-K)', en: 'MATERIAL DISCLOSURES (8-K)', ja: '重要開示 (8-K)' },
    source: { ko: 'SEC 원문', en: 'SEC Filing', ja: 'SEC原文' },
    close: { ko: '닫기', en: 'Close', ja: '閉じる' },
    disclosure: { ko: '공시', en: 'FILING', ja: '開示' },
};
const pick = (rec: Record<Loc, string>, l: string) => rec[(l as Loc)] ?? rec.en;

// Module-level cache: one fetch per ticker per page lifetime
const _cache = new Map<string, Promise<DiscEvent[]>>();
function fetchEvents(ticker: string): Promise<DiscEvent[]> {
    if (!_cache.has(ticker)) {
        _cache.set(ticker, fetch(`/api/stocks/disclosures?t=${ticker}`)
            .then(r => r.ok ? r.json() : { events: [] })
            .then(j => Array.isArray(j?.events) ? j.events : [])
            .catch(() => []));
    }
    return _cache.get(ticker)!;
}

function fmtDate(d: string, locale: string): string {
    const [, m, day] = d.split('-');
    if (locale === 'en') return `${Number(m)}/${Number(day)}`;
    return `${Number(m)}/${Number(day)}`;
}

function daysSince(d: string): number {
    return Math.floor((Date.now() - new Date(d + 'T00:00:00Z').getTime()) / 86400000);
}

export function DisclosureBadge({ ticker, locale = 'en', variant }: {
    ticker: string; locale?: string; variant: 'badge' | 'strip';
}) {
    const [events, setEvents] = useState<DiscEvent[]>([]);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        let alive = true;
        setEvents([]);
        if (ticker) fetchEvents(ticker.toUpperCase()).then(ev => { if (alive) setEvents(ev); });
        return () => { alive = false; };
    }, [ticker]);

    const shown = variant === 'badge'
        ? events.filter(e => e.highImpact && daysSince(e.date) <= 7).slice(0, 1)
        : events.slice(0, 3);

    if (shown.length === 0) return null;

    const popup = open && typeof document !== 'undefined' && createPortal(
        <div style={overlay} onClick={() => setOpen(false)} role="dialog" aria-modal="true">
            <style>{`@keyframes dbPop{from{opacity:0;transform:scale(0.92)}to{opacity:1;transform:scale(1)}}@keyframes dbFade{from{opacity:0}to{opacity:1}}`}</style>
            <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
                <div style={titleStyle}>{ticker.toUpperCase()} · {pick(T.title, locale)}</div>
                <div style={{ maxHeight: '52vh', overflowY: 'auto' }}>
                    {events.map((e, i) => (
                        <div key={i} style={{ padding: '10px 0', borderBottom: i < events.length - 1 ? '1px solid rgba(148,163,184,0.12)' : 'none' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-dim)' }}>{e.date}</span>
                                <span style={{
                                    fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
                                    color: e.highImpact ? '#fbbf24' : 'var(--cyan)',
                                    background: e.highImpact ? 'rgba(251,191,36,0.10)' : 'var(--cyan-dim)',
                                    border: `1px solid ${e.highImpact ? 'rgba(251,191,36,0.35)' : 'var(--cyan)'}`,
                                }}>{pick(e.label, locale)}</span>
                            </div>
                            <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text)' }}>{pick(e.summary, locale)}</div>
                            {e.url && (
                                <a href={e.url} target="_blank" rel="noopener noreferrer"
                                   style={{ fontSize: 11, color: 'var(--text-dim)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                                    {pick(T.source, locale)} ↗
                                </a>
                            )}
                        </div>
                    ))}
                </div>
                <button type="button" style={closeStyle} onClick={() => setOpen(false)}>{pick(T.close, locale)}</button>
            </div>
        </div>,
        document.body,
    );

    if (variant === 'badge') {
        const e = shown[0];
        return (
            <>
                <button type="button" onClick={() => setOpen(true)} style={badgePill}>
                    <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: '#fbbf24' }}>{pick(T.disclosure, locale)}</span>
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-dim)', flexShrink: 0 }}>{fmtDate(e.date, locale)}</span>
                    <span style={{
                        fontSize: 11, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap', minWidth: 0, flex: 1, textAlign: 'left',
                    }}>{pick(e.summary, locale)}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-dim)', flexShrink: 0 }}>›</span>
                </button>
                {popup}
            </>
        );
    }

    // strip (Intel)
    return (
        <>
            <button type="button" onClick={() => setOpen(true)} style={stripBox}>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', color: 'var(--text-dim)', marginBottom: 6 }}>
                    {pick(T.title, locale)}
                </div>
                {shown.map((e, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', minWidth: 0 }}>
                        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-dim)', flexShrink: 0 }}>{fmtDate(e.date, locale)}</span>
                        <span style={{
                            fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 999, flexShrink: 0,
                            color: e.highImpact ? '#fbbf24' : 'var(--cyan)',
                            background: e.highImpact ? 'rgba(251,191,36,0.10)' : 'var(--cyan-dim)',
                        }}>{pick(e.label, locale)}</span>
                        <span style={{ fontSize: 11, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                            {pick(e.summary, locale)}
                        </span>
                    </div>
                ))}
            </button>
            {popup}
        </>
    );
}

const badgePill: CSSProperties = {
    appearance: 'none', WebkitAppearance: 'none', boxSizing: 'border-box',
    display: 'flex', alignItems: 'center', gap: 7, width: '100%', minWidth: 0,
    padding: '7px 11px', margin: '8px 0 0 0', borderRadius: 11, cursor: 'pointer',
    background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.22)',
    // The cmd hero card has absolutely-positioned decorative layers (sparkline bg)
    // that swallow taps — lift the badge above them.
    position: 'relative', zIndex: 5,
};
const stripBox: CSSProperties = {
    appearance: 'none', WebkitAppearance: 'none', boxSizing: 'border-box',
    display: 'block', width: '100%', minWidth: 0, textAlign: 'left',
    padding: '9px 12px', margin: '10px 0 0 0', borderRadius: 12, cursor: 'pointer',
    background: 'rgba(148,163,184,0.04)', border: '1px solid rgba(148,163,184,0.14)',
};
const overlay: CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(2,6,16,0.6)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 22,
    animation: 'dbFade 0.18s ease',
};
const cardStyle: CSSProperties = {
    width: '100%', maxWidth: 400, background: 'var(--bg-elev, #0b1220)', borderRadius: 20,
    border: '1px solid var(--border-strong, rgba(148,163,184,0.25))', padding: '18px 20px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.6)', animation: 'dbPop 0.22s cubic-bezier(0.34,1.4,0.5,1)',
};
const titleStyle: CSSProperties = { fontSize: 13, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text)', marginBottom: 6 };
const closeStyle: CSSProperties = {
    marginTop: 14, width: '100%', padding: 12, borderRadius: 12,
    background: 'var(--cyan-dim, rgba(34,211,238,0.12))', color: 'var(--cyan, #22d3ee)',
    border: '1px solid var(--cyan, #22d3ee)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
};

export default DisclosureBadge;
