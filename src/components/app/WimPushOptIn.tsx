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

async function getPush(): Promise<any | null> {
  try {
    const cap = (window as any).Capacitor;
    if (!cap?.isNativePlatform?.()) return null;
    const mod: any = await import('@capacitor/push-notifications');
    return mod.PushNotifications || null;
  } catch { return null; }
}

function postToken(token: string, loc: Loc, platform: string, attempt = 0) {
  if (!token) return;
  fetch('/api/push/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, platform, locale: loc, app: 'wim' }),
  }).catch(() => { if (attempt < 4) setTimeout(() => postToken(token, loc, platform, attempt + 1), 2000 * (attempt + 1)); });
}

async function register(P: any, loc: Loc) {
  try {
    const platform = (window as any).Capacitor?.getPlatform?.() || 'ios';
    await P.addListener('registration', (t: { value: string }) => postToken(t.value, loc, platform));
    await P.register();
  } catch { /* noop */ }
}

export function WimPushOptIn({ loc, completed }: { loc: Loc; completed: boolean }) {
  const [open, setOpen] = useState(false);
  const askedRef = useRef(false);

  // Re-register on every launch when permission is already granted.
  useEffect(() => {
    (async () => {
      const P = await getPush();
      if (!P) return;
      try {
        const perm = await P.checkPermissions();
        if (perm?.receive === 'granted') register(P, loc);
      } catch { /* noop */ }
    })();
  }, [loc]);

  // First full completion → show the soft-ask once (only if we can still prompt).
  useEffect(() => {
    if (!completed || askedRef.current) return;
    let asked = false;
    try { asked = localStorage.getItem('wim.push.asked') === '1'; } catch { /* storage off */ }
    if (asked) return;
    (async () => {
      const dbg = (o: any) => { try { localStorage.setItem('wim.push.debug', JSON.stringify({ t: Date.now(), ...o })); } catch { /* noop */ } };
      const P = await getPush();
      dbg({ step: 'getPush', got: !!P, native: (window as any).Capacitor?.isNativePlatform?.() });
      if (!P) return;
      try {
        const perm = await P.checkPermissions();
        dbg({ step: 'checkPermissions', perm });
        if (perm?.receive === 'prompt' || perm?.receive === 'prompt-with-rationale') {
          askedRef.current = true;
          setOpen(true);
        }
      } catch (e) { dbg({ step: 'error', error: String(e) }); }
    })();
  }, [completed]);

  const mark = () => { try { localStorage.setItem('wim.push.asked', '1'); } catch { /* noop */ } };
  const accept = async () => {
    setOpen(false); mark();
    const P = await getPush();
    if (!P) return;
    try {
      const perm = await P.requestPermissions();
      if (perm?.receive === 'granted') register(P, loc);
    } catch { /* noop */ }
  };
  const later = () => { setOpen(false); mark(); };

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
