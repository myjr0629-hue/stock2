'use client';

/**
 * 의회 거래 공시 카드 — Command «기관 · 내부자 공시» 섹션.
 *
 * ══════════════════════════════════════════════════════════════════════
 * [왜 여기인가]
 *   13-F(기관 보유) · 내부자(회사 임원) 와 나란한 **세 번째 공시 종류**다.
 *   셋 다 "누가 이 종목을 사고팔았나"를 말하지만 정보의 출처가 다르다:
 *     내부자 = 회사 내부 사정 · 13F = 기관의 분기 보유
 *     의회   = **정책·규제** (법안·예산·청문회를 만드는 사람들)
 *
 * [한계를 화면에 적는다]
 *   · STOCK Act 는 45일 내 공시만 의무다 → **이미 지난 일**이다.
 *     그래서 «며칠 전 거래인지»를 반드시 같이 보여 준다.
 *   · 금액은 구간 공시다("$100,001 - $250,000") → 중간값 추정이라고 밝힌다.
 *   · ★ «건수»가 아니라 «사람 수»가 신호의 세기다. 실측: GS 17건이 의원 1명,
 *     TKNO 32건도 1명. 건수만 보면 한 사람의 행동이 집단 신호로 둔갑한다.
 */

import { useEffect, useState } from 'react';
import { Landmark } from 'lucide-react';

type Locale = 'ko' | 'en' | 'ja';

const T = {
    title: { ko: '의회 거래', en: 'Congress Trades', ja: '議会取引' },
    members: { ko: '명', en: '', ja: '名' },
    buy: { ko: '매수', en: 'Buy', ja: '買い' },
    sell: { ko: '매도', en: 'Sell', ja: '売り' },
    net: { ko: '순', en: 'Net', ja: '純' },
    lastTrade: { ko: '최근 거래', en: 'Last trade', ja: '直近取引' },
    daysAgo: { ko: '일 전', en: 'd ago', ja: '日前' },
    estimate: { ko: '금액은 구간 공시 기준 추정', en: 'Amounts are disclosed as ranges (estimate)', ja: '金額は区間開示に基づく推定' },
} as const;

const money = (v: number) => {
    const a = Math.abs(v);
    if (a >= 1e9) return `$${(a / 1e9).toFixed(1)}B`;
    if (a >= 1e6) return `$${(a / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `$${(a / 1e3).toFixed(0)}K`;
    return `$${a.toFixed(0)}`;
};

const daysSince = (iso: string): number | null => {
    const t = Date.parse(String(iso || ''));
    return Number.isFinite(t) ? Math.max(0, Math.round((Date.now() - t) / 86400_000)) : null;
};

/**
 * 해석 문장 — «무엇을 읽어야 하는가»를 한 줄로.
 *
 * 대표 요청: 「같은 방향을 말하고 있을 때는 그것에 대한 해석 멘트를」
 * 그래서 내부자 방향과 겹칠 때를 가장 강하게 쓴다. 겹치지 않으면 억지로
 * 의미를 부여하지 않고, 사람 수·신선도만 사실대로 말한다.
 */
function readOut(
    sig: { side: string; people: number; buys: number; sells: number },
    lagDays: number | null,
    insiderDir: 'buy' | 'sell' | null,
    locale: Locale
): { text: string; tone: 'up' | 'down' | 'flat' } {
    const dir: 'buy' | 'sell' | null = sig.side === 'buy' ? 'buy' : sig.side === 'sell' ? 'sell' : null;
    const many = sig.people >= 2;
    const fresh = lagDays != null && lagDays <= 45;
    const aligned = dir != null && insiderDir != null && dir === insiderDir;

    if (aligned) {
        const t = {
            ko: dir === 'buy'
                ? `의원 ${sig.people}명과 내부자가 **같은 방향(매수)** 입니다. 서로 다른 정보원이 겹칠 때가 가장 의미 있습니다.`
                : `의원 ${sig.people}명과 내부자가 **같은 방향(매도)** 입니다. 서로 다른 정보원이 겹칠 때가 가장 의미 있습니다.`,
            en: `Congress and insiders are moving the **same way (${dir})** — different information sources agreeing is the strongest read.`,
            ja: `議員${sig.people}名と内部者が**同じ方向(${dir === 'buy' ? '買い' : '売り'})**です。異なる情報源が一致する時が最も意味を持ちます。`,
        }[locale];
        return { text: t, tone: dir === 'buy' ? 'up' : 'down' };
    }

    if (many && dir) {
        const t = {
            ko: `서로 다른 의원 ${sig.people}명이 ${dir === 'buy' ? '매수' : '매도'} 쪽입니다. 한 사람의 반복 신고와 달리 우연일 가능성이 낮습니다.`,
            en: `${sig.people} different members are on the ${dir} side — less likely coincidence than one member filing repeatedly.`,
            ja: `異なる議員${sig.people}名が${dir === 'buy' ? '買い' : '売り'}側です。一人の繰り返し届出とは違い偶然の可能性が低いです。`,
        }[locale];
        return { text: t, tone: dir === 'buy' ? 'up' : 'down' };
    }

    if (sig.people === 1) {
        const t = {
            ko: `의원 1명의 거래입니다. 건수가 많아도 한 사람의 판단이므로 단독 신호로 보기 어렵습니다.`,
            en: `A single member's activity. Even with many filings it is one person's decision — weak as a standalone signal.`,
            ja: `議員1名の取引です。件数が多くても一人の判断であり、単独のシグナルとしては弱いです。`,
        }[locale];
        return { text: t, tone: 'flat' };
    }

    const t = {
        ko: fresh ? '최근 공시된 거래입니다.' : '공시 지연이 커 이미 지난 움직임입니다.',
        en: fresh ? 'Recently disclosed.' : 'Disclosed with a long lag — this is already past.',
        ja: fresh ? '最近開示された取引です。' : '開示の遅れが大きく、既に過去の動きです。',
    }[locale];
    return { text: t, tone: 'flat' };
}

export function MobileCongressCard({ ticker, locale = 'en' }: { ticker: string; locale?: string }) {
    const loc = (['ko', 'en', 'ja'].includes(locale) ? locale : 'en') as Locale;
    const L = (k: keyof typeof T) => T[k][loc] ?? T[k].en;

    const [sig, setSig] = useState<any>(null);
    const [lag, setLag] = useState<number | null>(null);
    const [insiderDir, setInsiderDir] = useState<'buy' | 'sell' | null>(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const [cRes, iRes] = await Promise.all([
                    fetch(`/api/flow/congress?t=${encodeURIComponent(ticker)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
                    fetch(`/api/command/insider?ticker=${encodeURIComponent(ticker)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
                ]);
                if (!alive) return;
                const s = cRes?.signal || null;
                setSig(s && (s.buys + s.sells) > 0 ? s : null);
                // 가장 최근 거래의 «며칠 전»
                const t0 = (cRes?.trades || [])[0];
                setLag(t0?.transactionDate ? daysSince(t0.transactionDate) : null);
                // 내부자 «실매매» 방향 — 없으면 null (없는 방향을 만들지 않는다)
                const ins = iRes?.insider;
                const b = Number(ins?.buyCount) || 0, sl = Number(ins?.sellCount) || 0;
                setInsiderDir(b > sl ? 'buy' : sl > b ? 'sell' : null);
            } catch { /* 실패하면 카드를 안 그린다 */ }
        })();
        return () => { alive = false; };
    }, [ticker]);

    // 활동이 없으면 **아예 안 그린다.** 「거래 없음」 칸이 자리를 차지할 이유가 없다.
    if (!sig) return null;

    const { text, tone } = readOut(sig, lag, insiderDir, loc);
    const toneColor = tone === 'up' ? 'text-emerald-400' : tone === 'down' ? 'text-rose-400' : 'text-slate-300';
    const accent = tone === 'up' ? 'border-emerald-500/25' : tone === 'down' ? 'border-rose-500/25' : 'border-white/[0.08]';

    return (
        <div className={`rounded-xl bg-white/[0.03] border ${accent} p-3 space-y-2`}>
            <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[12px] font-bold text-slate-300">
                    <Landmark className="w-3.5 h-3.5 text-sky-400" />
                    {L('title')}
                </span>
                <span className="text-[11px] font-bold text-sky-300 font-mono tabular-nums">
                    {sig.people}{L('members')}
                </span>
            </div>

            <div className="flex items-baseline justify-between gap-2 text-[12px] font-mono tabular-nums">
                <span className="text-slate-400">
                    <span className="text-emerald-400 font-semibold">{L('buy')} {sig.buys}</span>
                    <span className="opacity-40"> · </span>
                    <span className="text-rose-400 font-semibold">{L('sell')} {sig.sells}</span>
                </span>
                <span className={`font-bold ${sig.netMid >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {L('net')} {sig.netMid >= 0 ? '+' : '-'}{money(sig.netMid)}
                </span>
            </div>

            <div className="flex items-baseline justify-between gap-2 text-[10.5px] font-mono text-slate-500 tabular-nums">
                <span>{L('lastTrade')} {sig.lastTransaction?.slice(5) || '—'}{lag != null ? ` · ${lag}${L('daysAgo')}` : ''}</span>
                <span className="opacity-70">{L('estimate')}</span>
            </div>

            <p className={`text-[11.5px] leading-[1.5] ${toneColor} border-t border-white/[0.06] pt-2`}>
                {text.replace(/\*\*/g, '')}
            </p>
        </div>
    );
}
