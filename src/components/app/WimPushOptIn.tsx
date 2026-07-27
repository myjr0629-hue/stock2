'use client';

import { useEffect, useRef, useState } from 'react';

// [WIM PUSH] Soft opt-in for the daily "today's quiz is ready" notification.
// - Web / a shell without the push plugin → the dynamic import throws → inert no-op.
// - Native + permission still "prompt" → after the user's FIRST full completion we
//   show a friendly in-app sheet FIRST (never a cold OS prompt on launch), then on
//   accept we trigger the real OS permission + register the token (app:'wim').
// - Native + already granted → silently re-register every launch (token can rotate
//   / be pruned), no prompt.
// iOS delivers via APNs (topic com.signumhq.wim, team .p8). Android needs WIM
// Firebase (google-services.json) before its token is usable — until then Android
// registration simply yields nothing and this stays inert there.

type Loc = 'ko' | 'en' | 'ja';

const COPY: Record<Loc, { title: string; body: string; yes: string; no: string }> = {
  ko: { title: '매일 밤, 오늘의 문제를 받아보세요', body: '새 퀴즈가 나오면 딱 한 번만 알려드려요. 광고 아님.', yes: '알림 받기', no: '나중에' },
  en: { title: "Get tonight's quiz", body: 'One nudge when the new quiz is ready. No spam.', yes: 'Turn on', no: 'Not now' },
  ja: { title: '今夜の問題を受け取る', body: '新しいクイズが出たら一度だけお知らせします。広告ではありません。', yes: '通知をオン', no: 'あとで' },
};

const TOGGLE_COPY: Record<Loc, { section: string; label: string; on: string; off: string; denied: string }> = {
  ko: {
    section: '알림',
    label: '오늘의 문제 알림',
    on: '새 퀴즈가 나오면 하루 한 번 알려드려요',
    off: '알림을 받지 않아요',
    denied: '기기 설정 › 알림에서 이 앱의 알림을 허용해 주세요',
  },
  en: {
    section: 'NOTIFICATIONS',
    label: "Today's quiz alert",
    on: 'One ping a day when the new quiz is ready',
    off: 'Notifications are off',
    denied: 'Allow notifications for this app in device Settings › Notifications',
  },
  ja: {
    section: '通知',
    label: '今日の問題のお知らせ',
    on: '新しいクイズが出たら1日1回お知らせします',
    off: '通知を受け取りません',
    denied: '端末の設定 › 通知から、このアプリの通知を許可してください',
  },
};

// Synchronous native check — used to DECIDE whether to show the soft-ask. Must
// stay sync: the async import path below is only for actually driving the plugin
// AFTER the user opts in, never for the show/no-show decision (see the note in
// the completed-effect on why an async gate silently loses on this screen).
function isNative(): boolean {
  try { return !!(window as any).Capacitor?.isNativePlatform?.(); } catch { return false; }
}

// Push is iOS-only for now: the Android shell has no google-services.json, so
// FCM never issues a token and the plugin call is a no-op. Showing the opt-in
// or the settings switch on Android would give the user a control that looks
// live and does nothing. Flip this on in 1.0.1 together with Firebase.
function isPushCapable(): boolean {
  try {
    const cap = (window as any).Capacitor;
    return !!cap?.isNativePlatform?.() && cap?.getPlatform?.() === 'ios';
  } catch { return false; }
}

async function getPush(): Promise<any | null> {
  try {
    if (!isNative()) return null;
    const mod: any = await import('@capacitor/push-notifications');
    return mod.PushNotifications || null;
  } catch { return null; }
}

// User's in-app switch: '1' on, '0' explicitly off, absent = undecided.
const PREF = 'wim.push.on';
const TOKEN = 'wim.push.token';
const get1 = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set1 = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* noop */ } };

function postToken(token: string, loc: Loc, platform: string, attempt = 0) {
  if (!token) return;
  set1(TOKEN, token); // remembered so the settings switch can unregister it later
  fetch('/api/push/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, platform, locale: loc, app: 'wim' }),
  }).catch(() => { if (attempt < 4) setTimeout(() => postToken(token, loc, platform, attempt + 1), 2000 * (attempt + 1)); });
}

// The plugin fires 'registration' on every register() call; adding a listener each
// time would stack duplicates across remounts, so bind exactly once per session.
let listenerBound = false;
async function register(P: any, loc: Loc) {
  try {
    const platform = (window as any).Capacitor?.getPlatform?.() || 'ios';
    if (!listenerBound) {
      listenerBound = true;
      await P.addListener('registration', (t: { value: string }) => postToken(t.value, loc, platform));
    }
    await P.register();
  } catch { /* noop */ }
}

// Turning the switch off drops the token server-side, so sends skip this device
// entirely — no need to send the user out to the OS settings app.
async function unregister() {
  const token = get1(TOKEN);
  if (!token) return;
  try {
    await fetch('/api/push/register', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
  } catch { /* offline — the pref still reads off locally */ }
}

// [WIM PUSH] Settings row — turn the daily notification on/off inside the app.
// Shown on native only (web has no push). Same synchronous-gate rule as the
// soft-ask: visibility is decided by isNative() on mount, never behind an await;
// the async permission read only REFINES the switch afterwards.
export function WimPushToggle({ loc }: { loc: Loc }) {
  const [native, setNative] = useState(false);
  const [on, setOn] = useState(false);
  const [denied, setDenied] = useState(false);
  const c = TOGGLE_COPY[loc] || TOGGLE_COPY.en;

  useEffect(() => {
    if (!isPushCapable()) return;
    setNative(true);
    // The stored pref is the source of truth for the switch. We only ask the OS
    // to DOWNGRADE it (a revoked permission must show as off) — never to turn it
    // on, and never as a preconditon for painting, because this plugin call can
    // hang indefinitely (observed on the iOS simulator: checkPermissions never
    // settles). A hung promise must leave the UI usable, not frozen.
    setOn(get1(PREF) === '1');
    (async () => {
      const P = await getPush();
      if (!P) return;
      try {
        const perm = await P.checkPermissions();
        if (perm?.receive === 'denied') { setDenied(true); setOn(false); set1(PREF, '0'); }
        else if (perm?.receive === 'granted' && get1(PREF) !== '0') { setOn(true); set1(PREF, '1'); }
      } catch { /* leave the pref-based value */ }
    })();
  }, []);

  // Optimistic: flip the switch and persist the pref SYNCHRONOUSLY, then do the
  // plugin/network work fire-and-forget. Awaiting the plugin before updating
  // state made the switch look dead (see the hang above); the OS prompt still
  // appears when the plugin gets to it, and a hard denial corrects the switch.
  // No in-flight lock: a "busy" flag that only clears when the plugin promise
  // settles would leave the switch permanently disabled whenever that promise
  // hangs (exactly what happened on the simulator after the first tap). Instead
  // the switch is always live, and each async branch re-reads the persisted pref
  // right before its side effect so a fast on→off→on can't register a device the
  // user just turned off (or vice versa).
  const toggle = () => {
    const next = !on;
    setOn(next);
    set1(PREF, next ? '1' : '0');
    set1('wim.push.asked', '1'); // an explicit choice here counts as being asked
    (async () => {
      try {
        if (!next) {
          if (get1(PREF) === '0') await unregister();
          return;
        }
        const P = await getPush();
        if (!P) return;
        // requestPermissions covers both cases: it prompts when undecided and
        // resolves straight to 'granted' when the user already allowed it.
        const perm = await P.requestPermissions();
        if (perm?.receive === 'granted') {
          setDenied(false);
          if (get1(PREF) === '1') await register(P, loc); // still on after the await
        } else if (get1(PREF) === '1') {
          // iOS prompts only once — after a denial the switch cannot turn itself
          // on, so show the device-settings hint instead of a dead control.
          setDenied(true); setOn(false); set1(PREF, '0');
        }
      } catch { /* keep the optimistic state; nothing was registered */ }
    })();
  };

  if (!native) return null;
  return (
    <>
      <div style={{ marginTop: 16, fontSize: 11, fontWeight: 900, letterSpacing: '0.08em', color: '#8A85A0' }}>{c.section.toUpperCase()}</div>
      <button
        type="button" onClick={toggle} role="switch" aria-checked={on} aria-label={c.label}
        style={{ font: 'inherit', width: '100%', marginTop: 8, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', background: '#fff', border: '1px solid #E4E0F2', borderRadius: 14, padding: '11px 13px', cursor: 'pointer' }}
      >
        <span style={{ width: 34, height: 34, borderRadius: 11, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: on ? 'linear-gradient(135deg,#6E5DEC,#43319F)' : '#F1EEFA' }}>
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke={on ? '#fff' : '#8A85A0'} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 13.5, fontWeight: 900, color: '#241F42' }}>{c.label}</span>
          <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6B6685', lineHeight: 1.45 }}>{denied ? c.denied : on ? c.on : c.off}</span>
        </span>
        <span aria-hidden style={{ width: 46, height: 28, borderRadius: 99, flexShrink: 0, padding: 3, boxSizing: 'border-box', background: on ? '#6E5DEC' : '#DFDAF0', transition: 'background 0.2s ease' }}>
          <span style={{ display: 'block', width: 22, height: 22, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 5px rgba(38,34,64,0.25)', transform: on ? 'translateX(18px)' : 'translateX(0)', transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)' }} />
        </span>
      </button>
    </>
  );
}

export function WimPushOptIn({ loc, completed }: { loc: Loc; completed: boolean }) {
  const [open, setOpen] = useState(false);
  const askedRef = useRef(false);

  // Re-register on every launch when permission is granted — unless the user
  // turned the settings switch OFF (re-registering would silently undo it).
  useEffect(() => {
    if (get1(PREF) === '0') return;
    (async () => {
      const P = await getPush();
      if (!P) return;
      try {
        const perm = await P.checkPermissions();
        if (perm?.receive === 'granted') register(P, loc);
      } catch { /* noop */ }
    })();
  }, [loc]);

  // First completed question → show the soft-ask once, on native only.
  // IMPORTANT: the show decision is SYNCHRONOUS. An earlier version awaited
  // getPush()+checkPermissions() before setOpen(true); on this screen the
  // component unmounts/remounts constantly (quiz overlay is an early return,
  // the home auto-refreshes), so by the time those awaits resolved the instance
  // that scheduled them had unmounted and setOpen was a no-op — the sheet never
  // appeared on device (it "worked" on web only because getPush resolves
  // instantly there). We now gate purely on isNative() (sync) + the once-only
  // asked flag, and defer the real OS permission request to accept(), which runs
  // on a stable mount. Users who already granted are capped to one harmless
  // re-offer by the asked flag; accept()'s requestPermissions is a no-op then.
  useEffect(() => {
    if (!completed || askedRef.current) return;
    let asked = false;
    try { asked = localStorage.getItem('wim.push.asked') === '1'; } catch { /* storage off */ }
    if (asked || !isPushCapable()) return;
    askedRef.current = true;
    setOpen(true);
  }, [completed]);

  const mark = () => set1('wim.push.asked', '1');
  const accept = async () => {
    // Record the choice synchronously (same reason as the settings switch: the
    // plugin call below can hang, and the settings row must already read "on").
    setOpen(false); mark(); set1(PREF, '1');
    const P = await getPush();
    if (!P) return;
    try {
      const perm = await P.requestPermissions();
      if (perm?.receive === 'granted') register(P, loc);
      else set1(PREF, '0');
    } catch { /* noop */ }
  };
  const later = () => { setOpen(false); mark(); set1(PREF, '0'); };

  if (!open) return null;
  const c = COPY[loc] || COPY.en;
  return (
    <div onClick={later} style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(38,34,64,0.5)', display: 'flex', alignItems: 'flex-end', backdropFilter: 'blur(2px)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', background: '#fff', borderRadius: '22px 22px 0 0', padding: `22px 20px calc(20px + env(safe-area-inset-bottom))`, boxShadow: '0 -12px 40px rgba(40,34,90,0.28)', animation: 'wimUp 0.28s cubic-bezier(0.22,1,0.36,1)' }}>
        <div style={{ width: 40, height: 4, borderRadius: 4, background: '#E4E0F2', margin: '0 auto 16px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <span style={{ width: 44, height: 44, borderRadius: 13, background: 'linear-gradient(135deg,#6E5DEC,#43319F)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🔔</span>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 900, color: '#241F42', lineHeight: 1.25 }}>{c.title}</h3>
        </div>
        <p style={{ margin: '0 0 18px', fontSize: 13.5, fontWeight: 600, color: '#6B6685', lineHeight: 1.55 }}>{c.body}</p>
        <button type="button" onClick={accept} style={{ font: 'inherit', width: '100%', background: 'linear-gradient(135deg,#6E5DEC,#5440D4)', color: '#fff', border: 'none', borderRadius: 14, padding: '14px 0', fontSize: 15, fontWeight: 900, cursor: 'pointer', boxShadow: '0 8px 18px rgba(84,64,212,0.34)' }}>{c.yes}</button>
        <button type="button" onClick={later} style={{ font: 'inherit', width: '100%', marginTop: 8, background: 'none', color: '#8A85A0', border: 'none', borderRadius: 14, padding: '11px 0', fontSize: 13.5, fontWeight: 800, cursor: 'pointer' }}>{c.no}</button>
      </div>
    </div>
  );
}
