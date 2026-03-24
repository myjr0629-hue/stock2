import { HowItWorksLayout } from '@/components/HowItWorksLayout';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import {
    Activity, TrendingUp, Shield, BarChart3, Lightbulb, Zap, Brain, Target,
    Layers, ChevronRight, Orbit, Bot, AlertTriangle, Cpu, Rocket,
    ArrowRight, Gauge, Radio, Eye, Globe, Flame, Archive,
    Trophy, Calendar, Users, Crosshair, CreditCard, Cloud,
    LayoutGrid, Crown, TrendingDown, FileText, Sparkles
} from 'lucide-react';

export default async function IntelGuidePage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    const t = await getTranslations('intelGuide');
    const intelFullImg = locale === 'ko' ? '/guide/intel-full.png' : `/guide/intel-full-${locale}.png`;
    const m7Img = locale === 'ko' ? '/guide/intel-m7.png' : `/guide/intel-m7-${locale}.png`;

    const richTags = {
        cyan: (chunks: React.ReactNode) => <span className="text-cyan-400 font-semibold">{chunks}</span>,
        gold: (chunks: React.ReactNode) => <span className="text-amber-400 font-semibold">{chunks}</span>,
        rose: (chunks: React.ReactNode) => <span className="text-rose-400 font-semibold">{chunks}</span>,
        emerald: (chunks: React.ReactNode) => <span className="text-emerald-400 font-semibold">{chunks}</span>,
        purple: (chunks: React.ReactNode) => <span className="text-purple-400 font-semibold">{chunks}</span>,
    };

    const card = "relative overflow-hidden rounded-2xl bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] p-5";

    /* 10 Sectors */
    const sectors = [
        { key: 'm7', icon: <Orbit size={16} className="text-white" />, accent: 'from-indigo-400 to-indigo-600', tickers: ['AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA'], color: 'text-indigo-400', ring: 'border-indigo-500/20 bg-indigo-500/[0.06]' },
        { key: 'physicalAI', icon: <Bot size={16} className="text-white" />, accent: 'from-amber-400 to-orange-600', tickers: ['PLTR', 'SERV', 'PL', 'TER', 'SYM', 'RKLB', 'ISRG'], color: 'text-amber-400', ring: 'border-amber-500/20 bg-amber-500/[0.06]' },
        { key: 'siliconCore', icon: <Cpu size={16} className="text-white" />, accent: 'from-amber-300 to-yellow-600', tickers: ['AMD', 'AVGO', 'TSM', 'ARM', 'MU', 'ASML', 'MRVL'], color: 'text-amber-300', ring: 'border-amber-400/20 bg-amber-400/[0.06]' },
        { key: 'powerMatrix', icon: <Zap size={16} className="text-white" />, accent: 'from-emerald-400 to-green-600', tickers: ['CEG', 'VST', 'GEV', 'PWR', 'CCJ', 'SMR', 'ETN'], color: 'text-emerald-400', ring: 'border-emerald-500/20 bg-emerald-500/[0.06]' },
        { key: 'bioPulse', icon: <Activity size={16} className="text-white" />, accent: 'from-rose-400 to-pink-600', tickers: ['LLY', 'NVO', 'VRTX', 'REGN', 'VKTX', 'AMGN', 'GILD'], color: 'text-rose-400', ring: 'border-rose-500/20 bg-rose-500/[0.06]' },
        { key: 'cyberShield', icon: <Shield size={16} className="text-white" />, accent: 'from-cyan-400 to-blue-600', tickers: ['CRWD', 'PANW', 'FTNT', 'ZS', 'S', 'OKTA', 'NET'], color: 'text-cyan-400', ring: 'border-cyan-500/20 bg-cyan-500/[0.06]' },
        { key: 'orbitDefense', icon: <Rocket size={16} className="text-white" />, accent: 'from-sky-400 to-blue-600', tickers: ['LMT', 'RTX', 'AXON', 'KTOS', 'LDOS', 'ASTS', 'LUNR'], color: 'text-sky-400', ring: 'border-sky-500/20 bg-sky-500/[0.06]' },
        { key: 'quantumEdge', icon: <Cpu size={16} className="text-white" />, accent: 'from-fuchsia-400 to-purple-600', tickers: ['IONQ', 'RGTI', 'QBTS', 'QUBT', 'ARQQ', 'D-WAVE', 'FORM'], color: 'text-fuchsia-400', ring: 'border-fuchsia-500/20 bg-fuchsia-500/[0.06]' },
        { key: 'fintechPulse', icon: <CreditCard size={16} className="text-white" />, accent: 'from-lime-400 to-green-600', tickers: ['SQ', 'AFRM', 'UPST', 'SOFI', 'XYZ', 'COIN', 'NU'], color: 'text-lime-400', ring: 'border-lime-500/20 bg-lime-500/[0.06]' },
        { key: 'cloudFortress', icon: <Cloud size={16} className="text-white" />, accent: 'from-sky-300 to-blue-500', tickers: ['NOW', 'TEAM', 'DDOG', 'MDB', 'SNOW', 'NET', 'CRWD'], color: 'text-sky-300', ring: 'border-sky-400/20 bg-sky-400/[0.06]' },
    ];

    /* 5 Pillars */
    const pillars = [
        { key: 'momentum', icon: <TrendingUp size={14} className="text-emerald-400" />, pts: '25pt' },
        { key: 'structure', icon: <Layers size={14} className="text-cyan-400" />, pts: '25pt' },
        { key: 'flow', icon: <Radio size={14} className="text-purple-400" />, pts: '25pt' },
        { key: 'regime', icon: <Globe size={14} className="text-amber-400" />, pts: '15pt' },
        { key: 'catalyst', icon: <Flame size={14} className="text-rose-400" />, pts: '10pt' },
    ];

    const sectorDisplayNames: Record<string, string> = {
        m7: 'M7', physicalAI: 'PHYSICAL AI', siliconCore: 'SILICON CORE',
        powerMatrix: 'POWER MATRIX', bioPulse: 'BIO PULSE', cyberShield: 'CYBER SHIELD',
        orbitDefense: 'ORBIT DEFENSE', quantumEdge: 'QUANTUM EDGE',
        fintechPulse: 'FINTECH PULSE', cloudFortress: 'CLOUD FORTRESS',
    };

    return (
        <HowItWorksLayout
            title="INTEL"
            subtitle={t('subtitle')}
        >
            {/* ═══════════════════════════════════════════════ */}
            {/* Section 1: Hero Overview                        */}
            {/* ═══════════════════════════════════════════════ */}
            <section className="space-y-5">
                <div>
                    <h3 className="text-xl font-bold text-white mb-1">{t('overviewTitle')}</h3>
                    <p className="text-[12px] text-cyan-400 font-medium uppercase tracking-wider">{t('overviewTagline')}</p>
                </div>

                <p className="text-base text-slate-300 leading-relaxed">
                    {t.rich('overviewDesc', richTags)}
                </p>

                <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-slate-900/30 backdrop-blur-sm shadow-2xl">
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/[0.04] via-transparent to-indigo-500/[0.03] pointer-events-none" />
                    <Image
                        src={intelFullImg}
                        alt="Intel Page Full View"
                        width={2048}
                        height={1200}
                        quality={85}
                        className="w-full h-auto relative object-cover object-top"
                        loading="lazy"
                    />
                </div>
            </section>

            {/* ═══════════════════════════════════════════════ */}
            {/* Section 2: SECTOR COMMAND                       */}
            {/* ═══════════════════════════════════════════════ */}
            <section className="space-y-5">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-indigo-600 flex items-center justify-center">
                        <LayoutGrid size={16} className="text-white" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white">{t('sectorCommand.title')}</h3>
                        <p className="text-[12px] text-slate-400 font-medium uppercase tracking-wider">{t('sectorCommand.tagline')}</p>
                    </div>
                </div>

                <p className="text-base text-slate-300 leading-relaxed">{t.rich('sectorCommand.desc', richTags)}</p>

                {/* Macro Quick Strip */}
                <div className={card}>
                    <h4 className="text-base font-black text-white mb-2 flex items-center gap-2">
                        <Activity size={14} className="text-cyan-400" />
                        {t('sectorCommand.macroTitle')}
                    </h4>
                    <p className="text-[15px] text-slate-300 leading-relaxed mb-3">{t('sectorCommand.macroDesc')}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                        {[
                            { label: 'TOP', color: 'text-emerald-400 border-emerald-500/20', icon: <TrendingUp size={12} /> },
                            { label: 'BOT', color: 'text-rose-400 border-rose-500/20', icon: <TrendingDown size={12} /> },
                            { label: 'WHALE', color: 'text-violet-400 border-violet-500/20', icon: <BarChart3 size={12} /> },
                        ].map(s => (
                            <span key={s.label} className={`text-[12px] font-bold px-2.5 py-1 rounded-full border ${s.color} bg-white/[0.03] flex items-center gap-1.5`}>
                                {s.icon} {s.label}
                            </span>
                        ))}
                    </div>
                </div>

                {/* Context Leaders/Laggards */}
                <div className={card}>
                    <h4 className="text-base font-black text-white mb-2 flex items-center gap-2">
                        <Crown size={14} className="text-amber-400" />
                        {t('sectorCommand.alphaLeadersTitle')}
                    </h4>
                    <p className="text-[15px] text-slate-300 leading-relaxed mb-3">{t.rich('sectorCommand.alphaLeadersDesc', richTags)}</p>

                    {/* Visual Example */}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] p-3">
                            <span className="text-[12px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                                <TrendingUp size={12} /> CONTEXT LEADERS
                            </span>
                            <p className="text-[15px] text-slate-300 mt-1.5">{t('sectorCommand.leadersDesc')}</p>
                        </div>
                        <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.06] p-3">
                            <span className="text-[12px] font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                                <TrendingDown size={12} /> CONTEXT LAGGARDS
                            </span>
                            <p className="text-[15px] text-slate-300 mt-1.5">{t('sectorCommand.laggardsDesc')}</p>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        {[
                            { key: 'cardLogo', icon: <Eye size={12} className="text-cyan-400" /> },
                            { key: 'cardGauge', icon: <Gauge size={12} className="text-amber-400" /> },
                            { key: 'cardClick', icon: <ArrowRight size={12} className="text-emerald-400" /> },
                        ].map(el => (
                            <div key={el.key} className="flex items-start gap-2 py-1.5 px-2.5 rounded-md bg-white/[0.02]">
                                <span className="mt-0.5 shrink-0">{el.icon}</span>
                                <span className="text-[15px] text-slate-300">{t(`sectorCommand.${el.key}`)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 10 Sector Cards Grid */}
                <div className={card}>
                    <h4 className="text-base font-black text-white mb-2 flex items-center gap-2">
                        <Layers size={14} className="text-cyan-400" />
                        {t('sectorCommand.gridTitle')}
                    </h4>
                    <p className="text-[15px] text-slate-300 leading-relaxed mb-3">{t('sectorCommand.gridDesc')}</p>

                    <div className="space-y-1.5">
                        {[
                            { key: 'gridAvg', icon: <BarChart3 size={12} className="text-emerald-400" /> },
                            { key: 'gridLeadLag', icon: <Target size={12} className="text-amber-400" /> },
                            { key: 'gridMetrics', icon: <Activity size={12} className="text-cyan-400" /> },
                            { key: 'gridNav', icon: <ArrowRight size={12} className="text-purple-400" /> },
                        ].map(el => (
                            <div key={el.key} className="flex items-start gap-2 py-1.5 px-2.5 rounded-md bg-white/[0.02]">
                                <span className="mt-0.5 shrink-0">{el.icon}</span>
                                <span className="text-[15px] text-slate-300">{t(`sectorCommand.${el.key}`)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* SECTOR HEATMAP */}
                <div className={card}>
                    <h4 className="text-base font-black text-white mb-2 flex items-center gap-2">
                        <Flame size={14} className="text-amber-400" />
                        {t('sectorCommand.heatmapTitle')}
                    </h4>
                    <p className="text-[15px] text-slate-300 leading-relaxed mb-3">{t('sectorCommand.heatmapDesc')}</p>

                    {/* Heatmap Screenshot */}
                    <div className="relative rounded-xl overflow-hidden border border-white/10 bg-slate-900/30 backdrop-blur-sm shadow-lg mb-3">
                        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.03] via-transparent to-rose-500/[0.03] pointer-events-none" />
                        <Image
                            src="/guide/intel-heatmap.PNG"
                            alt="Sector Heatmap — 10 Sectors × 70 Stocks TreeMap"
                            width={1920}
                            height={900}
                            quality={85}
                            className="w-full h-auto relative object-cover"
                            loading="lazy"
                        />
                    </div>

                    <div className="flex items-start gap-2 py-1.5 px-2.5 rounded-md bg-white/[0.02] mb-2">
                        <span className="mt-0.5 shrink-0"><Eye size={12} className="text-cyan-400" /></span>
                        <span className="text-[15px] text-slate-300">{t('sectorCommand.heatmapColor')}</span>
                    </div>

                    <div className="flex items-start gap-2 py-2 px-3 rounded-lg border border-cyan-500/15 bg-cyan-500/[0.04]">
                        <Lightbulb size={14} className="text-cyan-400 mt-0.5 shrink-0" />
                        <span className="text-[14px] text-slate-300 leading-relaxed">{t('sectorCommand.heatmapTip')}</span>
                    </div>
                </div>

                {/* SECTOR MOMENTUM RANKING */}
                <div className={card}>
                    <h4 className="text-base font-black text-white mb-2 flex items-center gap-2">
                        <Trophy size={14} className="text-emerald-400" />
                        {t('sectorCommand.rankingTableTitle')}
                    </h4>
                    <p className="text-[15px] text-slate-300 leading-relaxed">{t('sectorCommand.rankingTableDesc')}</p>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════ */}
            {/* Section 2.5: SESSION GRID AI ANALYSIS ENGINE    */}
            {/* ═══════════════════════════════════════════════ */}
            <section className="space-y-5">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-400 to-purple-600 flex items-center justify-center">
                        <Brain size={16} className="text-white" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white">{t('sessionGridAI.title')}</h3>
                        <p className="text-[12px] text-slate-400 font-medium uppercase tracking-wider">{t('sessionGridAI.tagline')}</p>
                    </div>
                </div>

                <p className="text-base text-slate-300 leading-relaxed">{t.rich('sessionGridAI.desc', richTags)}</p>

                {/* 4-Block Pipeline */}
                <div className={card}>
                    <h4 className="text-base font-black text-white mb-3 flex items-center gap-2">
                        <Layers size={14} className="text-cyan-400" />
                        {t('sessionGridAI.pipelineTitle')}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {[
                            { key: 'block1', color: 'border-rose-500/20 bg-rose-500/[0.06]', textColor: 'text-rose-400', icon: <AlertTriangle size={12} /> },
                            { key: 'block2', color: 'border-cyan-500/20 bg-cyan-500/[0.06]', textColor: 'text-cyan-400', icon: <Layers size={12} /> },
                            { key: 'block3', color: 'border-purple-500/20 bg-purple-500/[0.06]', textColor: 'text-purple-400', icon: <Radio size={12} /> },
                            { key: 'block4', color: 'border-amber-500/20 bg-amber-500/[0.06]', textColor: 'text-amber-400', icon: <Target size={12} /> },
                        ].map((b, i) => (
                            <div key={b.key} className={`rounded-lg border ${b.color} p-3`}>
                                <div className="flex items-center gap-2 mb-1.5">
                                    <span className={`text-[12px] font-bold ${b.textColor} flex items-center gap-1`}>
                                        {b.icon}
                                        <span className="text-slate-500 font-mono mr-1">{i + 1}</span>
                                        {t(`sessionGridAI.${b.key}Title`)}
                                    </span>
                                </div>
                                <p className="text-[14px] text-slate-300 leading-relaxed">{t(`sessionGridAI.${b.key}Desc`)}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 8-Category Conclusion Engine */}
                <div className={card}>
                    <h4 className="text-base font-black text-white mb-2 flex items-center gap-2">
                        <Crosshair size={14} className="text-amber-400" />
                        {t('sessionGridAI.conclusionTitle')}
                    </h4>
                    <p className="text-[15px] text-slate-300 leading-relaxed mb-3">{t('sessionGridAI.conclusionDesc')}</p>

                    <div className="space-y-1">
                        {(['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'] as const).map(code => {
                            const colors: Record<string, string> = {
                                c1: 'text-emerald-400', c2: 'text-rose-400', c3: 'text-amber-400', c4: 'text-violet-400',
                                c5: 'text-slate-400', c6: 'text-cyan-400', c7: 'text-orange-400', c8: 'text-fuchsia-400',
                            };
                            return (
                                <div key={code} className="flex items-start gap-2 py-1.5 px-2.5 rounded-md bg-white/[0.02]">
                                    <span className={`text-[12px] font-black mt-0.5 shrink-0 ${colors[code]}`}>{code.toUpperCase()}</span>
                                    <span className="text-[14px] text-slate-300">{t(`sessionGridAI.${code}`)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* DynamoDB History Context */}
                <div className={card}>
                    <h4 className="text-base font-black text-white mb-2 flex items-center gap-2">
                        <Archive size={14} className="text-cyan-400" />
                        {t('sessionGridAI.historyTitle')}
                    </h4>
                    <p className="text-[15px] text-slate-300 leading-relaxed">{t('sessionGridAI.historyDesc')}</p>
                </div>

                {/* Pro Tip */}
                <div className="flex items-start gap-2 py-2 px-3 rounded-lg border border-cyan-500/15 bg-cyan-500/[0.04]">
                    <Lightbulb size={14} className="text-cyan-400 mt-0.5 shrink-0" />
                    <span className="text-[14px] text-slate-300 leading-relaxed">{t('sessionGridAI.tip')}</span>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════ */}
            {/* Section 2.7: PERPLEXITY AI REAL-TIME ANALYSIS   */}
            {/* ═══════════════════════════════════════════════ */}
            <section className="space-y-5">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
                        <Sparkles size={16} className="text-white" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white">{t('perplexityAI.title')}</h3>
                        <p className="text-[12px] text-slate-400 font-medium uppercase tracking-wider">{t('perplexityAI.tagline')}</p>
                    </div>
                </div>

                <p className="text-base text-slate-300 leading-relaxed">{t.rich('perplexityAI.desc', richTags)}</p>

                <div className={card}>
                    <div className="space-y-1.5">
                        {[
                            { key: 'feature1', icon: <Target size={12} className="text-amber-400" /> },
                            { key: 'feature2', icon: <Globe size={12} className="text-cyan-400" /> },
                            { key: 'feature3', icon: <Zap size={12} className="text-emerald-400" /> },
                        ].map(el => (
                            <div key={el.key} className="flex items-start gap-2 py-1.5 px-2.5 rounded-md bg-white/[0.02]">
                                <span className="mt-0.5 shrink-0">{el.icon}</span>
                                <span className="text-[15px] text-slate-300">{t(`perplexityAI.${el.key}`)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex items-start gap-2 py-2 px-3 rounded-lg border border-emerald-500/15 bg-emerald-500/[0.04]">
                    <Lightbulb size={14} className="text-emerald-400 mt-0.5 shrink-0" />
                    <span className="text-[14px] text-slate-300 leading-relaxed">{t('perplexityAI.integration')}</span>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════ */}
            {/* Section 3: Context Score Deep-Dive                */}
            {/* ═══════════════════════════════════════════════ */}
            <section className="space-y-5">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center">
                        <Brain size={16} className="text-white" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white">{t('alpha.title')}</h3>
                        <p className="text-[12px] text-slate-400 font-medium uppercase tracking-wider">{t('alpha.tagline')}</p>
                    </div>
                </div>

                <p className="text-base text-slate-300 leading-relaxed">{t.rich('alpha.desc', richTags)}</p>

                {/* Context Score Visual */}
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                    <div className="flex items-center gap-2 px-4 pt-3 pb-2">
                        <Brain size={14} className="text-amber-400" />
                        <span className="text-[13px] font-bold tracking-wide text-slate-200">ANALYTICS SCORE</span>
                        <span className="text-[12px] font-bold px-1.5 py-0.5 rounded border text-emerald-400 border-emerald-500/20 bg-emerald-500/[0.08]">GRADE A</span>
                    </div>

                    <div className="grid grid-cols-3 gap-4 px-4 pb-4 pt-1">
                        <div className="flex flex-col items-center gap-1.5">
                            <span className="text-[12px] font-bold tracking-widest text-slate-400 uppercase">Score</span>
                            <div className="text-[38px] font-black text-amber-400 tabular-nums leading-none">78</div>
                            <div className="text-[12px] font-bold px-2 py-0.5 rounded border text-emerald-400 border-emerald-500/20 bg-emerald-500/[0.08]">WATCH</div>
                        </div>

                        <div className="flex flex-col gap-1.5 col-span-2">
                            <span className="text-[12px] font-bold tracking-widest text-slate-400 uppercase">Pillar Breakdown</span>
                            {[
                                { name: 'MOMENTUM', score: 21, max: 25, color: 'bg-emerald-500' },
                                { name: 'STRUCTURE', score: 18, max: 25, color: 'bg-cyan-500' },
                                { name: 'FLOW', score: 20, max: 25, color: 'bg-purple-500' },
                                { name: 'REGIME', score: 12, max: 15, color: 'bg-amber-500' },
                                { name: 'CATALYST', score: 7, max: 10, color: 'bg-rose-500' },
                            ].map(p => (
                                <div key={p.name} className="flex items-center gap-2">
                                    <span className="text-[12px] text-slate-400 w-20 text-right font-mono">{p.name}</span>
                                    <div className="flex-1 h-[5px] rounded-full bg-slate-800 overflow-hidden">
                                        <div className={`h-full rounded-full ${p.color}`} style={{ width: `${(p.score / p.max) * 100}%` }} />
                                    </div>
                                    <span className="text-[12px] text-slate-400 font-mono w-8">{p.score}/{p.max}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* 5-Pillar Compact Table */}
                <div>
                    <h4 className="text-base font-black text-white mb-2 flex items-center gap-2">
                        <Layers size={14} className="text-cyan-400" />
                        {t('alpha.pillarTitle')}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {pillars.map(p => (
                            <div key={p.key} className="flex items-center gap-3 p-3 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                                <div className="shrink-0">{p.icon}</div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[13px] font-bold text-white">{t(`alpha.${p.key}`)}</span>
                                        <span className="text-[12px] font-bold text-amber-400/80">{t(`alpha.${p.key}Pts`)}</span>
                                    </div>
                                    <p className="text-[15px] text-slate-400 leading-snug mt-0.5 line-clamp-2">
                                        {t(`alpha.${p.key}Desc`)}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Grade Scale + Action Map */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className={card}>
                        <h4 className="text-[14px] font-semibold text-white mb-2 flex items-center gap-2">
                            <Gauge size={14} className="text-amber-400" />
                            {t('alpha.gradeTitle')}
                        </h4>
                        <div className="space-y-1">
                            {[
                                { grade: 'S', color: 'text-amber-300', key: 'gradeS' },
                                { grade: 'A', color: 'text-emerald-400', key: 'gradeA' },
                                { grade: 'B', color: 'text-cyan-400', key: 'gradeB' },
                                { grade: 'C', color: 'text-slate-300', key: 'gradeC' },
                                { grade: 'D', color: 'text-rose-400', key: 'gradeD' },
                                { grade: 'F', color: 'text-red-400', key: 'gradeF' },
                            ].map(g => (
                                <div key={g.grade} className="flex items-center gap-2 py-1">
                                    <span className={`text-[14px] font-bold ${g.color} w-5 text-center`}>{g.grade}</span>
                                    <span className="text-[13px] text-slate-300">{t(`alpha.${g.key}`)}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className={card}>
                        <h4 className="text-[14px] font-semibold text-white mb-2 flex items-center gap-2">
                            <Target size={14} className="text-cyan-400" />
                            {t('alpha.actionTitle')}
                        </h4>
                        <div className="space-y-1">
                            {[
                                { action: 'STRONG BULLISH', color: 'text-emerald-400', key: 'strongBuy' },
                                { action: 'BULLISH', color: 'text-emerald-300', key: 'buy' },
                                { action: 'WATCH', color: 'text-amber-400', key: 'watch' },
                                { action: 'HOLD', color: 'text-slate-300', key: 'hold' },
                                { action: 'REDUCE', color: 'text-rose-400', key: 'reduce' },
                                { action: 'EXIT', color: 'text-red-400', key: 'exit' },
                            ].map(a => (
                                <div key={a.action} className="flex items-center gap-2 py-1">
                                    <span className={`text-[12px] font-bold ${a.color} w-24`}>{a.action}</span>
                                    <span className="text-[13px] text-slate-300">{t(`alpha.${a.key}`)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Safety Gates */}
                <div className={card}>
                    <h4 className="text-[14px] font-semibold text-white mb-1.5 flex items-center gap-2">
                        <AlertTriangle size={14} className="text-rose-400" />
                        {t('alpha.gatesTitle')}
                    </h4>
                    <p className="text-[13px] text-slate-300 leading-relaxed">{t.rich('alpha.gatesDesc', richTags)}</p>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════ */}
            {/* Section 4: Sector Zones (Sector Detail Tab)     */}
            {/* ═══════════════════════════════════════════════ */}
            <section className="space-y-5">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-indigo-600 flex items-center justify-center">
                        <Layers size={16} className="text-white" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white">{t('sectorZones.title')}</h3>
                        <p className="text-[12px] text-slate-400 font-medium uppercase tracking-wider">{t('sectorZones.tagline')}</p>
                    </div>
                </div>

                <p className="text-base text-slate-300 leading-relaxed">{t.rich('sectorZones.desc', richTags)}</p>

                {/* M7 Tab Screenshot */}
                <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-slate-900/30 backdrop-blur-sm shadow-2xl">
                    <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/[0.04] via-transparent to-indigo-500/[0.03] pointer-events-none" />
                    <Image
                        src={m7Img}
                        alt="M7 Report Tab View"
                        width={1920}
                        height={1080}
                        quality={85}
                        className="w-full h-auto relative"
                        loading="lazy"
                    />
                </div>

                {/* Zone A ~ C consolidated card */}
                <div className={card}>
                    {/* Zone A */}
                    <div className="mb-4">
                        <h4 className="text-base font-black text-white mb-1 flex items-center gap-2">
                            <BarChart3 size={14} className="text-cyan-400" />
                            {t('sectorZones.gridTitle')}
                        </h4>
                        <p className="text-[15px] text-slate-300 leading-relaxed mb-2">{t('sectorZones.gridDesc')}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                            {[
                                { label: 'PRE-MKT', color: 'text-amber-400 border-amber-500/20' },
                                { label: 'LIVE', color: 'text-emerald-400 border-emerald-500/20' },
                                { label: 'POST-MKT', color: 'text-purple-400 border-purple-500/20' },
                                { label: 'CLOSED', color: 'text-slate-400 border-slate-500/20' },
                            ].map((s, i) => (
                                <div key={s.label} className="flex items-center gap-1.5">
                                    <span className={`text-[12px] font-bold px-2 py-0.5 rounded-full border ${s.color} bg-white/[0.03]`}>{s.label}</span>
                                    {i < 3 && <ChevronRight size={10} className="text-slate-600" />}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="border-t border-white/[0.06] pt-4 mb-4">
                        <h4 className="text-base font-black text-white mb-1 flex items-center gap-2">
                            <TrendingUp size={14} className="text-cyan-400" />
                            {t('sectorZones.rankingTitle')}
                        </h4>
                        <p className="text-[15px] text-slate-300 leading-relaxed mb-2">{t('sectorZones.rankingDesc')}</p>
                        <div className="space-y-1">
                            {[
                                { key: 'rankMoneyFlow', icon: <TrendingUp size={12} className="text-emerald-400" /> },
                                { key: 'rankSqueeze', icon: <Zap size={12} className="text-amber-400" /> },
                                { key: 'rankPain', icon: <Activity size={12} className="text-rose-400" /> },
                            ].map(r => (
                                <div key={r.key} className="flex items-start gap-2 py-1.5 px-2.5 rounded-md bg-white/[0.02]">
                                    <span className="mt-0.5 shrink-0">{r.icon}</span>
                                    <span className="text-[15px] text-slate-300">{t(`sectorZones.${r.key}`)}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="border-t border-white/[0.06] pt-4 mb-4">
                        <h4 className="text-base font-black text-white mb-1 flex items-center gap-2">
                            <Users size={14} className="text-cyan-400" />
                            {t('sectorZones.consensusTitle')}
                        </h4>
                        <p className="text-[15px] text-slate-300 leading-relaxed mb-2">{t('sectorZones.consensusDesc')}</p>
                        <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 rounded-md text-[12px] font-bold text-cyan-400 border border-cyan-500/20 bg-cyan-500/[0.06] flex items-center gap-1.5">
                                <Users size={11} /> Analyst Consensus
                            </span>
                            <span className="px-2.5 py-1 rounded-md text-[12px] font-bold text-purple-400 border border-purple-500/20 bg-purple-500/[0.06] flex items-center gap-1.5">
                                <Calendar size={11} /> Earnings Calendar
                            </span>
                        </div>
                    </div>

                    <div className="border-t border-white/[0.06] pt-4">
                        <h4 className="text-base font-black text-white mb-1 flex items-center gap-2">
                            <Lightbulb size={14} className="text-cyan-400" />
                            {t('sectorZones.reportDeckTitle')}
                        </h4>
                        <p className="text-[15px] text-slate-300 leading-relaxed mb-2">{t.rich('sectorZones.reportDeckDesc', richTags)}</p>
                        <div className="flex items-center gap-2">
                            <span className="px-2.5 py-1 rounded-md text-[12px] font-bold text-emerald-400 border border-emerald-500/20 bg-emerald-500/[0.06]">WATCH</span>
                            <span className="px-2.5 py-1 rounded-md text-[12px] font-bold text-cyan-400 border border-cyan-500/20 bg-cyan-500/[0.06]">HOLD</span>
                            <span className="px-2.5 py-1 rounded-md text-[12px] font-bold text-rose-400 border border-rose-500/20 bg-rose-500/[0.06]">REDUCE</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════ */}
            {/* Section 5: POST-MARKET BRIEF                    */}
            {/* ═══════════════════════════════════════════════ */}
            <section className="space-y-5">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center">
                        <FileText size={16} className="text-white" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white">{t('postMarket.title')}</h3>
                        <p className="text-[12px] text-slate-400 font-medium uppercase tracking-wider">{t('postMarket.tagline')}</p>
                    </div>
                </div>

                <p className="text-base text-slate-300 leading-relaxed">{t.rich('postMarket.desc', richTags)}</p>

                {/* AI Cross-Sector Intelligence */}
                <div className={card}>
                    <h4 className="text-base font-black text-white mb-2 flex items-center gap-2">
                        <Sparkles size={14} className="text-amber-400" />
                        {t('postMarket.aiTitle')}
                    </h4>
                    <p className="text-[15px] text-slate-300 leading-relaxed mb-3">{t.rich('postMarket.aiDesc', richTags)}</p>
                    <div className="space-y-1.5">
                        {[
                            { key: 'aiTiming', icon: <Calendar size={12} className="text-emerald-400" /> },
                            { key: 'aiContent', icon: <Brain size={12} className="text-cyan-400" /> },
                            { key: 'aiSectors', icon: <Layers size={12} className="text-purple-400" /> },
                        ].map(el => (
                            <div key={el.key} className="flex items-start gap-2 py-1.5 px-2.5 rounded-md bg-white/[0.02]">
                                <span className="mt-0.5 shrink-0">{el.icon}</span>
                                <span className="text-[15px] text-slate-300">{t(`postMarket.${el.key}`)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Accordion Reports */}
                <div className={card}>
                    <h4 className="text-base font-black text-white mb-2 flex items-center gap-2">
                        <Archive size={14} className="text-cyan-400" />
                        {t('postMarket.reportsTitle')}
                    </h4>
                    <p className="text-[15px] text-slate-300 leading-relaxed mb-3">{t.rich('postMarket.reportsDesc', richTags)}</p>
                    <div className="space-y-1.5">
                        {[
                            { key: 'reportAccordion', icon: <Layers size={12} className="text-cyan-400" /> },
                            { key: 'reportMVP', icon: <Trophy size={12} className="text-amber-400" /> },
                            { key: 'reportAlpha', icon: <Gauge size={12} className="text-emerald-400" /> },
                            { key: 'reportGamma', icon: <Activity size={12} className="text-rose-400" /> },
                        ].map(el => (
                            <div key={el.key} className="flex items-start gap-2 py-1.5 px-2.5 rounded-md bg-white/[0.02]">
                                <span className="mt-0.5 shrink-0">{el.icon}</span>
                                <span className="text-[15px] text-slate-300">{t(`postMarket.${el.key}`)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════ */}
            {/* Section 6: 10 Sectors Catalog                   */}
            {/* ═══════════════════════════════════════════════ */}
            <section className="space-y-5">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-400 to-purple-600 flex items-center justify-center">
                        <Layers size={16} className="text-white" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white">{t('sectors.title')}</h3>
                        <p className="text-[12px] text-slate-400 font-medium uppercase tracking-wider">{t('sectors.tagline')}</p>
                    </div>
                </div>

                <p className="text-base text-slate-300 leading-relaxed">{t.rich('sectors.desc', richTags)}</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {sectors.map(s => (
                        <div key={s.key} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                            <div className="flex items-center gap-2 mb-1.5">
                                <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${s.accent} flex items-center justify-center`}>
                                    {s.icon}
                                </div>
                                <span className={`text-[13px] font-bold ${s.color}`}>{sectorDisplayNames[s.key]}</span>
                            </div>
                            <p className="text-[15px] text-slate-400 leading-snug mb-1.5">{t(`sectors.${s.key}`)}</p>
                            <div className={`flex flex-wrap gap-1.5 p-2 rounded-lg border ${s.ring}`}>
                                {s.tickers.map((ticker: string) => (
                                    <span key={ticker} className="inline-flex items-center gap-1 bg-white/[0.04] rounded-md px-1.5 py-0.5">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={`https://assets.parqet.com/logos/symbol/${ticker}?format=png`}
                                            alt={ticker}
                                            className="w-4 h-4 rounded-full object-cover"
                                        />
                                        <span className={`text-[13px] font-bold font-mono ${s.color}`}>{ticker}</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ═══════════════════════════════════════════════ */}
            {/* Section 7: Key Indicators Reference              */}
            {/* ═══════════════════════════════════════════════ */}
            <section className="space-y-5">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
                        <BarChart3 size={16} className="text-white" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white">{t('indicators.title')}</h3>
                        <p className="text-[12px] text-slate-400 font-medium uppercase tracking-wider">{t('indicators.tagline')}</p>
                    </div>
                </div>

                <p className="text-base text-slate-300 leading-relaxed">{t.rich('indicators.desc', richTags)}</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

                    {/* ── GEX Card ── */}
                    <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/40 to-slate-900/60 p-5">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/[0.05] rounded-full blur-2xl" />
                        <div className="flex items-center gap-2 mb-3">
                            <Activity size={16} className="text-emerald-400" />
                            <span className="text-base font-black text-white">{t('indicators.gexTitle')}</span>
                        </div>
                        {/* Mini SVG Gauge */}
                        <div className="mb-3 p-3 rounded-xl bg-black/30 border border-white/[0.06]">
                            <svg viewBox="0 0 280 48" className="w-full">
                                <defs>
                                    <linearGradient id="gexGrad" x1="0" y1="0" x2="1" y2="0">
                                        <stop offset="0%" stopColor="#f43f5e" />
                                        <stop offset="50%" stopColor="#64748b" />
                                        <stop offset="100%" stopColor="#34d399" />
                                    </linearGradient>
                                </defs>
                                <text x="0" y="12" fill="#94a3b8" fontSize="9" fontFamily="monospace">−GEX</text>
                                <text x="253" y="12" fill="#94a3b8" fontSize="9" fontFamily="monospace">+GEX</text>
                                <rect x="0" y="18" width="280" height="10" rx="5" fill="#1e293b" />
                                <rect x="0" y="18" width="280" height="10" rx="5" fill="url(#gexGrad)" opacity="0.6" />
                                <circle cx="196" cy="23" r="6" fill="#34d399" stroke="#0f172a" strokeWidth="2" />
                                <text x="196" y="42" fill="#34d399" fontSize="10" fontWeight="bold" fontFamily="monospace" textAnchor="middle">+2.4B</text>
                                <text x="40" y="42" fill="#64748b" fontSize="8" fontFamily="monospace">BEARISH</text>
                                <text x="230" y="42" fill="#64748b" fontSize="8" fontFamily="monospace">BULLISH</text>
                            </svg>
                        </div>
                        <p className="text-[15px] text-slate-300 leading-relaxed mb-2">{t('indicators.gexDesc')}</p>
                        <p className="text-[13px] text-amber-400/90 leading-relaxed flex items-start gap-1.5">
                            <Crosshair size={12} className="mt-0.5 shrink-0" />
                            {t('indicators.gexTrading')}
                        </p>
                    </div>

                    {/* ── Dark Pool Card ── */}
                    <div className="relative overflow-hidden rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-950/40 to-slate-900/60 p-5">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/[0.05] rounded-full blur-2xl" />
                        <div className="flex items-center gap-2 mb-3">
                            <Eye size={16} className="text-purple-400" />
                            <span className="text-base font-black text-white">{t('indicators.darkPoolTitle')}</span>
                        </div>
                        <div className="mb-3 p-3 rounded-xl bg-black/30 border border-white/[0.06]">
                            <svg viewBox="0 0 280 52" className="w-full">
                                <text x="0" y="10" fill="#94a3b8" fontSize="9" fontFamily="monospace">DARK POOL %</text>
                                <text x="243" y="10" fill="#c084fc" fontSize="10" fontWeight="bold" fontFamily="monospace">62.4%</text>
                                <rect x="0" y="18" width="280" height="14" rx="7" fill="#1e293b" />
                                <rect x="0" y="18" width="175" height="14" rx="7" fill="#a855f7" opacity="0.7" />
                                <line x1="140" y1="16" x2="140" y2="34" stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="3,2" />
                                <text x="140" y="46" fill="#fbbf24" fontSize="8" fontFamily="monospace" textAnchor="middle">50% Threshold</text>
                            </svg>
                        </div>
                        <p className="text-[15px] text-slate-300 leading-relaxed mb-2">{t('indicators.darkPoolDesc')}</p>
                        <p className="text-[13px] text-amber-400/90 leading-relaxed flex items-start gap-1.5">
                            <Crosshair size={12} className="mt-0.5 shrink-0" />
                            {t('indicators.darkPoolTrading')}
                        </p>
                    </div>

                    {/* ── P/C Ratio Card ── */}
                    <div className="relative overflow-hidden rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-950/40 to-slate-900/60 p-5">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/[0.05] rounded-full blur-2xl" />
                        <div className="flex items-center gap-2 mb-3">
                            <BarChart3 size={16} className="text-cyan-400" />
                            <span className="text-base font-black text-white">{t('indicators.pcrTitle')}</span>
                        </div>
                        <div className="mb-3 p-3 rounded-xl bg-black/30 border border-white/[0.06]">
                            <svg viewBox="0 0 280 56" className="w-full">
                                <text x="0" y="10" fill="#94a3b8" fontSize="9" fontFamily="monospace">PUT/CALL RATIO</text>
                                <text x="230" y="10" fill="#22d3ee" fontSize="10" fontWeight="bold" fontFamily="monospace">0.82</text>
                                {/* Scale */}
                                <rect x="0" y="20" width="280" height="10" rx="5" fill="#1e293b" />
                                <rect x="0" y="20" width="55" height="10" rx="5" fill="#34d399" opacity="0.5" />
                                <rect x="55" y="20" width="130" height="10" fill="#64748b" opacity="0.3" />
                                <rect x="185" y="20" width="95" height="10" rx="5" fill="#f43f5e" opacity="0.5" />
                                {/* Labels */}
                                <text x="20" y="45" fill="#34d399" fontSize="8" fontFamily="monospace" textAnchor="middle">&lt;0.7</text>
                                <text x="20" y="53" fill="#64748b" fontSize="7" fontFamily="monospace" textAnchor="middle">BULLISH</text>
                                <text x="123" y="45" fill="#94a3b8" fontSize="8" fontFamily="monospace" textAnchor="middle">0.8~1.2</text>
                                <text x="123" y="53" fill="#64748b" fontSize="7" fontFamily="monospace" textAnchor="middle">NEUTRAL</text>
                                <text x="240" y="45" fill="#f43f5e" fontSize="8" fontFamily="monospace" textAnchor="middle">&gt;1.3</text>
                                <text x="240" y="53" fill="#64748b" fontSize="7" fontFamily="monospace" textAnchor="middle">BEARISH</text>
                                {/* Pointer */}
                                <circle cx="109" cy="25" r="5" fill="#22d3ee" stroke="#0f172a" strokeWidth="2" />
                            </svg>
                        </div>
                        <p className="text-[15px] text-slate-300 leading-relaxed mb-2">{t('indicators.pcrDesc')}</p>
                        <p className="text-[13px] text-amber-400/90 leading-relaxed flex items-start gap-1.5">
                            <Crosshair size={12} className="mt-0.5 shrink-0" />
                            {t('indicators.pcrTrading')}
                        </p>
                    </div>

                    {/* ── Squeeze Card ── */}
                    <div className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-950/40 to-slate-900/60 p-5">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/[0.05] rounded-full blur-2xl" />
                        <div className="flex items-center gap-2 mb-3">
                            <Zap size={16} className="text-amber-400" />
                            <span className="text-base font-black text-white">{t('indicators.squeezeTitle')}</span>
                        </div>
                        <div className="mb-3 p-3 rounded-xl bg-black/30 border border-white/[0.06]">
                            <svg viewBox="0 0 280 52" className="w-full">
                                <text x="0" y="10" fill="#94a3b8" fontSize="9" fontFamily="monospace">SQUEEZE LEVEL</text>
                                {/* 3 level bars */}
                                <rect x="0" y="20" width="80" height="10" rx="3" fill="#1e293b" />
                                <rect x="0" y="20" width="80" height="10" rx="3" fill="#fbbf24" opacity="0.8" />
                                <text x="90" y="28" fill="#fbbf24" fontSize="9" fontWeight="bold" fontFamily="monospace">HIGH</text>
                                <rect x="140" y="20" width="50" height="10" rx="3" fill="#1e293b" />
                                <rect x="140" y="20" width="35" height="10" rx="3" fill="#fb923c" opacity="0.6" />
                                <text x="198" y="28" fill="#fb923c" fontSize="9" fontFamily="monospace">MED</text>
                                <rect x="230" y="20" width="50" height="10" rx="3" fill="#1e293b" />
                                <rect x="230" y="20" width="15" height="10" rx="3" fill="#64748b" opacity="0.4" />
                                <text x="230" y="44" fill="#64748b" fontSize="9" fontFamily="monospace">LOW</text>
                                <text x="0" y="44" fill="#fbbf24" fontSize="9" fontWeight="bold" fontFamily="monospace">🔥 FIRE</text>
                                <text x="140" y="44" fill="#94a3b8" fontSize="8" fontFamily="monospace">SQUEEZE</text>
                            </svg>
                        </div>
                        <p className="text-[15px] text-slate-300 leading-relaxed mb-2">{t('indicators.squeezeDesc')}</p>
                        <p className="text-[13px] text-amber-400/90 leading-relaxed flex items-start gap-1.5">
                            <Crosshair size={12} className="mt-0.5 shrink-0" />
                            {t('indicators.squeezeTrading')}
                        </p>
                    </div>

                    {/* ── Net Premium Card ── */}
                    <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/40 to-slate-900/60 p-5">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/[0.05] rounded-full blur-2xl" />
                        <div className="flex items-center gap-2 mb-3">
                            <TrendingUp size={16} className="text-emerald-400" />
                            <span className="text-base font-black text-white">{t('indicators.netPremiumTitle')}</span>
                        </div>
                        <div className="mb-3 p-3 rounded-xl bg-black/30 border border-white/[0.06]">
                            <svg viewBox="0 0 280 55" className="w-full">
                                <text x="0" y="10" fill="#94a3b8" fontSize="9" fontFamily="monospace">NET PREMIUM FLOW</text>
                                {/* Bidirectional bar */}
                                <rect x="0" y="20" width="280" height="12" rx="6" fill="#1e293b" />
                                <rect x="140" y="20" width="90" height="12" rx="0" fill="#34d399" opacity="0.6" />
                                <line x1="140" y1="17" x2="140" y2="35" stroke="#64748b" strokeWidth="1" />
                                <text x="50" y="18" fill="#f43f5e" fontSize="9" fontFamily="monospace" textAnchor="middle">PUT ◀</text>
                                <text x="230" y="18" fill="#34d399" fontSize="9" fontFamily="monospace" textAnchor="middle">▶ CALL</text>
                                <text x="185" y="48" fill="#34d399" fontSize="10" fontWeight="bold" fontFamily="monospace" textAnchor="middle">+$24.3M</text>
                                <text x="80" y="48" fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="middle">CALL DOMINANT</text>
                            </svg>
                        </div>
                        <p className="text-[15px] text-slate-300 leading-relaxed mb-2">{t('indicators.netPremiumDesc')}</p>
                        <p className="text-[13px] text-amber-400/90 leading-relaxed flex items-start gap-1.5">
                            <Crosshair size={12} className="mt-0.5 shrink-0" />
                            {t('indicators.netPremiumTrading')}
                        </p>
                    </div>

                    {/* ── Whale Index Card ── */}
                    <div className="relative overflow-hidden rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-950/40 to-slate-900/60 p-5">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/[0.05] rounded-full blur-2xl" />
                        <div className="flex items-center gap-2 mb-3">
                            <Globe size={16} className="text-violet-400" />
                            <span className="text-base font-black text-white">{t('indicators.whaleIndexTitle')}</span>
                        </div>
                        <div className="mb-3 p-3 rounded-xl bg-black/30 border border-white/[0.06]">
                            <svg viewBox="0 0 280 52" className="w-full">
                                <text x="0" y="10" fill="#94a3b8" fontSize="9" fontFamily="monospace">WHALE INDEX</text>
                                <text x="220" y="10" fill="#a78bfa" fontSize="10" fontWeight="bold" fontFamily="monospace">HIGH 🐋</text>
                                {/* Segmented gauge */}
                                <rect x="0" y="20" width="50" height="12" rx="3" fill="#64748b" opacity="0.3" />
                                <rect x="58" y="20" width="50" height="12" rx="3" fill="#64748b" opacity="0.3" />
                                <rect x="116" y="20" width="50" height="12" rx="3" fill="#a78bfa" opacity="0.5" />
                                <rect x="174" y="20" width="50" height="12" rx="3" fill="#a78bfa" opacity="0.7" />
                                <rect x="232" y="20" width="48" height="12" rx="3" fill="#a78bfa" opacity="0.9" />
                                <text x="25" y="45" fill="#64748b" fontSize="8" fontFamily="monospace" textAnchor="middle">LOW</text>
                                <text x="140" y="45" fill="#94a3b8" fontSize="8" fontFamily="monospace" textAnchor="middle">MED</text>
                                <text x="256" y="45" fill="#a78bfa" fontSize="8" fontWeight="bold" fontFamily="monospace" textAnchor="middle">HIGH</text>
                            </svg>
                        </div>
                        <p className="text-[15px] text-slate-300 leading-relaxed mb-2">{t('indicators.whaleIndexDesc')}</p>
                        <p className="text-[13px] text-amber-400/90 leading-relaxed flex items-start gap-1.5">
                            <Crosshair size={12} className="mt-0.5 shrink-0" />
                            {t('indicators.whaleIndexTrading')}
                        </p>
                    </div>

                </div>
            </section>

            {/* ═══════════════════════════════════════════════ */}
            {/* Section 8: Trading Strategy Guide                */}
            {/* ═══════════════════════════════════════════════ */}
            <section className="space-y-5">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center">
                        <Lightbulb size={16} className="text-white" />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white">{t('usage.title')}</h3>
                        <p className="text-[12px] text-slate-400 font-medium uppercase tracking-wider">{t('usage.tagline')}</p>
                    </div>
                </div>

                <p className="text-base text-slate-300 leading-relaxed">{t('usage.desc')}</p>

                <div className="space-y-2">
                    {[
                        { num: '01', titleKey: 'tip1Title', descKey: 'tip1Desc', icon: <Target size={14} className="text-cyan-400" /> },
                        { num: '02', titleKey: 'tip2Title', descKey: 'tip2Desc', icon: <TrendingUp size={14} className="text-cyan-400" /> },
                        { num: '03', titleKey: 'tip3Title', descKey: 'tip3Desc', icon: <Layers size={14} className="text-cyan-400" /> },
                        { num: '04', titleKey: 'tip4Title', descKey: 'tip4Desc', icon: <Calendar size={14} className="text-cyan-400" /> },
                    ].map(tip => (
                        <div key={tip.num} className="flex items-start gap-3">
                            <div className="w-7 h-7 rounded-full bg-white/[0.05] border border-white/[0.08] flex items-center justify-center shrink-0 mt-0.5">
                                <span className="text-[12px] font-bold text-slate-300">{tip.num}</span>
                            </div>
                            <div className="flex-1 p-3 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                                <div className="flex items-center gap-2 mb-0.5">
                                    {tip.icon}
                                    <span className="text-[15px] font-bold text-white">{t(`usage.${tip.titleKey}`)}</span>
                                </div>
                                <p className="text-[15px] text-slate-300 leading-relaxed">{t(`usage.${tip.descKey}`)}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── Investment Risk Disclaimer ── */}
            <section>
                <div className="p-4 rounded-xl bg-amber-900/20 border border-amber-500/25 flex items-start gap-3">
                    <AlertTriangle size={18} className="text-amber-400 mt-0.5 flex-shrink-0" />
                    <div>
                        <h4 className="text-[15px] font-bold text-amber-300 mb-1">{t('warningTitle')}</h4>
                        <p className="text-[14px] text-amber-200/80 leading-relaxed">{t('warningDesc')}</p>
                    </div>
                </div>
            </section>
        </HowItWorksLayout>
    );
}
