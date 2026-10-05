'use client';

// ============================================================================
// PRO 권유 시트 한 벌 — 네 자리에서 열린다
//   limit   : 무료 한도(5) 넘는 하트(시안 05b) — «PRO 시작하기 · 기존 종목 정리하기 · 코드 입력 · 나중에»
//   alerts  : 무료 사용자가 🔔(시안 03) — 방금 누른 종목으로 알림 예시(검증된 숫자만)
//   generic : 목록 아래 PRO 안내 카드(알림 플래그 꺼짐)
//   chips   : 무료 행의 잠긴 두 번째 칩 — 제목이 «행마다 인사이트 칩 2개»
//             (칩 차등 WATCHLIST_CHIP_TIERING 이 켜졌을 때만. 꺼지면 칩은 PRO 혜택이 아니다 — 칩 줄을 빼고
//              «내 종목 100개 · 광고 없음»만 말한다. 켜져도 칩 «종류»(장외·고래·실적)는 나열하지 않는다 — FINRA 장외 비중은
//              별도 요금을 매길 수 없는 데이터다. 알림 예시 목록에도 장외 비중 급변을 PRO 알림으로 올리지 않는다)
// 모양(대표 9/29 «구구절절 설명하지 말고 트리거·구매욕만»): 제목 + 트리거 한 줄 + (담긴 종목) + 혜택 한 줄씩(내 종목 100개 · 광고 없음)
//   + 가격 · CTA · 코드 · 나중에 · 결제 전 필수 고지(자동 갱신·해지·복원·약관·개인정보). 설명 문장은 두지 않는다.
// 결제 전 화면 요건은 ProPaywall 과 같다(애플 3.1.2 · Play): 상품·기간·가격(스토어 현지 문자열)·
// 포함 혜택·자동 갱신·해지·구매 복원·약관·개인정보·첫 화면 닫기 44×44.
// «PRO 시작하기»는 ProPaywall 과 같은 구매 흐름(useProStatus().purchase('monthly'))을 부른다.
// 스토어 가격이 아직 없으면 기존 ProPaywall 을 연다(그 화면이 오퍼를 다시 받고 정직한 상태를 보여 준다).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { useProStatus } from '@/hooks/useProStatus';
import { IAP_LIVE } from '@/config/iap';
import { paywallLegalCopy, useLineEdgeDots } from '@/components/app/ProPaywall';
import { AppTickerLogo } from '@/components/app/AppTickerLogo';
import { FREE_LIMIT, MAX_ITEMS, useAppWatchlist } from '@/lib/app/watchlist';
import { isPreviewHost, notifyProPurchased } from '@/lib/app/proEntitlement';
import { wlUI, type VerifiedLevels } from '@/lib/app/watchlistUI';
import { trackWatchlist } from '@/lib/app/watchlistAnalytics';
import { WATCHLIST_CHIP_TIERING } from '@/lib/app/watchlistFlags';
import { fmtLevel, fmtPrice, type WlLocale } from '@/lib/app/watchlistInsights';
import { wlCopy } from './copy';
import { WlIcon, SignumMark } from './icons';
import { StarBadge } from './StarButton';
import { canRedeemHere, openRedeem } from '@/lib/app/redeem';
import s from './watchlist.module.css';

export type UpsellMode = 'limit' | 'alerts' | 'generic' | 'chips';

function isNativeNow(): boolean {
  try { return !!require('@capacitor/core').Capacitor?.isNativePlatform?.(); } catch { return false; }
}

type Props = {
  mode: UpsellMode;
  loc: WlLocale;
  ticker?: string | null;
  levels?: VerifiedLevels | null;
  alertsOn: boolean;
  titleId: string;
  onClose: () => void;
  onNavigate: (path: string) => void;
  /** 구매·복원으로 PRO 가 된 뒤 할 일(한도 시트: 담으려던 종목을 담는다) */
  onBecamePro: () => void;
};

/** 알림 예시 — 검사를 통과한 레벨로만 숫자를 쓴다. 없으면 숫자 없는 문장. */
function exampleAlert(loc: WlLocale, t: string, lv: VerifiedLevels | null | undefined): { title: string; detail: string } {
  if (lv) {
    const basis = lv.basisLabel || (loc === 'ko' ? '종가' : loc === 'ja' ? '終値' : 'Close');
    const detail = loc === 'ko' ? `${basis} ${fmtPrice(lv.S)} · 맥스 페인 ${fmtLevel(lv.mp)} · 콜 월 ${fmtLevel(lv.cw)}`
      : loc === 'ja' ? `${basis} ${fmtPrice(lv.S)} · マックスペイン ${fmtLevel(lv.mp)} · コールウォール ${fmtLevel(lv.cw)}`
      : `${basis} ${fmtPrice(lv.S)} · max pain ${fmtLevel(lv.mp)} · call wall ${fmtLevel(lv.cw)}`;
    if (lv.gf != null) {
      const below = lv.S < lv.gf;
      const g = fmtLevel(lv.gf);
      const title = loc === 'ko' ? `${t} · 감마 플립 ${g} ${below ? '아래로' : '위로'}`
        : loc === 'ja' ? `${t} · ガンマフリップ ${g} ${below ? 'を下抜け' : 'を上抜け'}`
        : `${t} · ${below ? 'below' : 'above'} gamma flip ${g}`;
      return { title, detail };
    }
    const title = loc === 'ko' ? `${t} · 콜 월 ${fmtLevel(lv.cw)} 돌파` : loc === 'ja' ? `${t} · コールウォール ${fmtLevel(lv.cw)} 突破` : `${t} · broke call wall ${fmtLevel(lv.cw)}`;
    return { title, detail };
  }
  // 숫자를 지어내지 않는다 — 레벨이 검증되지 않았으면 모양만 보여 준다
  return loc === 'ko'
    ? { title: `${t} · 콜 월 돌파`, detail: '5분 봉 확정 시 · 다음 벽과 맥스 페인을 함께' }
    : loc === 'ja'
      ? { title: `${t} · コールウォール突破`, detail: '5分足確定時 · 次の壁とマックスペインを一緒に' }
      : { title: `${t} · call wall breakout`, detail: 'On a confirmed 5-min close · with the next wall and max pain' };
}

export function ProUpsellSheet({ mode, loc, ticker, levels, alertsOn, titleId, onClose, onNavigate, onBecamePro }: Props) {
  const c = wlCopy(loc);
  const legal = paywallLegalCopy(loc);
  const wl = useAppWatchlist();
  const { isPro, ready, offers, purchase, restore, iapAvailable, refreshOffers } = useProStatus();
  const preview = isPreviewHost();
  // 첫 그림부터 구매 줄을 그린다(iapAvailable 은 한 박자 늦게 온다) — 이 시트는 클라이언트 전용이라 바로 물을 수 있다
  const showBuy = iapAvailable || preview || (IAP_LIVE && isNativeNow());
  const monthly = offers.find((o) => o.plan === 'monthly') ?? null;
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const sheetName = mode;
  const linksRef = useRef<HTMLDivElement>(null);
  useLineEdgeDots(linksRef);

  useEffect(() => { if (iapAvailable && !monthly) void refreshOffers(); }, [iapAvailable, monthly, refreshOffers]);

  // 구매·복원(또는 다른 경로)으로 PRO 가 되면 이 시트는 할 일을 다 했다
  useEffect(() => {
    if (!isPro) return;
    notifyProPurchased(true);
    onBecamePro();
  }, [isPro, onBecamePro]);

  const onStart = useCallback(async () => {
    trackWatchlist('wl_cta', { sheet: sheetName, cta: 'pro_start' });
    if (busy) return;
    if (!monthly) { wlUI.openPaywall(mode === 'alerts' ? 'alerts' : 'watchlist'); return; }
    setBusy(true);
    setNote(null);
    const r = await purchase('monthly');
    setBusy(false);
    trackWatchlist('wl_purchase', { sheet: sheetName, ok: !!(r.ok && r.isPro), cancelled: !!r.cancelled });
    if (r.ok && r.isPro) return;                  // 위 effect 가 이어서 처리한다
    if (!r.ok && !r.cancelled) setNote(c.purchaseFailed);
  }, [busy, monthly, purchase, mode, sheetName, c.purchaseFailed]);

  const onRestore = useCallback(async () => {
    trackWatchlist('wl_cta', { sheet: sheetName, cta: 'restore' });
    if (busy) return;
    setBusy(true);
    setNote(legal.restoring);
    const r = await restore();
    setBusy(false);
    setNote(r.ok && r.isPro ? legal.restored : r.ok ? legal.nothingToRestore : legal.failed);
  }, [busy, restore, sheetName, legal]);

  const alertsLede = c.alertLede(ticker ?? null);
  const ex = exampleAlert(loc, ticker || 'NVDA', levels);

  const tiering = WATCHLIST_CHIP_TIERING;
  // 혜택은 한 줄씩 — 내 종목 100개 · 광고 없음(알림·칩 줄은 그 기능이 켜진 빌드에서만). 칩 시트는 제목이 이미 «칩 2개»라 칩 줄을 되풀이하지 않는다
  const benefits = [
    { key: 'u', tile: s.tPro, icon: 'list' as const, b: c.bCapacity(MAX_ITEMS) },
    ...(alertsOn ? [{ key: 'a', tile: s.tLvl, icon: 'bell' as const, b: c.bAlerts }] : []),
    ...(tiering && mode !== 'chips' ? [{ key: 'c', tile: s.tFlow, icon: 'layers' as const, b: c.bChips }] : []),
    { key: 'n', tile: s.tEv, icon: 'adoff' as const, b: c.bNoAds },
  ];
  // 제목과 트리거 한 줄 — 한도 시트 «무료는 5종목까지 / PRO로 100종목까지», PRO 카드 시트는 거꾸로, 칩 시트 «칩 2개 / 무료는 행마다 1개»
  const title = mode === 'limit' ? c.limitTitle(FREE_LIMIT) : mode === 'alerts' ? c.alertTitle
    : mode === 'chips' ? c.bChips : c.proTrigger(MAX_ITEMS);
  const trigger = mode === 'limit' ? c.proTrigger(MAX_ITEMS) : mode === 'chips' ? c.bChipsSub
    : mode === 'generic' ? c.limitTitle(FREE_LIMIT) : null;

  return (
    <>
      <span className={s.shEb}>{c.eyebrow}</span>
      <h2 className={s.shT} id={titleId} tabIndex={-1}>{title}</h2>
      <p className={s.shL}>
        {trigger}
        {mode === 'alerts' && <>{alertsLede[0] ? <b>{alertsLede[0]}</b> : null}{alertsLede[1]}</>}
      </p>

      {mode === 'limit' && wl.count > 0 && (
        <>
          <div className={s.lab}>{c.inList(wl.count, FREE_LIMIT)}</div>
          {/* 내용 폭 칩 + 줄바꿈 — 칸을 5등분하면 360~390폭에서 티커가 잘렸다(C2). 티커는 자르지 않는다 */}
          <div className={s.mcs}>
            {wl.tickers.map((t) => (
              <span key={t} className={s.mc}>
                <AppTickerLogo symbol={t} size={18} />
                <StarBadge variant="mini" />
                <span>{t}</span>
              </span>
            ))}
          </div>
        </>
      )}

      {mode === 'alerts' && (
        <>
          <div className={s.lab}>{c.example}</div>
          <div className={s.nt} aria-hidden="true">
            <span className={s.appic}><SignumMark /></span>
            <div className={s.ntB}>
              <div className={s.ntH}><b>SIGNUM HQ</b><time>{c.now}</time></div>
              <p className={s.ntT}>{ex.title}</p>
              <p className={s.ntD}>{ex.detail}</p>
            </div>
          </div>
          <ul className={s.bn}>
            <li><span className={`${s.tile} ${s.tLvl}`}><WlIcon name="ceil" /></span><span className={s.bnTx}><b>{c.aLvl}</b><small>{c.aLvlSub}</small></span></li>
            <li><span className={`${s.tile} ${s.tMp} ${s.tileFill}`}><WlIcon name="diamond" /></span><span className={s.bnTx}><b>{c.aMp}</b><small>{c.aMpSub}</small></span></li>
            <li><span className={`${s.tile} ${s.tEv}`}><WlIcon name="cal" /></span><span className={s.bnTx}><b>{c.aEarn}</b><small>{c.aEarnSub}</small></span></li>
          </ul>
          <p className={s.incl}><b>{c.inclHead}</b>{c.incl(tiering, MAX_ITEMS)}</p>
        </>
      )}

      {mode !== 'alerts' && (
        <ul className={s.bn}>
          {benefits.map((x) => (
            <li key={x.key}>
              <span className={`${s.tile} ${x.tile}`}><WlIcon name={x.icon} /></span>
              <span className={s.bnTx}><b>{x.b}</b></span>
            </li>
          ))}
        </ul>
      )}

      {showBuy && (
        <div className={s.price}>
          <span className={s.pl}>{c.proLabel}</span>
          {monthly
            ? <span className={`${s.slot} ${s.slotReal}`}>{monthly.priceString}</span>
            : <span className={s.slot}>{preview && !iapAvailable ? c.slotPlaceholder : ready ? legal.unavailable : '···'}</span>}
          {/* «/ 월»은 스토어 가격이 있을 때만 — «지금은 구매할 수 없습니다 / 월»이 되지 않게(C5) */}
          {monthly && <span className={s.per}>{c.per}</span>}
        </div>
      )}
      {showBuy && (
        <button type="button" className={s.cta} onClick={onStart} disabled={busy}>
          {busy ? c.busy : c.cta}
        </button>
      )}
      {mode === 'limit' && (
        <button type="button" className={s.ghost} onClick={() => {
          trackWatchlist('wl_cta', { sheet: sheetName, cta: 'manage' });
          onClose();
          onNavigate('watchlist?edit=1');
        }}>
          <WlIcon name="list" />{c.manage}
        </button>
      )}
      <div className={s.duo}>
        {(canRedeemHere() || preview) && (
          <>
            <button type="button" onClick={() => {
              trackWatchlist('wl_cta', { sheet: sheetName, cta: 'code' });
              void openRedeem(mode === 'limit' ? 'wl_limit' : 'wl_upsell', loc);
            }}>
              <WlIcon name="ticket" />{c.code}
            </button>
            <i aria-hidden="true" />
          </>
        )}
        <button type="button" onClick={() => { trackWatchlist('wl_cta', { sheet: sheetName, cta: 'later' }); onClose(); }}>{c.later}</button>
      </div>
      {note && <p className={s.note} role="status">{note}</p>}
      {showBuy && <p className={s.fine}>{legal.fine}</p>}
      <div ref={linksRef} className={s.links}>
        {showBuy && (
          <>
            <button type="button" onClick={onRestore} disabled={busy}>{legal.restore}</button>
            <i data-sep="" aria-hidden="true">{legal.and}</i>
          </>
        )}
        <button type="button" onClick={() => { onClose(); onNavigate('terms'); }}>{legal.terms}</button>
        <i data-sep="" aria-hidden="true">{legal.and}</i>
        <button type="button" onClick={() => { onClose(); onNavigate('privacy'); }}>{legal.privacy}</button>
      </div>
    </>
  );
}
