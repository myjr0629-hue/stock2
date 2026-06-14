/* global React, ReactDOM, IOSDevice */
/* App v2 shell — 5 working tabs (real AppBottomNav structure) + global 1hr unlock */
const { useState, useEffect } = React;
const { DashV2, GuardianV2, FlowV2, IntelV2, CmdV2Screen, RewardModal2 } = window;

/* icons — 1:1 from stock2 AppBottomNav.tsx */
function NavIcon({ name }) {
  switch (name) {
    case 'dashboard': return (<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M3 13h6V3H3v10Zm0 8h6v-6H3v6Zm8 0h10V11H11v10Zm0-18v6h10V3H11Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>);
    case 'guardian': return (<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5"/></svg>);
    case 'command': return (<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.7"/><path d="m7 9 3 3-3 3M13 15h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>);
    case 'flow': return (<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M3 12c2.5 0 2.5-6 5-6s2.5 12 5 12 2.5-9 5-9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>);
    case 'intel': return (<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7"/><path d="M12 12 19 5M12 3v3M12 18v3M3 12h3M18 12h3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>);
    default: return null;
  }
}

/* real nav structure from stock2/src/components/app/AppBottomNav.tsx */
const NAV_TABS = [
  { id: 'dash',     label: 'Dashboard', icon: 'dashboard' },
  { id: 'guardian', label: 'Guardian',  icon: 'guardian' },
  { id: 'cmd',      label: 'Command',   icon: 'command' },
  { id: 'flow',     label: 'Flow',      icon: 'flow' },
  { id: 'intel',    label: 'Intel',     icon: 'intel' },
];

function AppV2({ device }) {
  const [tab, setTab] = useState(() => localStorage.getItem('signum.v2.tab') || 'dash');
  const [showAd, setShowAd] = useState(false);
  /* global unlock — shared across ALL tabs (REVIEW.md §1-3) */
  const [unlocked, setUnlocked] = useState(false);
  const openAd = () => setShowAd(true);

  useEffect(() => { localStorage.setItem('signum.v2.tab', tab); }, [tab]);

  /* 손맛: 모든 버튼 터치에 햄틱 (Android Chrome 실제 진동, 미지원 환경 no-op) */
  const haptic = e => { if (e.target.closest('button') && navigator.vibrate) navigator.vibrate(6); };

  return (
    <div className={'viewport' + (device === 'andr' ? ' andr' : '')} onClickCapture={haptic}>
      {tab === 'dash' && <DashV2 unlocked={unlocked} openAd={openAd} />}
      {tab === 'guardian' && <GuardianV2 unlocked={unlocked} openAd={openAd} />}
      {tab === 'cmd' && <CmdV2Screen unlocked={unlocked} openAd={openAd} />}
      {tab === 'flow' && <FlowV2 unlocked={unlocked} openAd={openAd} />}
      {tab === 'intel' && <IntelV2 />}

      <nav className="tabbar five">
        {NAV_TABS.map(t => (
          <button key={t.id} className={'tab' + (tab === t.id ? ' active' : '')} onClick={() => setTab(t.id)}>
            <NavIcon name={t.icon} />
            <span className="tlabel">{t.label}</span>
            <span className="glow"></span>
          </button>
        ))}
      </nav>

      {showAd && <RewardModal2 onClose={() => setShowAd(false)} onReward={() => setUnlocked(true)} />}
    </div>
  );
}

function RootV2() {
  const [device, setDevice] = useState(() => localStorage.getItem('signum.v2.device') || 'ios');
  useEffect(() => { localStorage.setItem('signum.v2.device', device); }, [device]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, minHeight: '100vh', padding: 24, justifyContent: 'center' }}>
      <div style={{ display: 'flex', gap: 6, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 999, padding: 4 }}>
        {[['ios', 'iOS · 390'], ['andr', 'Android · 360']].map(([id, label]) => (
          <button key={id} onClick={() => setDevice(id)} style={{
            padding: '8px 16px', borderRadius: 999, border: 'none', cursor: 'pointer',
            font: "700 11px/1 'Inter'", letterSpacing: '0.04em', whiteSpace: 'nowrap',
            background: device === id ? 'rgba(34,211,238,0.16)' : 'transparent',
            color: device === id ? '#22d3ee' : '#64748b',
            boxShadow: device === id ? 'inset 0 0 0 1px rgba(34,211,238,0.35)' : 'none',
            transition: 'all .15s ease',
          }}>{label}</button>
        ))}
      </div>
      {device === 'ios' ? (
        <IOSDevice dark width={390} height={844}>
          <AppV2 device="ios" />
        </IOSDevice>
      ) : (
        <AndroidDevice dark width={360} height={800}>
          <div style={{ position: 'relative', height: '100%' }}>
            <AppV2 device="andr" />
          </div>
        </AndroidDevice>
      )}
    </div>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<RootV2 />);
