'use client';

import { useState } from 'react';
import './marketing-console.css';

// ============================================================================
// Marketing Console shell (Phase 1) — Donezo light theme, 6 tabs.
// Standalone: shares no components with the SIGNUM dark app.
// Tabs are scaffolded; engines (generation/X/Reddit/metrics) wire in later phases.
// ============================================================================

type TabKey = 'today' | 'generate' | 'x' | 'reddit' | 'metrics' | 'assets';

interface TabDef {
  key: TabKey;
  label: string;
  badge?: string;
}

const TABS: TabDef[] = [
  { key: 'today', label: 'Today' },
  { key: 'generate', label: 'Generate' },
  { key: 'x', label: 'X Ops' },
  { key: 'reddit', label: 'Reddit' },
  { key: 'metrics', label: 'Metrics' },
  { key: 'assets', label: 'Assets' },
];

const TAB_META: Record<TabKey, { title: string; sub: string }> = {
  today: { title: 'Today', sub: 'Detected events, drafts awaiting approval, volume caps, deadman.' },
  generate: { title: 'Generate', sub: 'Capture → read numbers → per-channel native drafts + cards.' },
  x: { title: 'X Ops', sub: 'Reply targets, draft queue, publish, reply inbox — @signumhq / @signumhq_jp.' },
  reddit: { title: 'Reddit', sub: 'Thread discovery, value-comment drafts, karma & account-age tracking.' },
  metrics: { title: 'Metrics', sub: 'Cold-start funnel: replies, profile clicks, follower delta — not raw views.' },
  assets: { title: 'Assets', sub: 'VERDICT scoreboard, post cards, pSEO level pages, account status.' },
};

export default function MarketingConsole({ adminEmail }: { adminEmail: string }) {
  const [tab, setTab] = useState<TabKey>('today');
  const initial = (adminEmail[0] || 'S').toUpperCase();

  return (
    <div className="mkc-root">
      {/* Sidebar */}
      <aside className="mkc-side">
        <div className="mkc-logo">
          <span className="mkc-logo-dot" />
          SIGNUM MKT
        </div>

        <div className="mkc-side-label">CONSOLE</div>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`mkc-nav-btn${tab === t.key ? ' is-active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.badge ? <span className="mkc-nav-badge">{t.badge}</span> : null}
          </button>
        ))}

        <div className="mkc-side-promo">
          <strong>Draft-only pipeline</strong>
          <span className="mkc-promo-note">
            Publishing is always a human click. No automated posting loop exists in this console.
          </span>
        </div>
      </aside>

      {/* Main */}
      <div className="mkc-main">
        <header className="mkc-topbar">
          <input className="mkc-search" placeholder="Search tickers, drafts, threads…" />
          <div className="mkc-top-right">
            <div className="mkc-admin-chip">
              <span className="mkc-avatar">{initial}</span>
              {adminEmail}
            </div>
          </div>
        </header>

        <main className="mkc-content">
          <div className="mkc-head-row">
            <div>
              <h1 className="mkc-h1">{TAB_META[tab].title}</h1>
              <p className="mkc-sub">{TAB_META[tab].sub}</p>
            </div>
            <div className="mkc-head-actions">
              <button className="mkc-btn mkc-btn-primary">+ New draft</button>
              <button className="mkc-btn mkc-btn-ghost">Refresh</button>
            </div>
          </div>

          {tab === 'today' ? <TodayTab /> : <PhasePlaceholder tab={tab} />}
        </main>
      </div>
    </div>
  );
}

/* ---- Today (home) — static scaffold; live data wires in Phase 4/5 -------- */
function TodayTab() {
  return (
    <>
      <div className="mkc-kpis">
        <div className="mkc-kpi is-hero">
          <span className="mkc-kpi-label">Volume cap · X-US</span>
          <span className="mkc-kpi-value">0 / 3</span>
          <span className="mkc-kpi-note">Hard cap 3/day — never raised on bad performance</span>
        </div>
        <div className="mkc-kpi">
          <span className="mkc-kpi-label">Drafts awaiting approval</span>
          <span className="mkc-kpi-value">—</span>
          <span className="mkc-kpi-note">Wires in Phase 2</span>
        </div>
        <div className="mkc-kpi">
          <span className="mkc-kpi-label">Detected events</span>
          <span className="mkc-kpi-value">—</span>
          <span className="mkc-kpi-note">Event cron — Phase 5</span>
        </div>
        <div className="mkc-kpi">
          <span className="mkc-kpi-label">Attribution hits (?from=)</span>
          <span className="mkc-kpi-value">—</span>
          <span className="mkc-kpi-note">/app patch — Phase 3</span>
        </div>
      </div>

      <div className="mkc-grid">
        <div className="mkc-panel">
          <h3 className="mkc-panel-title">Action queue</h3>
          <p className="mkc-panel-sub">Drafts to approve, in priority order</p>
          <div className="mkc-todo">
            <strong>Generation engine — Phase 2</strong>
            Capture → Bedrock read → 4-channel drafts land here for one-click approve.
          </div>
        </div>

        <div className="mkc-panel">
          <h3 className="mkc-panel-title">Deadman &amp; guardrails</h3>
          <p className="mkc-panel-sub">Safety state</p>
          <div className="mkc-row">
            <span className="grow">Auto-publish path</span>
            <span className="mkc-pill g">None (draft-only)</span>
          </div>
          <div className="mkc-row">
            <span className="grow">Persona UI</span>
            <span className="mkc-pill g">Absent</span>
          </div>
          <div className="mkc-row">
            <span className="grow">Deadman (2wk floor)</span>
            <span className="mkc-pill n">Not tracking yet</span>
          </div>
          <div className="mkc-row">
            <span className="grow">Audit log</span>
            <span className="mkc-pill n">Phase 3</span>
          </div>
        </div>

        <div className="mkc-panel is-dark">
          <h3 className="mkc-panel-title">Reply timer</h3>
          <p className="mkc-panel-sub">60-min window after you publish</p>
          <div className="mkc-timer">--:--:--</div>
          <span className="mkc-muted" style={{ color: '#9db3a6', fontSize: 12 }}>
            Starts when a post is marked published (Phase 3).
          </span>
        </div>
      </div>
    </>
  );
}

function PhasePlaceholder({ tab }: { tab: TabKey }) {
  const notes: Record<Exclude<TabKey, 'today'>, string> = {
    generate: 'Phase 2 — upload a capture (or pick a ticker); Bedrock reads the numbers and writes Toss / Stocktwits / X-en / X-ja drafts with lint chips.',
    x: 'Phase 3 — scan target accounts, per-post data reply drafts, one-click publish via X API, own-post reply inbox.',
    reddit: 'Phase 4 — discover threads our data answers, value-comment drafts (rewrite required), karma & account-age tracker.',
    metrics: 'Phase 4 — cold-start funnel: replies/day, profile clicks, follower delta, ?from= hits. Views are deliberately NOT the hero metric.',
    assets: 'Phase 5 — VERDICT scoreboard, the 4 post cards, pSEO level pages, account badge / downgrade D-day.',
  };
  return (
    <div className="mkc-panel" style={{ maxWidth: 720 }}>
      <h3 className="mkc-panel-title">Coming in a later phase</h3>
      <div className="mkc-todo" style={{ marginTop: 12 }}>
        <strong>{TAB_META[tab].title}</strong>
        {notes[tab as Exclude<TabKey, 'today'>]}
      </div>
    </div>
  );
}
