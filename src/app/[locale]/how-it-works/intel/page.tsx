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

    const card = "rounded-xl border border-white/[0.08] bg-white/[0.03] p-4";

    /* 10 Sectors */
    const sectors = [
        { key: 'm7', icon: <Orbit size={16} className="text-white" />, accent: 'from-indigo-400 to-indigo-600', tickers: 'AAPL · NVDA · MSFT · GOOGL · AMZN · META · TSLA', color: 'text-indigo-400', ring: 'border-indigo-500/20 bg-indigo-500/[0.06]' },
        { key: 'physicalAI', icon: <Bot size={16} className="text-white" />, accent: 'from-amber-400 to-orange-600', tickers: 'PLTR · SERV · PL · TER · SYM · RKLB · ISRG', color: 'text-amber-400', ring: 'border-amber-500/20 bg-amber-500/[0.06]' },
        { key: 'siliconCore', icon: <Cpu size={16} className="text-white" />, accent: 'from-amber-300 to-yellow-600', tickers: 'AMD · AVGO · TSM · ARM · MU · ASML · MRVL', color: 'text-amber-300', ring: 'border-amber-400/20 bg-amber-400/[0.06]' },
        { key: 'powerMatrix', icon: <Zap size={16} className="text-white" />, accent: 'from-emerald-400 to-green-600', tickers: 'CEG · VST · GEV · PWR · CCJ · SMR · ETN', color: 'text-emerald-400', ring: 'border-emerald-500/20 bg-emerald-500/[0.06]' },
        { key: 'bioPulse', icon: <Activity size={16} className="text-white" />, accent: 'from-rose-400 to-pink-600', tickers: 'LLY · NVO · VRTX · REGN · VKTX · AMGN · GILD', color: 'text-rose-400', ring: 'border-rose-500/20 bg-rose-500/[0.06]' },
        { key: 'cyberShield', icon: <Shield size={16} className="text-white" />, accent: 'from-cyan-400 to-blue-600', tickers: 'CRWD · PANW · FTNT · ZS · S · OKTA · NET', color: 'text-cyan-400', ring: 'border-cyan-500/20 bg-cyan-500/[0.06]' },
        { key: 'orbitDefense', icon: <Rocket size={16} className="text-white" />, accent: 'from-sky-400 to-blue-600', tickers: 'LMT · RTX · AXON · KTOS · LDOS · ASTS · LUNR', color: 'text-sky-400', ring: 'border-sky-500/20 bg-sky-500/[0.06]' },
        { key: 'quantumEdge', icon: <Cpu size={16} className="text-white" />, accent: 'from-fuchsia-400 to-purple-600', tickers: 'IONQ · RGTI · QBTS · QUBT · ARQQ · D-WAVE · FORM', color: 'text-fuchsia-400', ring: 'border-fuchsia-500/20 bg-fuchsia-500/[0.06]' },
        { key: 'fintechPulse', icon: <CreditCard size={16} className="text-white" />, accent: 'from-lime-400 to-green-600', tickers: 'SQ · AFRM · UPST · SOFI · XYZ · COIN · NU', color: 'text-lime-400', ring: 'border-lime-500/20 bg-lime-500/[0.06]' },
        { key: 'cloudFortress', icon: <Cloud size={16} className="text-white" />, accent: 'from-sky-300 to-blue-500', tickers: 'NOW · TEAM · DDOG · MDB · SNOW · NET · CRWD', color: 'text-sky-300', ring: 'border-sky-400/20 bg-sky-400/[0.06]' },
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
            <section className="space-y-4">
                <div>
                    <h3 className="text-lg font-bold text-white mb-1">{t('overviewTitle')}</h3>
                    <p className="text-[13px] text-cyan-400 font-medium uppercase tracking-wider">{t('overviewTagline')}</p>
                </div>

                <p className="text-[14px] text-slate-300 leading-relaxed">
                    {t.rich('overviewDesc', richTags)}
                </p>

                <div className="relative rounded-xl overflow-hidden border border-white/[0.08] shadow-lg max-w-4xl mx-auto">
                    <Image
                        src={intelFullImg}
                        alt="Intel Page Full View"
                        width={2048}
                        height={1200}
                        quality={85}
                        className="w-full h-auto"
                        loading="lazy"
                    />
                </div>
            </section>

            {/* ═══════════════════════════════════════════════ */}
            {/* Section 2: SECTOR COMMAND                       */}
            {/* ═══════════════════════════════════════════════ */}
            <section className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-indigo-600 flex items-center justify-center">
                        <LayoutGrid size={16} className="text-white" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">{t('sectorCommand.title')}</h3>
                        <p className="text-[13px] text-slate-400 font-medium uppercase tracking-wider">{t('sectorCommand.tagline')}</p>
                    </div>
                </div>

                <p className="text-[14px] text-slate-300 leading-relaxed">{t.rich('sectorCommand.desc', richTags)}</p>

                {/* Macro Quick Strip */}
                <div className={card}>
                    <h4 className="text-[14px] font-semibold text-white mb-2 flex items-center gap-2">
                        <Activity size={14} className="text-cyan-400" />
                        {t('sectorCommand.macroTitle')}
                    </h4>
                    <p className="text-[13px] text-slate-300 leading-relaxed mb-3">{t('sectorCommand.macroDesc')}</p>
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

                {/* Alpha Leaders/Laggards */}
                <div className={card}>
                    <h4 className="text-[14px] font-semibold text-white mb-2 flex items-center gap-2">
                        <Crown size={14} className="text-amber-400" />
                        {t('sectorCommand.alphaLeadersTitle')}
                    </h4>
                    <p className="text-[13px] text-slate-300 leading-relaxed mb-3">{t.rich('sectorCommand.alphaLeadersDesc', richTags)}</p>

                    {/* Visual Example */}
                    <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] p-3">
                            <span className="text-[12px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                                <TrendingUp size={12} /> ALPHA LEADERS
                            </span>
                            <p className="text-[13px] text-slate-300 mt-1.5">{t('sectorCommand.leadersDesc')}</p>
                        </div>
                        <div className="rounded-lg border border-rose-500/20 bg-rose-500/[0.06] p-3">
                            <span className="text-[12px] font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                                <TrendingDown size={12} /> ALPHA LAGGARDS
                            </span>
                            <p className="text-[13px] text-slate-300 mt-1.5">{t('sectorCommand.laggardsDesc')}</p>
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
                                <span className="text-[13px] text-slate-300">{t(`sectorCommand.${el.key}`)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 10 Sector Cards Grid */}
                <div className={card}>
                    <h4 className="text-[14px] font-semibold text-white mb-2 flex items-center gap-2">
                        <Layers size={14} className="text-cyan-400" />
                        {t('sectorCommand.gridTitle')}
                    </h4>
                    <p className="text-[13px] text-slate-300 leading-relaxed mb-3">{t('sectorCommand.gridDesc')}</p>

                    <div className="space-y-1.5">
                        {[
                            { key: 'gridAvg', icon: <BarChart3 size={12} className="text-emerald-400" /> },
                            { key: 'gridLeadLag', icon: <Target size={12} className="text-amber-400" /> },
                            { key: 'gridMetrics', icon: <Activity size={12} className="text-cyan-400" /> },
                            { key: 'gridNav', icon: <ArrowRight size={12} className="text-purple-400" /> },
                        ].map(el => (
                            <div key={el.key} className="flex items-start gap-2 py-1.5 px-2.5 rounded-md bg-white/[0.02]">
                                <span className="mt-0.5 shrink-0">{el.icon}</span>
                                <span className="text-[13px] text-slate-300">{t(`sectorCommand.${el.key}`)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════ */}
            {/* Section 3: Alpha Score Deep-Dive                */}
            {/* ═══════════════════════════════════════════════ */}
            <section className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center">
                        <Brain size={16} className="text-white" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">{t('alpha.title')}</h3>
                        <p className="text-[13px] text-slate-400 font-medium uppercase tracking-wider">{t('alpha.tagline')}</p>
                    </div>
                </div>

                <p className="text-[14px] text-slate-300 leading-relaxed">{t.rich('alpha.desc', richTags)}</p>

                {/* Alpha Score Visual */}
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                    <div className="flex items-center gap-2 px-4 pt-3 pb-2">
                        <Brain size={14} className="text-amber-400" />
                        <span className="text-[13px] font-bold tracking-wide text-slate-200">ALPHA SCORE</span>
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
                    <h4 className="text-[14px] font-semibold text-white mb-2 flex items-center gap-2">
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
                                    <p className="text-[13px] text-slate-400 leading-snug mt-0.5 line-clamp-2">
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
                                { action: 'STRONG BUY', color: 'text-emerald-400', key: 'strongBuy' },
                                { action: 'BUY', color: 'text-emerald-300', key: 'buy' },
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
            <section className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-indigo-600 flex items-center justify-center">
                        <Layers size={16} className="text-white" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">{t('sectorZones.title')}</h3>
                        <p className="text-[13px] text-slate-400 font-medium uppercase tracking-wider">{t('sectorZones.tagline')}</p>
                    </div>
                </div>

                <p className="text-[14px] text-slate-300 leading-relaxed">{t.rich('sectorZones.desc', richTags)}</p>

                {/* M7 Tab Screenshot */}
                <div className="rounded-xl overflow-hidden border border-white/[0.08] shadow-lg">
                    <Image
                        src={m7Img}
                        alt="M7 Report Tab View"
                        width={1920}
                        height={1080}
                        quality={85}
                        className="w-full h-auto"
                        loading="lazy"
                    />
                </div>

                {/* Zone A ~ C consolidated card */}
                <div className={card}>
                    {/* Zone A */}
                    <div className="mb-4">
                        <h4 className="text-[14px] font-semibold text-white mb-1 flex items-center gap-2">
                            <BarChart3 size={14} className="text-cyan-400" />
                            {t('sectorZones.gridTitle')}
                        </h4>
                        <p className="text-[13px] text-slate-300 leading-relaxed mb-2">{t('sectorZones.gridDesc')}</p>
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
                        <h4 className="text-[14px] font-semibold text-white mb-1 flex items-center gap-2">
                            <TrendingUp size={14} className="text-cyan-400" />
                            {t('sectorZones.rankingTitle')}
                        </h4>
                        <p className="text-[13px] text-slate-300 leading-relaxed mb-2">{t('sectorZones.rankingDesc')}</p>
                        <div className="space-y-1">
                            {[
                                { key: 'rankMoneyFlow', icon: <TrendingUp size={12} className="text-emerald-400" /> },
                                { key: 'rankSqueeze', icon: <Zap size={12} className="text-amber-400" /> },
                                { key: 'rankPain', icon: <Activity size={12} className="text-rose-400" /> },
                            ].map(r => (
                                <div key={r.key} className="flex items-start gap-2 py-1.5 px-2.5 rounded-md bg-white/[0.02]">
                                    <span className="mt-0.5 shrink-0">{r.icon}</span>
                                    <span className="text-[13px] text-slate-300">{t(`sectorZones.${r.key}`)}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="border-t border-white/[0.06] pt-4 mb-4">
                        <h4 className="text-[14px] font-semibold text-white mb-1 flex items-center gap-2">
                            <Users size={14} className="text-cyan-400" />
                            {t('sectorZones.consensusTitle')}
                        </h4>
                        <p className="text-[13px] text-slate-300 leading-relaxed mb-2">{t('sectorZones.consensusDesc')}</p>
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
                        <h4 className="text-[14px] font-semibold text-white mb-1 flex items-center gap-2">
                            <Lightbulb size={14} className="text-cyan-400" />
                            {t('sectorZones.reportDeckTitle')}
                        </h4>
                        <p className="text-[13px] text-slate-300 leading-relaxed mb-2">{t.rich('sectorZones.reportDeckDesc', richTags)}</p>
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
            <section className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center">
                        <FileText size={16} className="text-white" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">{t('postMarket.title')}</h3>
                        <p className="text-[13px] text-slate-400 font-medium uppercase tracking-wider">{t('postMarket.tagline')}</p>
                    </div>
                </div>

                <p className="text-[14px] text-slate-300 leading-relaxed">{t.rich('postMarket.desc', richTags)}</p>

                {/* AI Cross-Sector Intelligence */}
                <div className={card}>
                    <h4 className="text-[14px] font-semibold text-white mb-2 flex items-center gap-2">
                        <Sparkles size={14} className="text-amber-400" />
                        {t('postMarket.aiTitle')}
                    </h4>
                    <p className="text-[13px] text-slate-300 leading-relaxed mb-3">{t.rich('postMarket.aiDesc', richTags)}</p>
                    <div className="space-y-1.5">
                        {[
                            { key: 'aiTiming', icon: <Calendar size={12} className="text-emerald-400" /> },
                            { key: 'aiContent', icon: <Brain size={12} className="text-cyan-400" /> },
                            { key: 'aiSectors', icon: <Layers size={12} className="text-purple-400" /> },
                        ].map(el => (
                            <div key={el.key} className="flex items-start gap-2 py-1.5 px-2.5 rounded-md bg-white/[0.02]">
                                <span className="mt-0.5 shrink-0">{el.icon}</span>
                                <span className="text-[13px] text-slate-300">{t(`postMarket.${el.key}`)}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Accordion Reports */}
                <div className={card}>
                    <h4 className="text-[14px] font-semibold text-white mb-2 flex items-center gap-2">
                        <Archive size={14} className="text-cyan-400" />
                        {t('postMarket.reportsTitle')}
                    </h4>
                    <p className="text-[13px] text-slate-300 leading-relaxed mb-3">{t.rich('postMarket.reportsDesc', richTags)}</p>
                    <div className="space-y-1.5">
                        {[
                            { key: 'reportAccordion', icon: <Layers size={12} className="text-cyan-400" /> },
                            { key: 'reportMVP', icon: <Trophy size={12} className="text-amber-400" /> },
                            { key: 'reportAlpha', icon: <Gauge size={12} className="text-emerald-400" /> },
                            { key: 'reportGamma', icon: <Activity size={12} className="text-rose-400" /> },
                        ].map(el => (
                            <div key={el.key} className="flex items-start gap-2 py-1.5 px-2.5 rounded-md bg-white/[0.02]">
                                <span className="mt-0.5 shrink-0">{el.icon}</span>
                                <span className="text-[13px] text-slate-300">{t(`postMarket.${el.key}`)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ═══════════════════════════════════════════════ */}
            {/* Section 6: 10 Sectors Catalog                   */}
            {/* ═══════════════════════════════════════════════ */}
            <section className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-400 to-purple-600 flex items-center justify-center">
                        <Layers size={16} className="text-white" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">{t('sectors.title')}</h3>
                        <p className="text-[13px] text-slate-400 font-medium uppercase tracking-wider">{t('sectors.tagline')}</p>
                    </div>
                </div>

                <p className="text-[14px] text-slate-300 leading-relaxed">{t.rich('sectors.desc', richTags)}</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {sectors.map(s => (
                        <div key={s.key} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                            <div className="flex items-center gap-2 mb-1.5">
                                <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${s.accent} flex items-center justify-center`}>
                                    {s.icon}
                                </div>
                                <span className={`text-[13px] font-bold ${s.color}`}>{sectorDisplayNames[s.key]}</span>
                            </div>
                            <p className="text-[13px] text-slate-400 leading-snug mb-1.5">{t(`sectors.${s.key}`)}</p>
                            <div className={`text-[12px] font-mono ${s.color} px-2 py-1 rounded border ${s.ring} leading-snug`}>
                                {s.tickers}
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ═══════════════════════════════════════════════ */}
            {/* Section 7: Key Indicators Reference              */}
            {/* ═══════════════════════════════════════════════ */}
            <section className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
                        <BarChart3 size={16} className="text-white" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">{t('indicators.title')}</h3>
                        <p className="text-[13px] text-slate-400 font-medium uppercase tracking-wider">{t('indicators.tagline')}</p>
                    </div>
                </div>

                <p className="text-[14px] text-slate-300 leading-relaxed">{t.rich('indicators.desc', richTags)}</p>

                <div className="space-y-2">
                    {[
                        { key: 'gex', icon: <Activity size={14} className="text-emerald-400" />, color: 'border-emerald-500/20' },
                        { key: 'darkPool', icon: <Eye size={14} className="text-purple-400" />, color: 'border-purple-500/20' },
                        { key: 'pcr', icon: <BarChart3 size={14} className="text-cyan-400" />, color: 'border-cyan-500/20' },
                        { key: 'squeeze', icon: <Zap size={14} className="text-amber-400" />, color: 'border-amber-500/20' },
                        { key: 'netPremium', icon: <TrendingUp size={14} className="text-emerald-400" />, color: 'border-emerald-500/20' },
                        { key: 'whaleIndex', icon: <Globe size={14} className="text-violet-400" />, color: 'border-violet-500/20' },
                    ].map(ind => (
                        <div key={ind.key} className={`p-3 rounded-lg border ${ind.color} bg-white/[0.02]`}>
                            <div className="flex items-center gap-2 mb-1">
                                {ind.icon}
                                <span className="text-[13px] font-bold text-white">{t(`indicators.${ind.key}Title`)}</span>
                            </div>
                            <p className="text-[13px] text-slate-300 leading-relaxed mb-1.5">{t(`indicators.${ind.key}Desc`)}</p>
                            <p className="text-[13px] text-amber-400/90 leading-relaxed flex items-start gap-1.5">
                                <Crosshair size={12} className="mt-0.5 shrink-0" />
                                {t(`indicators.${ind.key}Trading`)}
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ═══════════════════════════════════════════════ */}
            {/* Section 8: Trading Strategy Guide                */}
            {/* ═══════════════════════════════════════════════ */}
            <section className="space-y-4">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-400 to-indigo-600 flex items-center justify-center">
                        <Lightbulb size={16} className="text-white" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">{t('usage.title')}</h3>
                        <p className="text-[13px] text-slate-400 font-medium uppercase tracking-wider">{t('usage.tagline')}</p>
                    </div>
                </div>

                <p className="text-[14px] text-slate-300 leading-relaxed">{t('usage.desc')}</p>

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
                                    <span className="text-[13px] font-bold text-white">{t(`usage.${tip.titleKey}`)}</span>
                                </div>
                                <p className="text-[13px] text-slate-300 leading-relaxed">{t(`usage.${tip.descKey}`)}</p>
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
                        <h4 className="text-[14px] font-bold text-amber-300 mb-1">{t('warningTitle')}</h4>
                        <p className="text-[13px] text-amber-200/80 leading-relaxed">{t('warningDesc')}</p>
                    </div>
                </div>
            </section>
        </HowItWorksLayout>
    );
}
