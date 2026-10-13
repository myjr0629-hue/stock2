'use client';

// ============================================================================
// 첫 실행 «가치 먼저» — 가치 단계(종목 1~3개 고르기 → 그 종목의 지형·AI 한 줄·실적 변동폭 → 내 종목에 담기)와 알림 단계 (2026-10-12)
// ----------------------------------------------------------------------------
// 법적 고지·약관 동의(AppFirstRunOnboarding 의 1단계)는 건드리지 않는다 — 이 단계들은 그 «뒤에» 온다.
// 데이터는 이미 운영 중인 읽기 API 뿐(firstRunValueData.ts). AI 글은 저장본만 읽고 기다리지 않는다(없으면 줄이 없다).
// 건너뛰기는 두 단계 모두 항상 있다. 담기는 저장소에 직접(토스트·진동·평점 요청 없음) — 사용자가 «담기»를 눌러 한 일이다.
// 표시 규칙은 내 종목 목록과 같다: 숫자·레벨 이름 굵게 · AI 글은 «✦ AI» 표식 · 지도가 안 서면 AI 줄도 없다 · 금융 공통어는 번역하지 않는다.
// ============================================================================

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppTickerLogo } from '@/components/app/AppTickerLogo';
import { PositionMap, MiniMap } from '@/components/app/watchlist/PositionMap';
import { wlCopy } from '@/components/app/watchlist/copy';
import { WlIcon, SignumMark } from '@/components/app/watchlist/icons';
import { cancelAiFollowUps, usePushPreview, useTickerSearch, useValueData } from '@/components/app/firstRunValueData';
import { FREE_LIMIT, getWatchlistStore } from '@/lib/app/watchlist';
import { firstRunCopy } from '@/lib/app/firstRunCopy';
import {
  ONB_PICK_MAX, ONB_POPULAR, commitPicks, earningsText, impliedBasisLine, impliedPctLabel, pickSrc, togglePick,
  type ValueCard, type OnbEarnings,
} from '@/lib/app/firstRunValue';
import { fmtMD, fmtPrice, fmtSignedPct, type WlLocale } from '@/lib/app/watchlistInsights';
import { tickerName } from '@/lib/app/tickerNames';
import { levelOutOfRangeText } from '@/lib/optionLevelGate';
import { IMPLIED_LABEL } from '@/lib/earnings/earningsImplied';
import { trackFunnel } from '@/lib/app/funnelBeacon';
import { hapticNotification } from '@/lib/native/capacitorBridge';
import base from './AppFirstRunOnboarding.module.css';
import st from './FirstRunValueStep.module.css';

/** AI 한 줄의 숫자($215 · 6.4% · ±3.2%)와 레벨 이름을 강조 칸으로 — 글자는 그대로, 모양만(내 종목 목록 aiEmph 와 같다) */
const AI_EMPH_RE = /(Max Pain|Call Wall|Put Floor|Gamma Flip|[$±]?\d[\d,]*(?:\.\d+)?%?)/g;
function emph(seg: string): ReactNode[] {
  return seg.split(AI_EMPH_RE).map((part, i) => (i % 2 === 1 ? <b key={i} className={st.aiEm}>{part}</b> : part));
}

const Check = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);

/** 카드 한 장 */
function PickCard({ card, loc, name, priceReady, levelsReady, earn, onRemove }: {
  card: ValueCard; loc: WlLocale; name: string; priceReady: boolean; levelsReady: boolean; earn: OnbEarnings | null; onRemove: () => void;
}) {
  const t = firstRunCopy(loc).value;
  const c = wlCopy(loc);
  // 가격은 시세 요청(1~2초)이 먼저 와서 바로 그린다 · 지도는 레벨 묶음(수 초)이 올 때까지 뼈대. 시세 응답이 끝내 안 와도 뼈대가 영원히 남지 않게 —
  // 8초 뒤엔 가격 «—»로 정한다(레벨은 묶음 요청이 실패해도 재시도 뒤 «없음»으로 정해진다 — firstRunValueData.requestLevels)
  const [late, setLate] = useState(false);
  useEffect(() => { const id = window.setTimeout(() => setLate(true), 8_000); return () => window.clearTimeout(id); }, []);
  const pxDone = priceReady || late;
  const ch = card.changePct;
  const dir = ch == null ? st.flat : ch > 0 ? st.up : ch < 0 ? st.dn : st.flat;

  return (
    <article className={st.card} aria-label={card.t}>
      <div className={st.cardTop}>
        <span className={st.cardLogo}><AppTickerLogo symbol={card.t} size={30} /></span>
        <span className={st.cardId}>
          <b>{card.t}</b>
          {name && <small>{name}</small>}
        </span>
        <span className={st.cardPx}>
          {pxDone ? (
            <>
              <b>{card.price != null ? fmtPrice(card.price) : <span className={st.dash}>—</span>}</b>
              {ch != null && <small className={dir}><i className={st.tri} />{fmtSignedPct(ch, 2)}</small>}
              {card.price != null && <em>{card.basisShort}</em>}
            </>
          ) : (
            <>
              <i className={`${st.skel} ${st.skelPx}`} />
              <i className={`${st.skel} ${st.skelPx2}`} />
            </>
          )}
        </span>
        <button type="button" className={st.cardX} onClick={onRemove} aria-label={t.remove(card.t)}><WlIcon name="x" /></button>
      </div>

      <div className={st.cardMap}>
        {levelsReady ? (
          <PositionMap
            levels={card.levels}
            basisShort={card.basisShort}
            labels={{
              putFloor: c.putFloor, callWall: c.callWall, maxPain: c.maxPain,
              wait: c.levelsWait, waitAria: c.levelsWaitAria, outOfRange: levelOutOfRangeText(loc), dashAria: c.levelsDashAria,
              delay: c.levelsDelay, delayAria: c.levelsDelayFull,
            }}
          />
        ) : (
          <span className={st.skelMap} aria-busy="true" aria-label={t.loading}><i className={st.skel} /><b className={st.skel} /><b className={st.skel} /></span>
        )}
      </div>

      {levelsReady && card.aiText && (
        <div className={st.aiw}>
          <p className={st.ai}>
            <span className={st.aiTag} role="img" aria-label={t.aiAria}><i aria-hidden="true">✦</i>AI</span>
            <span className={st.aiTx}>
              {card.aiText.split(' · ').map((seg, i, all) => (
                <span key={i}>{i > 0 && ' '}<span className={st.aiSeg}>{emph(seg)}{i < all.length - 1 && ' ·'}</span></span>
              ))}
            </span>
          </p>
        </div>
      )}

      {earn && (
        <div className={st.earn}>
          <div className={st.earnWhen}><WlIcon name="cal" />{earningsText(earn, loc)}</div>
          {earn.implied && (
            <div className={st.earnMove}>
              <s>{IMPLIED_LABEL[loc]}</s>
              <b>{impliedPctLabel(earn.implied.pct)}</b>
              <em>{impliedBasisLine(earn.implied, loc)}</em>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

// ⚠ 머리를 <header> 로 쓰지 않는다 — 앱 화면에는 «.is-app-view header:not(.app-header) { display: none }»(웹 사이트 머리 숨기기)가 있어 <header> 는 통째로 안 보인다
//   (법적 고지 단계의 옛 머리가 그래서 지금 화면에 안 보인다 — 10/12 로컬 실측. 그 단계는 건드리지 않는다).
export function FirstRunValueStep({ loc, active, stepLabel, onFinish }: {
  loc: WlLocale;
  /** 이 단계가 화면에 있다 — 켜지면 인기 12종목의 시세·레벨·AI 한 줄을 미리 받는다 */
  active: boolean;
  stepLabel: string;
  onFinish: (how: 'done' | 'skip') => void;
}) {
  const t = firstRunCopy(loc).value;
  const [picks, setPicks] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [fullNote, setFullNote] = useState(false);
  const noteTimer = useRef<number | undefined>(undefined);
  const searchedNames = useRef(new Map<string, string>());
  const data = useValueData(picks, loc, active);
  usePushPreview(loc, active);   // 다음 단계(알림)의 «실제 푸시 미리보기»를 미리 받아 둔다(모듈 캐시 — 작은 요청 하나)
  const search = useTickerSearch(query, active);
  useEffect(() => () => { window.clearTimeout(noteTimer.current); cancelAiFollowUps(); }, []);

  // 계측용 — 이 단계에서 «한 번이라도» 고른 종목과, 그 카드에 AI 한 줄·실적 줄이 «한 번이라도» 떴는가(떠난 순간의 스냅숏이 아니다:
  // 응답이 늦게 오는 종목이 «없음»으로 세지지 않게). 종목 이름은 싣지 않고 하루 합계만 센다.
  const seenPicks = useRef(new Set<string>());
  const shownAi = useRef(new Set<string>());
  const shownEarn = useRef(new Set<string>());
  useEffect(() => {
    for (const cd of data.cards) {
      seenPicks.current.add(cd.t);
      if (cd.aiText) shownAi.current.add(cd.t);
      if (data.earnings(cd.t)) shownEarn.current.add(cd.t);
    }
  }, [data.cards, data.earnings]);
  const trackCards = () => {
    for (const tk of seenPicks.current) {
      trackFunnel('onb_card', { src: shownAi.current.has(tk) ? 'onb_ai' : 'onb_noai' });
      if (shownEarn.current.has(tk)) trackFunnel('onb_card', { src: 'onb_earn' });
    }
  };

  const q = query.trim();
  const cur = search && search.q === q ? search : null;

  const toggle = (raw: string, name?: string) => {
    const r = togglePick(picks, raw);
    if (r.change === 'invalid') return;
    if (r.change === 'full') {
      setFullNote(true);
      window.clearTimeout(noteTimer.current);
      noteTimer.current = window.setTimeout(() => setFullNote(false), 2400);
      return;
    }
    if (r.change === 'added') seenPicks.current.add(raw.trim().toUpperCase());
    if (name && r.change === 'added') searchedNames.current.set(raw.toUpperCase(), name);
    setPicks(r.picks);
    if (r.change === 'added') setQuery('');
  };

  const nameOf = (tk: string) => tickerName(tk, loc, searchedNames.current.get(tk) ?? null);

  const cardOf = useMemo(() => new Map(data.cards.map((cd) => [cd.t, cd])), [data.cards]);

  const finishDone = () => {
    if (!picks.length) return;
    commitPicks(getWatchlistStore(), picks, FREE_LIMIT);
    // 계측 — 하루 합계만(고른 수 · 카드 상태). 종목 이름은 싣지 않는다
    const n = pickSrc(picks.length);
    if (n) trackFunnel('onb_pick', { src: n });
    trackCards();
    trackFunnel('onb_done', { src: 'onb_value' });
    void hapticNotification('success');
    onFinish('done');
  };
  const finishSkip = () => {
    trackCards();
    trackFunnel('onb_skip', { src: 'onb_value' });
    onFinish('skip');
  };

  return (
    <>
      <div className={`${st.hero} ${loc === 'ja' ? st.heroJa : ''}`}>
        <span className={st.kicker}>SIGNUM HQ APP</span>
        <h1 id="app-onboarding-title" className={st.title}>{t.title}</h1>
        <p className={st.subtitle}>{t.subtitle}</p>
      </div>
      <div className={st.bodyV}>
        <p className={st.lead}>{stepLabel}</p>

        <form className={st.search} role="search" onSubmit={(e) => {
          e.preventDefault();
          const top = cur?.hits[0];
          if (top) toggle(top.symbol, top.name);
        }}>
          <WlIcon name="search" />
          <input
            className={st.searchIn}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchPh}
            aria-label={t.searchLabel}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
          />
          {!!query && (
            <button type="button" className={st.searchX} onClick={() => setQuery('')} aria-label="clear"><WlIcon name="x" /></button>
          )}
        </form>

        {q ? (
          <div className={st.hits} aria-busy={!cur}>
            {!cur ? <p className={st.note} role="status">{t.searchBusy}</p>
              : cur.failed ? <p className={st.note} role="status">{t.searchFail}</p>
              : cur.hits.length === 0 ? <p className={st.note} role="status">{t.searchNone}</p>
              : cur.hits.map((h) => {
                const on = picks.includes(h.symbol.toUpperCase());
                return (
                  <button key={h.symbol} type="button" className={st.hit} aria-pressed={on} onClick={() => toggle(h.symbol, h.name)}>
                    <AppTickerLogo symbol={h.symbol} size={24} />
                    <span className={st.hitSym}>{h.symbol}</span>
                    {(() => { const nm = tickerName(h.symbol.toUpperCase(), loc, h.name); return nm ? <span className={st.hitName}>{nm}</span> : null; })()}
                    <span className={st.hitMark}><Check /></span>
                  </button>
                );
              })}
          </div>
        ) : (
          <>
            <div className={st.chipsHead}>
              <span className={st.chipsT}>{t.popular}</span>
              <span className={`${st.count} ${fullNote ? st.countFull : ''}`} role="status">{fullNote ? t.full : t.counter(picks.length, ONB_PICK_MAX)}</span>
            </div>
            <div className={st.chips}>
              {ONB_POPULAR.map((tk) => {
                const on = picks.includes(tk);
                return (
                  <button key={tk} type="button" className={st.chip} aria-pressed={on} onClick={() => toggle(tk)}>
                    {on ? <Check /> : null}
                    <span>{tk}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {picks.length === 0 ? (
          <p className={st.empty}>{t.empty}</p>
        ) : (
          <>
            <div className={st.cards}>
              {picks.map((tk) => {
                const card = cardOf.get(tk);
                if (!card) return null;
                return (
                  <PickCard
                    key={tk}
                    card={card}
                    loc={loc}
                    name={nameOf(tk)}
                    priceReady={data.priceReady(tk)}
                    levelsReady={data.levelsReady(tk)}
                    earn={data.earnings(tk)}
                    onRemove={() => setPicks((p) => p.filter((x) => x !== tk))}
                  />
                );
              })}
            </div>
            <div className={st.legend} aria-hidden="true">
              <span>Put Floor</span>
              <MiniMap />
              <span>Call Wall</span>
              <i className={st.sep} />
              <span className={st.lk}><i className={st.dMp} />Max Pain</span>
              <span className={st.lk}><i className={st.dPx} />{t.price}</span>
            </div>
          </>
        )}
      </div>

      <div className={st.bar}>
        <button type="button" className={base.ghostButton} onClick={finishSkip}>{t.skip}</button>
        <button type="button" className={base.primaryButton} disabled={picks.length === 0} onClick={finishDone}>
          {picks.length === 0 ? t.ctaNone : t.cta(picks.length)}
        </button>
      </div>
    </>
  );
}

/**
 * 알림 단계 — «이런 알림이 옵니다»: 실제 최신 모닝 푸시 본문(AI 한 줄)을 미리 보여 주고, 큰 주 버튼 [알림 받기]가 바로 OS 권한 창을 부른다.
 * [나중에]는 작은 글자 링크(권한 창을 열지 않는다). 거절·나중에여도 앱 사용에 지장이 없다.
 */
export function FirstRunNotifStep({ loc, stepLabel, busy, onAllow, onLater }: {
  loc: WlLocale;
  stepLabel: string;
  busy: boolean;
  onAllow: () => void;
  onLater: () => void;
}) {
  const t = firstRunCopy(loc).notif;
  const preview = usePushPreview(loc, true);
  const morning = t.rows[0];
  const closing = t.rows[1];
  return (
    <>
      <div className={st.hero}>
        <span className={st.kicker}>SIGNUM HQ APP</span>
        <h1 id="app-onboarding-title" className={st.title}>{t.title}</h1>
        <p className={st.subtitle}>{t.subtitle}</p>
      </div>
      <div className={st.bodyV}>
        <p className={st.lead}>{stepLabel}</p>
        <div className={st.notifList}>
          <div className={st.banner}>
            <span className={st.bannerIcon}><SignumMark /></span>
            <div>
              <div className={st.bannerApp}>SIGNUM HQ</div>
              <div className={st.bannerTitle}>{morning.icon} {morning.title}</div>
              <div className={st.bannerText}>{preview?.body ?? morning.text}</div>
            </div>
          </div>
          <div className={st.banner}>
            <span className={st.bannerIcon}><SignumMark /></span>
            <div>
              <div className={st.bannerApp}>SIGNUM HQ</div>
              <div className={st.bannerTitle}>{closing.icon} {closing.title}</div>
              <div className={st.bannerText}>{closing.text}</div>
            </div>
          </div>
          {preview?.body && preview.date && <p className={st.example}>{t.example(fmtMD(preview.date))}</p>}
        </div>
        <div className={base.notice}>
          <p className={base.noticeTitle}>{t.noticeTitle}</p>
          <p className={base.noticeText}>{t.notice}</p>
        </div>
      </div>
      <div className={`${st.bar} ${st.barNotif}`}>
        <button type="button" className={`${base.primaryButton} ${st.bigPrimary}`} disabled={busy} onClick={onAllow}>{t.allow}</button>
        <button type="button" className={st.laterLink} disabled={busy} onClick={onLater}>{t.later}</button>
      </div>
    </>
  );
}

/** 법적 고지 단계에서 동의 체크를 누른 순간부터 가치 단계의 데이터를 미리 받는다(모듈 캐시에 쌓인다) — 아무것도 그리지 않는다 */
export function ValuePrefetch({ loc }: { loc: WlLocale }) {
  useValueData([], loc, true);
  usePushPreview(loc, true);
  return null;
}
