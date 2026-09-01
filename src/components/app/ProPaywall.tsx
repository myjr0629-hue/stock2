'use client';

// ============================================================================
// ProPaywall — 구독(광고제거) 결제 «전에» 보여주는 화면.
// ----------------------------------------------------------------------------
// 왜 이 화면이 따로 있나: 설정 행에서 곧장 purchase() 를 부르면 애플 3.1.2
// (「이 디자인은 혼란스럽다」)와 Play 의 구독 고지 요건에 그대로 걸린다.
// 결제 버튼을 누르기 «전에» 아래가 한 화면에 다 보여야 한다:
//   ① 상품명 ② 기간 ③ 가격 ④ 무엇이 포함되는지
//   ⑤ 자동갱신·해지 안내 ⑥ 구매 복원 ⑦ 이용약관·개인정보처리방침 링크
//   ⑧ 닫기 컨트롤 — 첫 페인트에 보이고 44×44 이상 (Play 요건)
//
// ⚠️ 가격은 «스토어가 준 현지화 문자열»만 쓴다(offers[].priceString).
//    "$9.99" 를 하드코딩하면 통화·세금이 다른 나라에서 거짓말이 되고
//    가격표시 의무 위반이다. 오퍼를 못 받으면 결제 버튼을 비활성화한다.
//
// ⚠️ 무료체험은 «의도적으로» 넣지 않는다. 애플이 2026-01 부터 트라이얼
//    페이월을 3.1.2 로 대량 반려한다(명시 CTA + 3행 타임라인 + 5일차 알림
//    실발송이 요건). 월정액만 내보내면 요건이 단순해진다.
//    근거: .agent/SUBSCRIPTION-STATUS.md
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import s from './ProPaywall.module.css';
import { useProStatus } from '@/hooks/useProStatus';

type PaywallLocale = 'ko' | 'en' | 'ja';

const COPY: Record<PaywallLocale, {
  close: string;
  eyebrow: string;
  title: string;
  lede: string;
  benefits: string[];
  perMonth: string;
  cta: string;
  ctaBusy: string;
  unavailable: string;
  renewNote: string;
  manageNote: string;
  restore: string;
  restoring: string;
  restored: string;
  nothingToRestore: string;
  failed: string;
  terms: string;
  privacy: string;
  and: string;
}> = {
  ko: {
    close: '닫기',
    eyebrow: 'SIGNUM PRO',
    title: '광고 없이 봅니다',
    lede: '데이터는 그대로, 화면만 조용해집니다.',
    benefits: [
      '배너·전면 광고 전부 제거',
      '광고를 보고 잠금해제하던 화면이 바로 열림',
      '기존 기능은 그대로 — 추가 데이터는 없습니다',
    ],
    perMonth: '월',
    cta: '구독하기',
    ctaBusy: '처리 중…',
    unavailable: '지금은 구매할 수 없습니다',
    renewNote: '매월 자동 갱신됩니다. 언제든 해지할 수 있고, 해지하면 남은 기간까지 이용됩니다.',
    manageNote: '해지는 기기의 구독 관리 화면에서 합니다.',
    restore: '구매 복원',
    restoring: '복원 중…',
    restored: '복원되었습니다',
    nothingToRestore: '복원할 구매가 없습니다',
    failed: '실패했습니다. 잠시 후 다시 시도해 주세요',
    terms: '이용약관',
    privacy: '개인정보처리방침',
    and: '·',
  },
  en: {
    close: 'Close',
    eyebrow: 'SIGNUM PRO',
    title: 'Read it without ads',
    lede: 'Same data. Quieter screen.',
    benefits: [
      'Removes every banner and interstitial ad',
      'Screens that asked you to watch an ad open straight away',
      'Everything else stays the same — no extra data',
    ],
    perMonth: 'month',
    cta: 'Subscribe',
    ctaBusy: 'Working…',
    unavailable: 'Not available right now',
    renewNote: 'Renews automatically each month. Cancel anytime; access continues until the period ends.',
    manageNote: 'Cancel from your device’s subscription settings.',
    restore: 'Restore purchase',
    restoring: 'Restoring…',
    restored: 'Purchase restored',
    nothingToRestore: 'No previous purchase to restore',
    failed: 'Something went wrong. Please try again',
    terms: 'Terms of Use',
    privacy: 'Privacy Policy',
    and: '·',
  },
  ja: {
    close: '閉じる',
    eyebrow: 'SIGNUM PRO',
    title: '広告なしで読む',
    lede: 'データはそのまま、画面だけ静かに。',
    benefits: [
      'バナー広告と全画面広告をすべて非表示',
      '広告視聴で解除していた画面がそのまま開きます',
      '他の機能は変わりません — 追加データはありません',
    ],
    perMonth: '月',
    cta: '登録する',
    ctaBusy: '処理中…',
    unavailable: '現在購入できません',
    renewNote: '毎月自動更新されます。いつでも解約でき、期間終了までご利用いただけます。',
    manageNote: '解約は端末の定期購読設定から行えます。',
    restore: '購入を復元',
    restoring: '復元中…',
    restored: '復元しました',
    nothingToRestore: '復元できる購入がありません',
    failed: '失敗しました。しばらくしてからお試しください',
    terms: '利用規約',
    privacy: 'プライバシーポリシー',
    and: '・',
  },
};

export function ProPaywall({ locale, onClose }: { locale: string; onClose: () => void }) {
  const router = useRouter();
  const loc: PaywallLocale = locale === 'ko' ? 'ko' : locale === 'ja' ? 'ja' : 'en';
  const t = COPY[loc];

  const { isPro, ready, offers, purchase, restore } = useProStatus();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // 스토어가 준 월간 오퍼. 없으면 «가격을 지어내지 않고» 버튼을 잠근다.
  const monthly = offers.find((o) => o.plan === 'monthly') ?? null;

  // 이미 구독자면 페이월을 띄울 이유가 없다(복원 직후 포함).
  useEffect(() => { if (isPro) onClose(); }, [isPro, onClose]);

  const handleSubscribe = useCallback(async () => {
    if (busy || !monthly) return;
    setBusy(true);
    setNote(null);
    const res = await purchase('monthly');
    setBusy(false);
    if (res.ok && res.isPro) return; // 위 effect 가 닫는다
    // 사용자가 스토어 시트를 직접 닫은 경우는 «실패»가 아니다 — 조용히 둔다.
    if (!res.ok && !res.cancelled) setNote(t.failed);
  }, [busy, monthly, purchase, t]);

  const handleRestore = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setNote(t.restoring);
    const res = await restore();
    setBusy(false);
    if (res.ok && res.isPro) setNote(t.restored);
    else if (res.ok) setNote(t.nothingToRestore);
    else setNote(t.failed);
  }, [busy, restore, t]);

  const go = useCallback((path: string) => {
    router.push(`/${loc}/app-view/${path}`);
  }, [router, loc]);

  return (
    <div className={s.overlay} role="dialog" aria-modal="true" aria-label={t.title}>
      <div className={s.sheet}>
        {/* 닫기 — 첫 페인트에 보이고 44×44 이상 (Play 요건) */}
        <button type="button" className={s.close} onClick={onClose} aria-label={t.close}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>

        <div className={s.head}>
          <span className={s.eyebrow}>{t.eyebrow}</span>
          <h1 className={s.title}>{t.title}</h1>
          <p className={s.lede}>{t.lede}</p>
        </div>

        <ul className={s.benefits}>
          {t.benefits.map((b) => (
            <li key={b} className={s.benefit}>
              <span className={s.tick} aria-hidden="true">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>

        {/* 가격 — 스토어가 준 현지화 문자열만 쓴다 */}
        <div className={s.priceCard}>
          {ready && monthly ? (
            <>
              <span className={s.price}>{monthly.priceString}</span>
              <span className={s.period}>/ {t.perMonth}</span>
            </>
          ) : (
            <span className={s.priceMuted}>{ready ? t.unavailable : '···'}</span>
          )}
        </div>

        <button
          type="button"
          className={s.cta}
          onClick={handleSubscribe}
          disabled={busy || !monthly}
        >
          {busy ? t.ctaBusy : t.cta}
        </button>

        {note && <p className={s.note} role="status">{note}</p>}

        <p className={s.fine}>{t.renewNote}</p>
        <p className={s.fine}>{t.manageNote}</p>

        <div className={s.links}>
          <button type="button" className={s.link} onClick={handleRestore} disabled={busy}>
            {t.restore}
          </button>
          <span className={s.dot} aria-hidden="true">{t.and}</span>
          <button type="button" className={s.link} onClick={() => go('terms')}>{t.terms}</button>
          <span className={s.dot} aria-hidden="true">{t.and}</span>
          <button type="button" className={s.link} onClick={() => go('privacy')}>{t.privacy}</button>
        </div>
      </div>
    </div>
  );
}
