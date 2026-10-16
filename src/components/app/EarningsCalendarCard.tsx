'use client';

import { useRouter } from 'next/navigation';
import { toWlLocale } from '@/lib/app/watchlistInsights';
import n9 from '@/app/[locale]/app-view/dash/dash9.module.css';

// 메인 하단 빠른 진입의 기존 문구·아이콘·NEW 표식을 두 화면에서 그대로 쓴다.
export const EARNINGS_CALENDAR_LABEL = { ko: '실적 캘린더', en: 'Earnings Calendar', ja: '決算カレンダー' } as const;

export function EarningsCalendarCard({ locale }: { locale: string }) {
  const router = useRouter();
  const loc = toWlLocale(locale);
  const open = () => router.push(`/${loc}/app-view/earnings`);
  return (
    <a className={n9.e9Q} style={{ ['--c' as string]: '#fbbf24' }}
       role="button" tabIndex={0}
       onClick={open}
       onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}>
      <span className={n9.e9QIco}>
        <svg viewBox="0 0 24 24"><rect x="3.2" y="5" width="17.6" height="15.8" rx="2.4" /><path d="M3.2 10h17.6M8 3v4M16 3v4" /><circle cx="9" cy="14.4" r="1.1" /><circle cx="15" cy="14.4" r="1.1" /></svg>
      </span>
      <span className={n9.e9QT}>{EARNINGS_CALENDAR_LABEL[loc]}</span>
      <span className={`${n9.e9QDest} ${n9.nw}`}>NEW</span>
      <span className={n9.e9Chev}>&#8250;</span>
    </a>
  );
}
