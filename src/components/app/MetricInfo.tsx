'use client';

// ============================================================================
// MetricInfo — a reusable, noticeable info affordance for app metric labels.
// Cyan glowing "i" button (GEX-style) that opens a centered popup explaining the
// metric in the user's language. Drop next to any label:
//
//   <MetricInfo term="gex" locale={locale} />
//
// Centered popup is portaled to <body> so no ancestor transform can trap it, and
// it deliberately never touches the native AdMob banner (centered = no overlap).
// App-only component — web product pages never import it.
// ============================================================================

import { useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { METRIC_GLOSSARY, CLOSE_LABEL, type Lang, type MetricTerm } from './metricGlossary';

function pick<T>(rec: Record<Lang, T>, locale: string): T {
  return rec[(locale as Lang)] ?? rec.en;
}

export function MetricInfo({
  term,
  locale = 'en',
  size = 16,
}: {
  term: MetricTerm;
  locale?: string;
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  const entry = METRIC_GLOSSARY[term];
  if (!entry) return null;

  const title = pick(entry.title, locale);
  const body = pick(entry.body, locale);
  const close = pick(CLOSE_LABEL, locale);

  return (
    <>
      <button
        type="button"
        aria-label={title}
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        style={{
          width: size, height: size, borderRadius: '50%', flex: '0 0 auto', padding: 0,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: Math.round(size * 0.62), fontWeight: 800, fontStyle: 'italic', lineHeight: 1,
          cursor: 'pointer', verticalAlign: 'middle',
          color: open ? '#06121a' : 'var(--cyan)',
          background: open ? 'var(--cyan)' : 'var(--cyan-dim)',
          border: '1px solid var(--cyan)',
          boxShadow: 'var(--glow-cyan)',
        }}
      >
        i
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div style={overlay} onClick={() => setOpen(false)} role="dialog" aria-modal="true">
          <style>{`@keyframes miPop{from{opacity:0;transform:scale(0.92)}to{opacity:1;transform:scale(1)}}@keyframes miFade{from{opacity:0}to{opacity:1}}`}</style>
          <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
            <div style={titleStyle}>{title}</div>
            <div style={bodyStyle}>{body}</div>
            <button type="button" style={closeStyle} onClick={() => setOpen(false)}>{close}</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

const overlay: CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 9999,
  background: 'rgba(2,6,16,0.6)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 22,
  animation: 'miFade 0.18s ease',
};
const cardStyle: CSSProperties = {
  width: '100%', maxWidth: 380, background: 'var(--bg-elev)', borderRadius: 20,
  border: '1px solid var(--border-strong)', padding: '18px 20px',
  boxShadow: '0 20px 60px rgba(0,0,0,0.6)', animation: 'miPop 0.22s cubic-bezier(0.34,1.4,0.5,1)',
};
const titleStyle: CSSProperties = { fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 8 };
const bodyStyle: CSSProperties = { fontSize: 13, lineHeight: 1.65, color: 'var(--text-dim)' };
const closeStyle: CSSProperties = {
  marginTop: 18, width: '100%', padding: 12, borderRadius: 12,
  background: 'var(--cyan-dim)', color: 'var(--cyan)', border: '1px solid var(--cyan)',
  fontSize: 13, fontWeight: 700, cursor: 'pointer',
};

export default MetricInfo;
