'use client';

// ============================================================================
// 대가 렌즈 랭킹 — 종목 화면 «통과 렌즈 n» 칩 → «렌즈별 순위 보기»로만 들어온다(하단 탭 추가 없음).
//
// ★ 렌즈 카드 10장. 누르면 펼쳐진다(한 번에 한 장). Top 3 = 무료 · 4~10위 = 기존 ValueWall(광고 1시간·Pro).
// ★ 행마다 배지 3종(13F 말과 행동·기준일 / 오늘의 돈 4신호 중 2개 이상 겹침 / 실적 D-n·예상 변동) — 값 있는 것만.
// ★ 결측: «집계 n/495»는 분모를 알 때만. 통과 0 은 «0종목» 대신 «가장 가까운 종목 · 규칙 미충족».
// ★ 문구: «규칙 충족»만. 대가 이름 옆엔 «○○ 공개 기준을 우리가 해석».
// ============================================================================

import { Suspense, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AppTickerLogo } from '@/components/app/AppTickerLogo';
import { ValueWall } from '@/components/app/ValueWall';
import {
    FREE_ROWS, GURU, LENS_NAME, T, badgeTexts, coverageText, headline, lensBody, md, toLoc, whyLine,
    type LensBody, type LensList, type LensRow, type Loc,
} from '@/lib/app/guruLens';
import type { LensId } from '@/lib/guruLens/types';
import s from './lenses.module.css';

function Row({ id, row, rank, loc, locale }: { id: LensId; row: LensRow; rank: number; loc: Loc; locale: string }) {
    const router = useRouter();
    const why = whyLine(id, row, loc);
    const badges = badgeTexts(id, row.badges, loc);
    const go = () => router.push(`/${locale}/app-view/cmd?t=${encodeURIComponent(row.ticker)}`);
    return (
        <a className={s.row} role="button" tabIndex={0} onClick={go}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } }}>
            <span className={s.rowTop}>
                <span className={`${s.rank} num`}>{rank}</span>
                <AppTickerLogo symbol={row.ticker} size={18} />
                <b className={s.tk}>{row.ticker}</b>
                {row.name && <span className={s.nm}>{row.name}</span>}
                <span className={s.go} aria-hidden="true">›</span>
            </span>
            {why && <span className={s.why}>{why}</span>}
            {badges.length > 0 && (
                <span className={s.badges}>{badges.map(b => <span key={b} className={s.badge}>{b}</span>)}</span>
            )}
        </a>
    );
}

function LensCard({ lens, open, onToggle, universe, loc, locale }: {
    lens: LensList; open: boolean; onToggle: () => void; universe: number; loc: Loc; locale: string;
}) {
    const t = T[loc];
    const id = lens.definition.id;
    const cov = coverageText(lens, universe, loc);
    const free = lens.rows.slice(0, FREE_ROWS), locked = lens.rows.slice(FREE_ROWS);
    return (
        <section className={`${s.card} ${open ? s.open : ''}`} id={`lens-${id}`} data-testid="guru-lens-card">
            <button type="button" className={s.cardHead} aria-expanded={open} onClick={onToggle}>
                <span className={s.guru}>{GURU[id][loc]}</span>
                <span className={s.lensName}>{LENS_NAME[id][loc]}</span>
                <span className={s.meta}>
                    <b className={lens.mode === 'passed' ? s.pass : s.near}>{headline(lens, loc)}</b>
                    {cov && <span className="num">{cov}</span>}
                </span>
                {!open && free.length > 0 && (
                    <span className={s.peek} aria-hidden="true">
                        {free.map(r => <span key={r.ticker} className={s.peekT}><AppTickerLogo symbol={r.ticker} size={14} />{r.ticker}</span>)}
                    </span>
                )}
                <span className={s.caret} aria-hidden="true">{open ? '⌃' : '⌄'}</span>
            </button>
            {open && (
                <div className={s.body}>
                    {free.map((r, i) => <Row key={r.ticker} id={id} row={r} rank={i + 1} loc={loc} locale={locale} />)}
                    {locked.length > 0 && (
                        <ValueWall locale={locale} compact inset title={t.lockTitle} subtitle={t.lockSub}>
                            <div>{locked.map((r, i) => <Row key={r.ticker} id={id} row={r} rank={FREE_ROWS + i + 1} loc={loc} locale={locale} />)}</div>
                        </ValueWall>
                    )}
                    <p className={s.note}>{t.interpreted(GURU[id][loc])}</p>
                </div>
            )}
        </section>
    );
}

function LensesInner() {
    const router = useRouter();
    const params = useParams();
    const search = useSearchParams();
    const locale = (params?.locale as string) || 'ko';
    const loc = toLoc(locale), t = T[loc];
    const [data, setData] = useState<LensBody | null | undefined>(undefined);
    const [open, setOpen] = useState<string | null>(search.get('lens'));

    useEffect(() => {
        const controller = new AbortController();
        fetch('/api/guru-lens', { signal: controller.signal })
            .then(r => (r.ok ? r.json() : null))
            .then(body => { if (!controller.signal.aborted) setData(lensBody(body)); })
            .catch(() => { if (!controller.signal.aborted) setData(null); });
        return () => controller.abort();
    }, []);
    // 칩에서 들어오면 그 렌즈 카드로 한 번 스크롤
    useEffect(() => {
        const want = search.get('lens');
        if (data && want) document.getElementById(`lens-${want}`)?.scrollIntoView({ block: 'start' });
    }, [data, search]);

    return (
        <div className={s.wrap}>
            <div className={s.nav}>
                <button type="button" className={s.back} aria-label={t.back} onClick={() => router.back()}>
                    <svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7" /></svg>
                </button>
            </div>
            <div className={s.head}>
                <div className={s.title}>{t.title}</div>
                <div className={s.sub}>
                    {t.sub}
                    {data && <> · {t.basis(md(data.asOf), data.financialYear)}</>}
                </div>
            </div>
            {data === undefined && [0, 1, 2].map(i => <div key={i} className={s.skel} />)}
            {data === null && <p className={s.empty}>{t.none}</p>}
            {data && data.lenses.map(l => (
                <LensCard key={l.definition.id} lens={l} universe={data.universeCount} loc={loc} locale={locale}
                    open={open === l.definition.id}
                    onToggle={() => setOpen(o => (o === l.definition.id ? null : l.definition.id))} />
            ))}
        </div>
    );
}

export default function LensesPage() {
    return <Suspense fallback={null}><LensesInner /></Suspense>;
}
