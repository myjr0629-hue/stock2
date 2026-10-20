'use client';

// ============================================================================
// 대가 렌즈 — 종목 화면 «통과 렌즈 n» 칩 + «왜 걸렸나» 패널
//
// ★ 칩은 펀더멘탈 카드의 «점수 줄»(기존 칩 줄) 오른쪽 빈자리에만 들어간다 — 새 줄·새 카드 없음.
//   칩 높이(≈24px)는 그 줄의 점수 숫자(32px)보다 낮아 줄 높이가 변하지 않는다.
// ★ 통과 0·응답 결측·검증 실패면 칩을 «그리지 않는다»(숫자 0 을 쓰지 않는다).
// ★ 패널은 누를 때만 열린다(기본 닫힘 — 기존 배치 변화 0).
// ============================================================================

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    GURU, LENS_NAME, T, chipCount, lensesHref, md, tickerLens, toLoc, whyLine, type TickerLens,
} from '@/lib/app/guruLens';
import s from './GuruLens.module.css';

/** 종목 역조회(배지 없이 규칙 판정만). 티커가 바뀌면 이전 종목 값을 즉시 버린다. */
export function useTickerLens(ticker: string | null | undefined): TickerLens | null {
    const [state, setState] = useState<{ ticker: string; data: TickerLens | null } | null>(null);
    useEffect(() => {
        if (!ticker) return;
        const controller = new AbortController();
        fetch(`/api/guru-lens?ticker=${encodeURIComponent(ticker)}&badges=0`, { signal: controller.signal })
            .then(r => (r.ok ? r.json() : null))
            .then(body => { if (!controller.signal.aborted) setState({ ticker, data: tickerLens(body, ticker) }); })
            .catch(() => { if (!controller.signal.aborted) setState({ ticker, data: null }); });
        return () => controller.abort();
    }, [ticker]);
    return state && state.ticker === ticker ? state.data : null;
}

export function GuruLensChip({ data, open, onToggle, locale, controls }: {
    data: TickerLens | null; open: boolean; onToggle: () => void; locale: string; controls: string;
}) {
    const n = chipCount(data);
    if (n === null) return null;
    const t = T[toLoc(locale)];
    return (
        <button type="button" className={s.chip} data-testid="guru-lens-chip" aria-expanded={open}
            aria-controls={controls} aria-label={t.chipAria(n)} onClick={onToggle}>
            <span className={s.chipDot} aria-hidden="true" />
            {t.chip(n)}
            <span className={s.chipCaret} aria-hidden="true">{open ? '⌃' : '⌄'}</span>
        </button>
    );
}

export function GuruLensWhy({ data, locale, id }: { data: TickerLens; locale: string; id: string }) {
    const router = useRouter();
    const loc = toLoc(locale), t = T[loc];
    const passed = data.lenses.filter(l => data.passedLenses.includes(l.definition.id));
    return (
        <div id={id} className={s.panel} data-testid="guru-lens-why">
            <div className={s.panelHead}>
                <b>{t.why}</b>
                <span>{t.basis(md(data.asOf), data.financialYear)}</span>
            </div>
            {passed.map(l => {
                const row = l.rows.find(r => r.ticker === data.ticker);
                const line = row ? whyLine(l.definition.id, row, loc) : null;
                return (
                    <div key={l.definition.id} className={s.lens}>
                        <div className={s.lensName}>
                            <b>{LENS_NAME[l.definition.id][loc]}</b>
                            <span>{t.interpreted(GURU[l.definition.id][loc])}</span>
                        </div>
                        {line && <p className={s.lensWhy}>{line}</p>}
                    </div>
                );
            })}
            <button type="button" className={s.more} onClick={() => router.push(lensesHref(locale, data.passedLenses[0]))}>
                {t.more}<span aria-hidden="true">›</span>
            </button>
        </div>
    );
}
