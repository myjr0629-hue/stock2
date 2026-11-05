import React from 'react';

const INK = '#FFFFFF';
const SUB = 'rgba(214,226,242,0.72)';

/** 애플 마크 — 단순 실루엣 */
const AppleMark: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={INK} aria-hidden>
    <path d="M16.4 12.7c0-2.3 1.9-3.4 2-3.5-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.8-.9-3-.8-1.5 0-2.9.9-3.7 2.3-1.6 2.7-.4 6.8 1.1 9 .8 1.1 1.7 2.3 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.2 0 2-1.1 2.8-2.2.9-1.3 1.2-2.5 1.3-2.6-.1 0-2.5-1-2.5-3.6zM14.2 5.6c.6-.8 1.1-1.9 1-3-.9 0-2 .6-2.7 1.4-.6.7-1.1 1.8-1 2.9 1 .1 2-.5 2.7-1.3z" />
  </svg>
);

/** 구글플레이 삼각 마크 — 4색 */
const PlayMark: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
    <path d="M3.6 2.2 13.9 12 3.6 21.8c-.3-.2-.5-.6-.5-1.1V3.3c0-.5.2-.9.5-1.1z" fill="#34D2FF" />
    <path d="M17.6 8.3 13.9 12 3.6 2.2c.3-.2.8-.2 1.2 0l12.8 6.1z" fill="#4AE08A" />
    <path d="M21 10.9c.7.4.7 1.8 0 2.2l-3.4 1.6L13.9 12l3.7-3.7L21 10.9z" fill="#FFCE3D" />
    <path d="M17.6 15.7 4.8 21.8c-.4.2-.9.2-1.2 0L13.9 12l3.7 3.7z" fill="#FF5C74" />
  </svg>
);

export const StoreBadge: React.FC<{ kind: 'ios' | 'android'; compact?: boolean }> = ({ kind, compact = false }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: compact ? 8 : 14,
    background: '#0A0D14', border: '1px solid rgba(255,255,255,0.22)',
    borderRadius: compact ? 10 : 14, padding: compact ? '8px 12px' : '14px 26px', minWidth: compact ? 0 : 300,
  }}>
    {kind === 'ios' ? <AppleMark size={compact ? 24 : 40} /> : <PlayMark size={compact ? 24 : 40} />}
    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
      <span style={{ fontSize: compact ? 10 : 19, fontWeight: 700, color: SUB, letterSpacing: '0.02em' }}>
        {kind === 'ios' ? 'Download on the' : 'GET IT ON'}
      </span>
      <span style={{ fontSize: compact ? 17 : 33, fontWeight: 800, color: INK, letterSpacing: '-0.01em' }}>
        {kind === 'ios' ? 'App Store' : 'Google Play'}
      </span>
    </div>
  </div>
);

