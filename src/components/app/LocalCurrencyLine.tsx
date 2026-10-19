'use client';

import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { useLocalExchangeRate } from '@/hooks/useLocalExchangeRate';
import { useBannerSuppression } from '@/hooks/useBannerSuppression';
import { formatLocalCurrency } from '@/lib/app/localCurrency';
import s from './LocalCurrencyLine.module.css';

export function LocalCurrencyLine({ usd, locale, showSign = false }: {
  usd: number | null | undefined;
  locale: string;
  showSign?: boolean;
}) {
  const { data, updatedAt } = useLocalExchangeRate(locale);
  const t = useTranslations('localCurrency');
  const common = useTranslations('common');
  const [open, setOpen] = useState(false);
  const id = useId();
  const text = formatLocalCurrency(usd, locale, data, showSign);
  useBannerSuppression(open && text !== null);
  if (text === null) return null;
  const time = updatedAt ? new Intl.DateTimeFormat(locale === 'ko' ? 'ko-KR' : 'ja-JP', {
    timeZone: locale === 'ko' ? 'Asia/Seoul' : 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short', hour12: false,
  }).format(new Date(updatedAt)) : null;
  const note = time ? t('rateAsOf', { time }) : t('rateTimeUnavailable');

  return <span className={s.line}>
    {text}{' '}
    {/* May live inside a link; prevent navigation and avoid nested buttons. */}
    <span role="button" tabIndex={0} className={s.info} title={note}
      aria-label={t('info')} aria-haspopup="dialog" aria-expanded={open}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setOpen(true); }
      }}>i</span>
    {open && createPortal(
      <div className={s.overlay} onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); }}>
        <div className={s.tooltip} role="dialog" aria-modal="true" aria-labelledby={id}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } }}>
          <p id={id}>{note}</p>
          <button type="button" autoFocus onClick={() => setOpen(false)}>{common('close')}</button>
        </div>
      </div>, document.body,
    )}
  </span>;
}
