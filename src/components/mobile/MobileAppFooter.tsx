'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

type FooterLocale = 'ko' | 'en' | 'ja';

const APP_FOOTER_COPY: Record<FooterLocale, {
  terms: string;
  privacy: string;
  support: string;
  disclaimer: string;
}> = {
  ko: {
    terms: '앱 이용약관',
    privacy: '앱 개인정보처리방침',
    support: '지원',
    disclaimer: '교육 및 리서치용 시장 데이터입니다. 투자 조언, 매수/매도 권유, 수익 보장이 아니며 모든 판단과 결과는 사용자 본인 책임입니다.',
  },
  en: {
    terms: 'App Terms',
    privacy: 'App Privacy',
    support: 'Support',
    disclaimer: 'Market data for education and research only. Not investment advice, not a buy/sell recommendation, and no accuracy or return is guaranteed.',
  },
  ja: {
    terms: 'アプリ利用規約',
    privacy: 'アプリプライバシー',
    support: 'サポート',
    disclaimer: '教育およびリサーチ目的の市場データです。投資助言、売買推奨、収益保証ではなく、すべての判断と結果は利用者本人の責任です。',
  },
};

function resolveFooterLocale(locale: string): FooterLocale {
  if (locale === 'ko' || locale === 'ja') return locale;
  return 'en';
}

export function MobileAppFooter() {
  const locale = useLocale();
  const t = useTranslations('footer');
  const labels = APP_FOOTER_COPY[resolveFooterLocale(locale)];

  return (
    <footer className="app-mobile-footer border-t border-white/[0.04] bg-[#050a14]/72 backdrop-blur-md px-5 pt-5 pb-8 mt-auto w-full">
      <div className="mb-3 flex items-center justify-center gap-x-4 text-[11px] font-semibold text-slate-400/85">
        <Link href="/app-view/terms" className="underline decoration-slate-600 underline-offset-2 transition-colors hover:text-white">
          {labels.terms}
        </Link>
        <Link href="/app-view/privacy" className="underline decoration-slate-600 underline-offset-2 transition-colors hover:text-white">
          {labels.privacy}
        </Link>
      </div>
      <div className="mb-3 text-center text-[10.5px] font-semibold leading-snug text-slate-400/80">
        {labels.support}:{' '}
        <a href="mailto:contact@signumhq.com" className="transition-colors hover:text-white">
          contact@signumhq.com
        </a>
      </div>
      <p className="mx-auto max-w-md text-center text-[10px] font-semibold leading-relaxed text-slate-500/75">
        {labels.disclaimer}
      </p>
      <div className="mt-3 text-center font-mono text-[9px] uppercase tracking-wider text-slate-600">
        {t('copyright')}
      </div>
    </footer>
  );
}
