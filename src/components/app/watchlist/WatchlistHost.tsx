'use client';

// ============================================================================
// WatchlistHost — 앱 레이아웃에 «하나만» 두는 토스트·시트·페이월 자리
// ----------------------------------------------------------------------------
// .app-viewport 안에 그린다(포털 아님) — --app-bottom-safe·--app-anchor-ad-height 같은
// 레이아웃 변수가 여기서 살아 있다(탭바·광고 위 8px 토스트, 떠 있는 섬 시트).
// 시트 본문은 열릴 때만 불러온다(레이아웃 번들을 가볍게).
// ============================================================================

import { useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { usePathname } from '@/i18n/routing';
import { useBannerSuppression } from '@/hooks/useBannerSuppression';
import { useWatchlistUI, wlUI } from '@/lib/app/watchlistUI';
import { toWlLocale } from '@/lib/app/watchlistInsights';
import { useWatchlistAlertsEnabled } from '@/lib/app/watchlistFlags';
import { FREE_LIMIT, getWatchlistStore } from '@/lib/app/watchlist';
import { ensureAndroidAlertChannels, maybeResyncAlerts, readAlertPrefs, syncAlertPrefs, writeAlertPrefs } from '@/lib/app/watchlistAlerts';
import { trackWatchlist } from '@/lib/app/watchlistAnalytics';
import { BottomSheet, afterSheetHistory, useBackToClose } from './BottomSheet';
import { addStar, undoRemove } from './starActions';
import { wlCopy } from './copy';
import { WlIcon } from './icons';
import s from './watchlist.module.css';

const LongPressSheet = dynamic(() => import('./LongPressSheet').then((m) => m.LongPressSheet), { ssr: false });
const ProUpsellSheet = dynamic(() => import('./ProUpsellSheet').then((m) => m.ProUpsellSheet), { ssr: false });
const AlertSettingsSheet = dynamic(() => import('./AlertSettingsSheet').then((m) => m.AlertSettingsSheet), { ssr: false });
const ProPaywall = dynamic(() => import('@/components/app/ProPaywall').then((m) => m.ProPaywall), { ssr: false });

export function WatchlistHost() {
  const locale = useLocale();
  const loc = toWlLocale(locale);
  const c = wlCopy(loc);
  const router = useRouter();
  const pathname = usePathname();
  const ui = useWatchlistUI();
  const alertsOn = useWatchlistAlertsEnabled();
  const sheet = ui.sheet;
  const toast = ui.toast;
  // 시트 → 시트(길게 누르기 → 한도)·시트 → 페이월로 넘어갈 때 «열린 개수»가 0 을 스치지 않게 잡아 둔다
  //   (한 커밋 안에서 닫힘 정리가 먼저 돌아 배너가 한 번 올라왔다 내려가는 깜빡임을 막는다)
  useBannerSuppression(!!sheet || !!ui.paywall);

  // 시트가 닫힌 뒤(히스토리 한 칸을 걷은 뒤) 이동 — 새 화면이 되돌려지지 않게
  const navigate = useCallback((path: string) => {
    void afterSheetHistory().then(() => {
      // 이미 목록 화면이면 «정리하기»는 이동이 아니라 편집 모드 켜기(검색 팝업도 닫는다)
      if (path.startsWith('watchlist?edit=1') && window.location.pathname.includes('/app-view/watchlist')) {
        window.dispatchEvent(new CustomEvent('sg:watchlist-edit'));
        return;
      }
      router.push(`/${loc}/app-view/${path}`);
    });
  }, [router, loc]);

  // ── 알림(플래그 켜짐)만: 안드로이드 채널 · 앱을 열 때 하루 한 번 서버 사본 다시 보내기 · 토큰 교체 ──
  useEffect(() => {
    if (!alertsOn) return;
    void ensureAndroidAlertChannels(loc);
    const run = () => { void maybeResyncAlerts(loc); };   // 권한은 묻지 않는다 · 실패는 조용히(다음에 다시)
    run();
    // 앱 시작 때 온보딩이 푸시 토큰을 다시 등록한다(비동기) — 토큰이 바뀌었으면 그 뒤에 잡는다
    const late = window.setTimeout(run, 12_000);
    document.addEventListener('app:resume', run);
    return () => { window.clearTimeout(late); document.removeEventListener('app:resume', run); };
  }, [alertsOn, loc]);

  // 내 종목에서 뺀 종목의 알림도 걷는다 — 되돌리기 창(4초)이 지난 뒤에도 빠져 있을 때만
  useEffect(() => {
    if (!alertsOn) return;
    const timers = new Set<number>();
    const onRemoved = (e: Event) => {
      const t = (e as CustomEvent<{ t?: string }>).detail?.t;
      if (!t) return;
      const id = window.setTimeout(() => {
        timers.delete(id);
        if (getWatchlistStore().has(t)) return;
        const p = readAlertPrefs();
        if (!p.tickers[t]) return;
        const next = { ...p, tickers: { ...p.tickers }, pendingSync: true };
        delete next.tickers[t];
        writeAlertPrefs(next);
        void syncAlertPrefs(next, loc, { askPermission: false });
      }, 4600);
      timers.add(id);
    };
    window.addEventListener('sg:watchlist-removed', onRemoved);
    return () => {
      window.removeEventListener('sg:watchlist-removed', onRemoved);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [alertsOn, loc]);

  // 토스트 자동 닫힘
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => wlUI.dismissToast(toast.id), toast.duration);
    return () => window.clearTimeout(id);
  }, [toast]);

  // 화면을 옮기면 떠 있던 시트는 닫는다(뒤로가기로 이미 닫힌 경우 포함)
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      if (wlUI.getSnapshot().sheet) wlUI.closeSheet();
      if (wlUI.getSnapshot().paywall) wlUI.closePaywall();
    }
  }, [pathname]);

  // 시트가 열리면 측정
  const trackedSheet = useRef<number | null>(null);
  useEffect(() => {
    if (!sheet || trackedSheet.current === sheet.id) return;
    trackedSheet.current = sheet.id;
    if (sheet.kind === 'alertUpsell' || sheet.kind === 'proGeneric') {
      trackWatchlist('wl_upsell_sheet', { src: sheet.src, t: sheet.kind === 'alertUpsell' ? sheet.ticker ?? '' : '' });
    }
  }, [sheet]);

  const close = useCallback(() => wlUI.closeSheet(), []);

  // 한도 시트에서 PRO 가 되면 담으려던 종목을 그대로 담는다
  const limitTicker = sheet?.kind === 'limit' ? sheet.ticker : null;
  const alertTicker = sheet?.kind === 'alertUpsell' ? sheet.ticker ?? null : null;
  const alertLevels = sheet?.kind === 'alertUpsell' ? sheet.levels ?? null : null;
  const alertMeta = sheet?.kind === 'alertUpsell' ? sheet.meta : undefined;
  const onBecamePro = useCallback(() => {
    const cur = wlUI.getSnapshot().sheet;
    wlUI.closeSheet();
    if (limitTicker) {
      void afterSheetHistory().then(() => addStar(limitTicker, 'restore'));
    } else if (cur?.kind === 'alertUpsell' && alertsOn && alertTicker) {
      void afterSheetHistory().then(() => wlUI.openSheet({ kind: 'alertSettings', ticker: alertTicker, levels: alertLevels, meta: alertMeta }));
    }
  }, [limitTicker, alertsOn, alertTicker, alertLevels, alertMeta]);

  const onWatchlistPage = pathname?.includes('/app-view/watchlist');

  return (
    <>
      {toast && (
        <div className={s.toastHost}>
          <div key={toast.id} className={s.toast} role="status" aria-live="polite">
            {toast.kind === 'added' && (
              <>
                <WlIcon name="star" className={s.toastStarOn} />
                <span className={s.toastMsg}>{toast.first ? c.firstTip : c.added}</span>
                {!toast.first && toast.limit > 0 && <span className={s.toastCount}>{toast.count}/{toast.limit}</span>}
                {!onWatchlistPage ? (
                  <>
                    <i className={s.toastDv} aria-hidden="true" />
                    <button type="button" className={s.toastAct} onClick={() => { wlUI.dismissToast(); navigate('watchlist'); }}>{c.view}</button>
                  </>
                ) : <span className={s.toastPad} />}
              </>
            )}
            {toast.kind === 'removed' && (
              <>
                <WlIcon name="star" className={s.toastStarOff} />
                <span className={s.toastMsg}>{c.removed}</span>
                <i className={s.toastDv} aria-hidden="true" />
                <button type="button" className={s.toastAct} onClick={() => { void undoRemove(toast.undo); }}>{c.undo}</button>
              </>
            )}
            {toast.kind === 'text' && (
              <>
                <WlIcon name={toast.tone === 'warn' ? 'info' : 'bell'} className={s.toastStarOff} />
                <span className={s.toastMsg}>{toast.text[loc]}</span>
                <span className={s.toastPad} />
              </>
            )}
          </div>
        </div>
      )}

      {sheet && (
        <BottomSheet
          key={sheet.id}
          open
          onClose={close}
          closeLabel={c.close}
          returnFocusTo={sheet.trigger}
          variant={sheet.kind === 'longpress' || sheet.kind === 'mapInfo' ? 'plain' : sheet.kind === 'alertSettings' ? 'cy' : 'pro'}
          closeButton={sheet.kind !== 'alertSettings' && sheet.kind !== 'longpress'}
          bodyClassName={sheet.kind === 'longpress' ? s.sheetBodyTight : undefined}
        >
          {({ titleId }) => {
            switch (sheet.kind) {
              case 'longpress':
                return <LongPressSheet loc={loc} ticker={sheet.ticker} meta={sheet.meta} titleId={titleId} onClose={close} onNavigate={navigate} />;
              case 'limit':
                return <ProUpsellSheet mode="limit" loc={loc} ticker={sheet.ticker} alertsOn={alertsOn} titleId={titleId} onClose={close} onNavigate={navigate} onBecamePro={onBecamePro} />;
              case 'alertUpsell':
                return <ProUpsellSheet mode="alerts" loc={loc} ticker={sheet.ticker} levels={sheet.levels} alertsOn={alertsOn} titleId={titleId} onClose={close} onNavigate={navigate} onBecamePro={onBecamePro} />;
              case 'proGeneric':
                return <ProUpsellSheet mode={sheet.focus === 'chips' ? 'chips' : alertsOn ? 'alerts' : 'generic'} loc={loc} alertsOn={alertsOn} titleId={titleId} onClose={close} onNavigate={navigate} onBecamePro={onBecamePro} />;
              case 'alertSettings':
                return alertsOn
                  ? <AlertSettingsSheet loc={loc} ticker={sheet.ticker} levels={sheet.levels} meta={sheet.meta} titleId={titleId} onClose={close} />
                  : null;
              case 'mapInfo':
                return <MapInfo loc={loc} titleId={titleId} />;
              default:
                return null;
            }
          }}
        </BottomSheet>
      )}

      {ui.paywall && <HostPaywall key={ui.paywall.id} loc={loc} lead={ui.paywall.lead} alerts={alertsOn} />}
    </>
  );
}

/** 기존 ProPaywall 그대로 — 안드로이드 뒤로가기로 닫히게만 감싼다(안 감싸면 뒤 화면만 넘어가고 페이월이 남는다) */
function HostPaywall({ loc, lead, alerts }: { loc: 'ko' | 'en' | 'ja'; lead: 'watchlist' | 'alerts' | 'ads'; alerts: boolean }) {
  const close = useCallback(() => wlUI.closePaywall(), []);
  useBackToClose(true, close);
  useBannerSuppression(true);   // 전체 화면 페이월 — 배너가 구매 버튼·약관 줄을 덮지 않게
  return <ProPaywall locale={loc} lead={lead} alerts={alerts} onClose={close} />;
}

function MapInfo({ loc, titleId }: { loc: 'ko' | 'en' | 'ja'; titleId: string }) {
  const c = wlCopy(loc);
  return (
    <>
      <h2 className={s.shT} id={titleId} tabIndex={-1}>{c.mapTitle}</h2>
      <ul className={s.infoList}>
        <li>
          <span className={s.infoKey} aria-hidden="true"><i className={s.gCap} /></span>
          <span><b>{c.mapWalls}</b> — {c.mapWallsSub}</span>
        </li>
        <li>
          <span className={s.infoKey} aria-hidden="true"><i className={s.gMp} /></span>
          <span><b>{c.mapMp}</b> — {c.mapMpSub}</span>
        </li>
        <li>
          <span className={s.infoKey} aria-hidden="true"><i className={s.gPx} /></span>
          <span><b>{c.mapPx}</b> — {c.mapPxSub}</span>
        </li>
        <li>
          <span className={s.infoKey} aria-hidden="true"><WlIcon name="clock" size={14} /></span>
          <span><b>{c.mapWait}</b> — {c.mapWaitSub}</span>
        </li>
      </ul>
      <p className={s.infoSrc}>{c.mapSrc}</p>
      <p className={s.infoSrc}>{loc === 'ko' ? `무료는 ${FREE_LIMIT}종목까지 담을 수 있습니다.` : loc === 'ja' ? `無料は${FREE_LIMIT}銘柄まで登録できます。` : `Free covers ${FREE_LIMIT} stocks.`}</p>
    </>
  );
}
