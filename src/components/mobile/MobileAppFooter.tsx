'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/routing';

export function MobileAppFooter() {
  const pathname = usePathname();
  const t = useTranslations('footer');
  const isKorean = pathname?.startsWith('/ko') || false;
  const isJapanese = pathname?.startsWith('/ja') || false;

  const labels = {
    terms: isKorean ? '이용약관' : isJapanese ? '利用規約' : 'Terms of Service',
    privacy: isKorean ? '개인정보처리방침' : isJapanese ? 'プライバシーポリシー' : 'Privacy Policy',
    support: isKorean ? '지원' : isJapanese ? 'サポート' : 'Support',
  };

  return (
    <footer className="app-mobile-footer border-t border-white/[0.03] bg-[#050a14]/60 backdrop-blur-md px-5 pt-5 pb-8 mt-auto w-full">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[11px] text-slate-400/80 mb-3.5 font-sans font-medium">
        <Link href="/terms" className="hover:text-white transition-colors underline decoration-slate-600 underline-offset-2">
          {labels.terms}
        </Link>
        <span className="text-slate-700 font-bold">·</span>
        <Link href="/privacy" className="hover:text-white transition-colors underline decoration-slate-600 underline-offset-2">
          {labels.privacy}
        </Link>
        <span className="text-slate-700 font-bold">·</span>
        <span className="text-slate-400">
          {labels.support}:{' '}
          <a href="mailto:contact@signumhq.com" className="hover:text-white transition-colors font-semibold">
            contact@signumhq.com
          </a>
        </span>
      </div>
      <p className="text-[10px] leading-relaxed text-slate-500/75 text-center font-sans max-w-md mx-auto">
        {t('disclaimer')}
      </p>
      <div className="text-[9px] text-slate-600 text-center mt-3 font-mono tracking-wider uppercase">
        {t('copyright')}
      </div>
    </footer>
  );
}
