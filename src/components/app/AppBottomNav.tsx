'use client';

import { usePathname, useRouter } from '@/i18n/routing';
import { useLocale } from 'next-intl';

const TABS = [
  { id: 'dash', label: 'Dashboard', path: '/app-view/dash', icon: 'dashboard' },
  { id: 'guardian', label: 'Guardian', path: '/app-view/guardian', icon: 'guardian' },
  { id: 'cmd', label: 'Command', path: '/app-view/cmd', icon: 'command' },
  { id: 'flow', label: 'Flow', path: '/app-view/flow', icon: 'flow' },
  { id: 'intel', label: 'Intel', path: '/app-view/intel', icon: 'intel' },
] as const;

const TAB_LABELS: Record<(typeof TABS)[number]['id'], Record<string, string>> = {
  dash: { ko: '대시보드', en: 'Dashboard', ja: 'ダッシュ' },
  guardian: { ko: '가디언', en: 'Guardian', ja: 'ガーディアン' },
  cmd: { ko: '커맨드', en: 'Command', ja: 'コマンド' },
  flow: { ko: '플로우', en: 'Flow', ja: 'フロー' },
  intel: { ko: '인텔', en: 'Intel', ja: 'インテル' },
};

function TabIcon({ name, active }: { name: string; active: boolean }) {
  const color = active ? 'var(--cyan)' : 'var(--text-muted)';

  switch (name) {
    case 'dashboard':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path
            d="M3 13h6V3H3v10Zm0 8h6v-6H3v6Zm8 0h10V11H11v10Zm0-18v6h10V3H11Z"
            stroke={color}
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'guardian':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3Z" stroke={color} strokeWidth="1.7" strokeLinejoin="round" />
          <circle cx="12" cy="12" r="2.5" stroke={color} strokeWidth="1.5" />
        </svg>
      );
    case 'command':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="4" width="18" height="16" rx="2.5" stroke={color} strokeWidth="1.7" />
          <path d="m7 9 3 3-3 3M13 15h4" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'flow':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <path d="M3 12c2.5 0 2.5-6 5-6s2.5 12 5 12 2.5-9 5-9" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'intel':
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.7" />
          <path d="M12 12 19 5M12 3v3M12 18v3M3 12h3M18 12h3" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
          <circle cx="12" cy="12" r="2" fill={color} />
        </svg>
      );
    default:
      return null;
  }
}

export function AppBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();
  const isDocumentRoute = pathname?.includes('/app-view/terms') ||
    pathname?.includes('/app-view/privacy') ||
    pathname?.includes('/app-view/onboarding') ||
    pathname?.includes('/app-view/settings');

  if (isDocumentRoute) return null;

  const activeTab = TABS.find((tab) => pathname?.startsWith(tab.path))?.id || 'dash';

  return (
    <nav className="app-tabbar">
      {TABS.map((tab) => {
        const isActive = tab.id === activeTab;
        const label = TAB_LABELS[tab.id]?.[locale] || TAB_LABELS[tab.id]?.en || tab.label;

        return (
          <button
            key={tab.id}
            className={`app-tabbar-tab ${isActive ? 'active' : ''}`}
            onClick={() => {
              if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(10);
              router.push(tab.path);
            }}
          >
            <TabIcon name={tab.icon} active={isActive} />
            <span className="app-tabbar-label">{label}</span>
            {isActive && <span className="app-tabbar-glow" />}
          </button>
        );
      })}
    </nav>
  );
}
