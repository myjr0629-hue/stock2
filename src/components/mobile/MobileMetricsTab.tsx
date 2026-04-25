"use client";
import React from "react";
import { useDashboardStore } from "@/stores/dashboardStore";
import { useTranslations } from "next-intl";
import { useTier } from "@/contexts/TierContext";
import { useCardCustomize } from "@/components/dashboard/CardCustomize";
import { ProGate, EliteGate } from "@/components/gate/FeatureGate";
import { MobileMetricCard, CenteredBar, DualValue, ProportionBar } from "./MobileMetricCard";
import { Activity, Radio, Zap, Target, TrendingUp, TrendingDown, BarChart3, BarChart2, Anchor, Gauge, Brain, Layers, Gem, Crown, Settings, Check, Plus } from "lucide-react";
import { CardTooltip } from "@/components/ui/CardTooltip";

export function MobileMetricsGrid() {
    const { tier } = useTier();
    const customize = useCardCustomize(tier);
    const data = useDashboardStore(s => s.tickers[s.selectedTicker]);
    const td = useTranslations("dashboard");
    const gt = useTranslations("gate");
    const co = customize.cardOrder;
    const price = data?.underlyingPrice || 0;

    return (
        <div className="px-3 py-3">
            {customize.isEditing && (
                <div className="flex justify-end mb-2"><button onClick={() => customize.setShowSelector(true)} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-slate-800/50 text-slate-400 border border-white/5"><Plus className="w-3 h-3" />Select Cards</button></div>
            )}
            {customize.showSelector && <customize.CardSelectorModal visibleCards={co} onToggleCard={customize.toggleCard} onClose={() => customize.setShowSelector(false)} tier={tier} />}
            <div className="grid grid-cols-2 gap-2">
                {/* 1. NET GEX */}
                {co.includes("netGex") && <ProGate title="Net GEX" mode="peek" compact tooltipPosition="above" description={gt("descNetGamma")}>
                    {(() => { const g = data?.netGex || 0; const d = g > 0 ? `+${(g/1e9).toFixed(2)}B` : `${(g/1e9).toFixed(2)}B`; const pct = Math.min(Math.abs(g)/5e9*50, 50); const alert = g < 0 ? "bg-rose-500/10 border-rose-400/40 shadow-[0_0_20px_rgba(244,63,94,0.15)]" : g > 0 ? "bg-emerald-500/10 border-emerald-400/30" : undefined;
                    return <MobileMetricCard title="NET GEX" icon={<Activity className="w-3 h-3 text-amber-400"/>} value={g ? d : "—"} valueColor={g > 0 ? "#4ade80" : "#f87171"} sub={g > 0 ? td("gexStableInterpret") : td("gexVolatileInterpret")} alertStyle={alert}><CenteredBar pct={g >= 0 ? pct : -pct} color={g >= 0 ? "#4ade80" : "#f87171"}/><div className="flex justify-between mt-0.5"><span className="text-[9px] text-slate-400">-5B</span><span className="text-[9px] text-slate-400">0</span><span className="text-[9px] text-slate-400">+5B</span></div></MobileMetricCard>;
                    })()}
                </ProGate>}
                {/* 2. GAMMA FLIP */}
                {co.includes("gammaFlip") && <ProGate title="Gamma Flip" mode="blur" compact tooltipPosition="above" description={gt("descGexRegime")}>
                    {(() => { const fl = data?.gammaFlipLevel; const isLong = fl && price > 0 && price > fl; const alert = fl && price > 0 ? (isLong ? "bg-emerald-500/10 border-emerald-400/30" : "bg-rose-500/10 border-rose-400/40") : undefined;
                    return <MobileMetricCard title="GAMMA FLIP" icon={<Radio className="w-3 h-3 text-cyan-400"/>} value={fl ? `$${fl.toFixed(0)}` : "—"} badge={fl && price > 0 ? (isLong ? "LONG" : "SHORT") : undefined} badgeColor={isLong ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"} sub={fl && price > 0 ? (isLong ? "Above Flip" : "Below Flip") : undefined} alertStyle={alert}><div className="flex justify-between mt-1"><span className="text-[9px] text-rose-300">SHORT</span><span className="text-[9px] text-cyan-300">FLIP</span><span className="text-[9px] text-emerald-300">LONG</span></div></MobileMetricCard>;
                    })()}
                </ProGate>}
                {/* 3. SQUEEZE */}
                {co.includes("squeeze") && <ProGate title="Squeeze" mode="peek" compact tooltipPosition="above" description={gt("descSqueeze")}>
                    {(() => { const s = data?.squeezeScore ?? 0; const r = data?.squeezeRisk ?? "LOW"; const c = r === "EXTREME" ? "#f87171" : r === "HIGH" ? "#fbbf24" : r === "MEDIUM" ? "#facc15" : "#4ade80"; const alert = r === "EXTREME" || r === "HIGH" ? "bg-amber-500/10 border-amber-400/40 shadow-[0_0_20px_rgba(245,158,11,0.15)]" : undefined;
                    return <MobileMetricCard title="SQUEEZE" icon={<Zap className="w-3 h-3 text-indigo-400"/>} value={`${s}%`} valueColor={c} badge={r} badgeColor={r === "EXTREME" || r === "HIGH" ? "bg-amber-500/20 text-amber-400" : "bg-emerald-500/20 text-emerald-400"} sub={s >= 70 ? td("sqzExtreme") : s >= 50 ? td("sqzCaution") : td("sqzStable")} barPct={s} barColor={c} barLabels={["0%","50%","100%"]} alertStyle={alert}/>;
                    })()}
                </ProGate>}
                {/* 4. VWAP DIST */}
                {co.includes("vwapDist") && (() => { const vw = data?.vwap || 0; const dist = vw > 0 && price > 0 ? ((price - vw) / vw * 100) : 0;
                return <MobileMetricCard title={td("vwapDistance")} icon={<BarChart3 className="w-3 h-3 text-cyan-400"/>} value={vw > 0 ? `${dist > 0 ? "+" : ""}${dist.toFixed(1)}%` : "—"} valueColor={dist > 0 ? "#4ade80" : dist < 0 ? "#f87171" : "#f1f5f9"} sub={vw > 0 ? `$${vw.toFixed(1)}` : ""}><CenteredBar pct={Math.max(-3, Math.min(3, dist)) / 3 * 50} color={dist >= 0 ? "#4ade80" : "#f87171"}/><div className="flex justify-between mt-0.5"><span className="text-[9px] text-slate-400">-3%</span><span className="text-[9px] text-slate-400">VWAP</span><span className="text-[9px] text-slate-400">+3%</span></div></MobileMetricCard>;
                })()}
                {/* 5. MAX PAIN */}
                {co.includes("maxPain") && <ProGate title="Max Pain" mode="peek" compact tooltipPosition="above" description={gt("descMaxPain")}>
                    {(() => { const mp = data?.maxPain || 0; const dist = mp > 0 && price > 0 ? ((price - mp) / mp * 100) : 0; const near = Math.abs(dist) < 2;
                    return <MobileMetricCard title="MAX PAIN" icon={<Target className="w-3 h-3 text-cyan-400"/>} value={mp ? `$${mp}` : "—"} badge={near && mp > 0 ? "PIN" : mp > 0 ? `${dist > 0 ? "+" : ""}${dist.toFixed(1)}%` : undefined} badgeColor={near ? "bg-amber-500/20 text-amber-400" : dist > 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}/>;
                    })()}
                </ProGate>}
                {/* 6. CALL WALL / PUT FLOOR */}
                {co.includes("callPutWall") && <ProGate title="Call Wall / Put Floor" mode="blur" compact tooltipPosition="above" description={gt("descPutFloorCallWall")}>
                    {(() => { const cw = data?.levels?.callWall || 0; const pf = data?.levels?.putFloor || 0; const cwDist = cw > 0 && price > 0 ? ((cw - price) / price * 100) : 0; const pfDist = pf > 0 && price > 0 ? ((price - pf) / price * 100) : 0;
                    return <MobileMetricCard title="WALLS" icon={<TrendingUp className="w-3 h-3 text-emerald-400"/>} value=""><DualValue left={cw ? `$${cw}` : "—"} right={pf ? `$${pf}` : "—"} leftColor="#4ade80" rightColor="#f87171"/><div className="text-[10px] text-slate-400 mt-0.5">Call Wall / Put Floor</div>{cw > 0 && pf > 0 && <div className="flex justify-between mt-1"><span className="text-[10px] text-rose-300">↓{pfDist.toFixed(1)}%</span><span className="text-[10px] text-emerald-300">↑{cwDist.toFixed(1)}%</span></div>}</MobileMetricCard>;
                    })()}
                </ProGate>}
                {/* 7. DARK POOL */}
                {co.includes("darkPool") && <ProGate title="Dark Pool %" mode="blur" compact tooltipPosition="above" description={gt("descDarkPool")}>
                    {(() => { const dp = data?.darkPoolPct ?? 0; const alert = dp >= 55 ? "bg-purple-500/10 border-purple-400/40 shadow-[0_0_20px_rgba(168,85,247,0.15)]" : undefined;
                    return <MobileMetricCard title="DARK POOL %" icon={<Activity className="w-3 h-3 text-purple-400"/>} value={dp > 0 ? `${dp.toFixed(1)}%` : "—"} valueColor={dp >= 55 ? "#c4b5fd" : "#f1f5f9"} badge={dp >= 55 ? "HIGH" : undefined} badgeColor="bg-purple-500/20 text-purple-400" sub={dp >= 55 ? td("dpInstitutionalHigh") : dp >= 45 ? td("dpInstitutionalActive") : td("dpNormal")} barPct={dp} barColor={dp >= 55 ? "#c4b5fd" : dp >= 45 ? "#a78bfa" : "#94a3b8"} barLabels={["0%","45%","100%"]} alertStyle={alert}/>;
                    })()}
                </ProGate>}
                {/* 8. SHORT VOL */}
                {co.includes("shortVol") && <ProGate title="Short Vol %" mode="blur" compact tooltipPosition="above" description={gt("descShortVol")}>
                    {(() => { const sv = data?.shortVolPct ?? 0; const dp = data?.darkPoolPct ?? 0; const alert = sv >= 50 ? "bg-rose-500/10 border-rose-400/40 shadow-[0_0_20px_rgba(244,63,94,0.15)]" : undefined;
                    return <MobileMetricCard title="SHORT VOL %" icon={<TrendingDown className="w-3 h-3 text-rose-400"/>} value={sv > 0 ? `${sv.toFixed(1)}%` : "—"} valueColor={sv >= 50 ? "#f87171" : sv >= 40 ? "#fbbf24" : "#f1f5f9"} badge={sv >= 50 ? "HIGH" : undefined} badgeColor="bg-rose-500/20 text-rose-400" sub={sv > 0 && dp > 0 ? `vs DP ${dp.toFixed(0)}%` : td("svNormal")} barPct={sv} barColor={sv >= 50 ? "#f87171" : sv >= 40 ? "#fbbf24" : "#4ade80"} barLabels={["0%","40%","100%"]} alertStyle={alert}/>;
                    })()}
                </ProGate>}
                {/* 9. ATM IV */}
                {co.includes("atmIv") && <ProGate title="ATM IV" mode="blur" compact tooltipPosition="above" description={gt("descIvSkew")}>
                    {(() => { const iv = data?.atmIv ?? 0; const exp = data?.atmIvExpiry;
                    return <MobileMetricCard title="ATM IV" icon={<Activity className="w-3 h-3 text-purple-400"/>} value={iv ? `${iv}%` : "—"} sub={`${iv > 50 ? td("highVol") : td("lowVol")}${exp ? " · " + exp.slice(5).replace("-", "/") : ""}`} barPct={iv} barColor={iv >= 60 ? "#f87171" : iv >= 40 ? "#fbbf24" : "#4ade80"} barLabels={["0%","50%","100%"]}/>;
                    })()}
                </ProGate>}
                {/* 10. P/C RATIO */}
                {co.includes("pcRatio") && (() => { const vpcr = data?.volumePcr ?? null; const cv = data?.volumePcrCallVol ?? 0; const pv = data?.volumePcrPutVol ?? 0; const bull = vpcr !== null && vpcr >= 1.3; const bear = vpcr !== null && vpcr <= 0.75; const label = vpcr === null ? "—" : vpcr >= 2.0 ? td("pcrStrongCall") : vpcr >= 1.3 ? td("pcrCall") : vpcr <= 0.5 ? td("pcrStrongPut") : vpcr <= 0.75 ? td("pcrPut") : td("pcrBalanced");
                return <MobileMetricCard title="P/C RATIO" icon={bull ? <TrendingUp className="w-3 h-3 text-emerald-400"/> : bear ? <TrendingDown className="w-3 h-3 text-rose-400"/> : <Activity className="w-3 h-3 text-slate-400"/>} value={vpcr !== null ? vpcr.toFixed(2) : "—"} valueColor={bull ? "#4ade80" : bear ? "#f87171" : "#f1f5f9"} badge="VOLUME" badgeColor="bg-cyan-500/20 text-cyan-400" sub={label}>{cv > 0 && pv > 0 && <><div className="text-[10px] text-slate-300 mt-1 font-mono">C {(cv/1000).toFixed(0)}K / P {(pv/1000).toFixed(0)}K</div><ProportionBar leftPct={cv/(cv+pv)*100} leftColor="#4ade80" rightColor="#f87171" leftLabel="Call" rightLabel="Put"/></>}</MobileMetricCard>;
                })()}
                {/* 11. GEX REGIME */}
                {co.includes("gexRegime") && <EliteGate title="GEX Regime" compact tooltipPosition="above" description={gt("descGexRegime")}>
                    {(() => { const gex = data?.netGex || 0; const flip = data?.gammaFlipLevel || 0; const conc = data?.gammaConcentration || 0; const isLong = gex >= 0;
                    let regime = isLong ? "STABLE" : "EXPLOSIVE"; let flipDist = 0; let fw = isLong ? 1.0 : 0.3;
                    if (flip > 0 && price > 0) { flipDist = ((price - flip) / flip) * 100; if (flipDist > 5) { fw = 1.2; regime = "STABLE"; } else if (flipDist > 2) { fw = 1.0; regime = "STABLE"; } else if (flipDist > 0) { fw = 0.5; regime = "TRANSITION"; } else if (flipDist > -2) { fw = 0.3; regime = "FLIP_ZONE"; } else { fw = 0.2; regime = "EXPLOSIVE"; } }
                    const exp = data?.expiration; let dte = -1; if (exp) { const et = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" })); const ts = `${et.getFullYear()}-${String(et.getMonth()+1).padStart(2,"0")}-${String(et.getDate()).padStart(2,"0")}`; dte = Math.max(0, Math.round((new Date(exp+"T16:00:00").getTime()-new Date(ts+"T09:30:00").getTime())/86400000)); }
                    const dw = dte === 0 ? 1.0 : dte === 1 ? 0.7 : dte <= 3 ? 0.4 : 0.2;
                    const ps = Math.min(100, Math.round(conc * fw * dw));
                    const colors: Record<string, string> = { STABLE: "#4ade80", TRANSITION: "#fbbf24", FLIP_ZONE: "#fb923c", EXPLOSIVE: "#f87171" };
                    return <MobileMetricCard title="GEX REGIME" icon={<Zap className="w-3 h-3 text-amber-400"/>} value={`${ps}%`} valueColor={colors[regime]} badge={exp?.slice(5)} badgeColor="bg-slate-700/50 text-slate-300" sub={flip > 0 ? `FLIP $${flip.toFixed(0)} (${flipDist > 0 ? "↑" : "↓"}${Math.abs(flipDist).toFixed(1)}%)` : isLong ? td("gexLongGamma") : td("gexShortGamma")} barPct={ps} barColor={colors[regime]}/>;
                    })()}
                </EliteGate>}
                {/* 12. IMPLIED MOVE */}
                {co.includes("impliedMove") && <EliteGate title="Implied Move" compact tooltipPosition="above" description={gt("descImpliedMove")}>
                    {(() => { const im = data?.impliedMovePct ?? 0; const dir = data?.impliedMoveDir ?? "neutral"; const alert = im >= 3 ? "bg-cyan-500/10 border-cyan-400/40 shadow-[0_0_25px_rgba(34,211,238,0.2)]" : undefined;
                    return <MobileMetricCard title="IMPLIED MOVE" icon={<Activity className="w-3 h-3 text-cyan-400"/>} value={im > 0 ? `±${im}%` : "—"} valueColor={im >= 5 ? "#22d3ee" : "#f1f5f9"} badge={im >= 5 ? td("imSpike") : im >= 3 ? td("imVolatility") : undefined} badgeColor="bg-cyan-500/20 text-cyan-400" sub={dir === "bullish" ? td("imBullish") : dir === "bearish" ? td("imBearish") : td("imNeutral")} alertStyle={alert}><CenteredBar pct={Math.min(im*5, 45)} color={im >= 5 ? "#22d3ee" : im >= 3 ? "rgba(34,211,238,0.7)" : "rgba(34,211,238,0.4)"}/><div className="flex justify-between mt-0.5"><span className="text-[9px] text-slate-400">-{im}%</span><span className="text-[9px] text-slate-400">0</span><span className="text-[9px] text-slate-400">+{im}%</span></div></MobileMetricCard>;
                    })()}
                </EliteGate>}
                {/* 13. CONTEXT SCORE */}
                {co.includes("alphaScore") && <ProGate title="Context Score" mode="peek" compact tooltipPosition="above" description={gt("descAiDeep")}>
                    {(() => { const a = data?.alpha; const s = a?.score ?? 0; const g = a?.grade ?? "—"; const gc = g === "A+" || g === "A" ? "#4ade80" : g === "B+" || g === "B" ? "#22d3ee" : g === "C" ? "#fbbf24" : "#94a3b8";
                    return <MobileMetricCard title="CONTEXT SCORE" icon={<Crown className="w-3 h-3 text-emerald-400"/>} value={g} valueColor={gc} sub={`Score: ${s > 0 ? "+" : ""}${s}`} barPct={Math.min(Math.abs(s), 100)} barColor={s > 0 ? "#22c55e" : "#ef4444"}/>;
                    })()}
                </ProGate>}
                {/* 14. WHALE INDEX */}
                {co.includes("whaleIndex") && <ProGate title="Whale Index" mode="blur" compact tooltipPosition="above" description={gt("descAiDeep")}>
                    {(() => { const wi = (data as any)?.whaleIndex ?? 0; const alert = Math.abs(wi) >= 50 ? "bg-purple-500/10 border-purple-400/40" : undefined;
                    return <MobileMetricCard title="WHALE INDEX" icon={<Anchor className="w-3 h-3 text-purple-400"/>} value={wi !== 0 ? `${wi > 0 ? "+" : ""}${wi}` : "—"} valueColor={wi > 0 ? "#4ade80" : wi < 0 ? "#f87171" : "#94a3b8"} sub={wi > 20 ? td("whaleBullish") : wi < -20 ? td("whaleBearish") : td("whaleNeutral")} alertStyle={alert}><CenteredBar pct={wi / 2} color={wi > 0 ? "#22c55e" : "#ef4444"}/></MobileMetricCard>;
                    })()}
                </ProGate>}
                {/* 15. RSI 14 */}
                {co.includes("rsi14") && (() => { const rsi = data?._rsi14 ?? data?.rsi14 ?? null; const ob = rsi !== null && rsi >= 70; const os = rsi !== null && rsi <= 30; const c = ob ? "#f87171" : os ? "#4ade80" : "#94a3b8"; const alert = ob || os ? "bg-amber-500/10 border-amber-400/30" : undefined;
                return <MobileMetricCard title="RSI 14" icon={<Gauge className="w-3 h-3 text-amber-400"/>} value={rsi !== null ? rsi.toFixed(1) : "—"} valueColor={c} sub={ob ? td("labelOverbought") : os ? td("labelOversold") : td("labelNeutral")} barPct={rsi ?? 0} barColor={c} barLabels={["0","50","100"]} alertStyle={alert}/>;
                })()}
                {/* 16. RETURN 3D */}
                {co.includes("return3d") && (() => { const ret = data?._return3D ?? data?.return3D ?? null; const up = ret !== null && ret > 0;
                return <MobileMetricCard title="RETURN 3D" icon={<TrendingUp className="w-3 h-3 text-cyan-400"/>} value={ret !== null ? `${ret > 0 ? "+" : ""}${ret.toFixed(2)}%` : "—"} valueColor={up ? "#4ade80" : ret !== null ? "#f87171" : "#94a3b8"} sub={ret !== null ? (ret > 1 ? td("ret3dStrong") : ret < -1 ? td("ret3dWeak") : td("ret3dFlat")) : ""}><CenteredBar pct={ret !== null ? Math.min(Math.abs(ret)*5, 50) * (ret >= 0 ? 1 : -1) : 0} color={up ? "#22c55e" : "#ef4444"}/></MobileMetricCard>;
                })()}
                {/* 17. REL VOLUME */}
                {co.includes("relVolume") && (() => { const rv = data?._relVol ?? data?.relVol ?? null; const hi = rv !== null && rv >= 2.0; const alert = hi ? "bg-cyan-500/10 border-cyan-400/30" : undefined;
                return <MobileMetricCard title="REL VOLUME" icon={<BarChart2 className="w-3 h-3 text-cyan-400"/>} value={rv !== null ? `${rv.toFixed(1)}x` : "—"} valueColor={hi ? "#22d3ee" : "#f1f5f9"} sub={rv !== null ? (rv >= 2 ? td("labelHigh") : rv >= 1.2 ? td("labelNormal") : td("labelLow")) : ""} barPct={rv !== null ? Math.min(rv*25, 100) : 0} barColor="#06b6d4" alertStyle={alert}/>;
                })()}
                {/* 18. OPI */}
                {co.includes("opi") && (() => { const pcr = data?.volumePcr ?? data?.pcr ?? null; const gex = data?.netGex ?? null; const opi = pcr !== null && gex !== null ? Math.round(((pcr > 1 ? -1 : 1) * 50) + ((gex ?? 0) > 0 ? 20 : -20)) : null;
                return <MobileMetricCard title="OPI" icon={<Layers className="w-3 h-3 text-indigo-400"/>} value={opi !== null ? `${opi > 0 ? "+" : ""}${opi}` : "—"} valueColor={(opi ?? 0) > 0 ? "#4ade80" : (opi ?? 0) < 0 ? "#f87171" : "#94a3b8"} sub={(opi ?? 0) > 0 ? td("opiCallPressure") : (opi ?? 0) < 0 ? td("opiPutPressure") : td("opiBalanced")} badge="Options Position" badgeColor="bg-slate-700/50 text-slate-500"><CenteredBar pct={0} color="#818cf8"/></MobileMetricCard>;
                })()}
                {/* 19. SMART MONEY */}
                {co.includes("smartMoney") && <EliteGate title="Smart Money" compact tooltipPosition="above" description={gt("descAiDeep")}>
                    {(() => { const dp = data?.darkPoolPct ?? 0; const sv = data?.shortVolPct ?? 0; const ss = dp > 0 ? Math.round((dp*0.6)+(sv*0.4)) : null;
                    return <MobileMetricCard title="SMART MONEY" icon={<Brain className="w-3 h-3 text-purple-400"/>} value={ss !== null ? `${ss}%` : "—"} valueColor={(ss ?? 0) >= 50 ? "#c4b5fd" : "#94a3b8"} sub={(ss ?? 0) >= 50 ? td("smartActive") : td("smartQuiet")} barPct={ss ?? 0} barColor="#a78bfa"/>;
                    })()}
                </EliteGate>}
                {/* 20. IV RANK */}
                {co.includes("ivRank") && <ProGate title="IV Rank" mode="peek" compact tooltipPosition="above" description={gt("descAiDeep")}>
                    {(() => { const iv = data?.atmIv ?? 0; const ivr = iv > 0 ? Math.min(Math.round(iv*1.5), 100) : null; const hi = (ivr ?? 0) >= 60;
                    return <MobileMetricCard title="IV RANK" icon={<Gem className="w-3 h-3 text-amber-400"/>} value={ivr !== null ? `${ivr}%` : "—"} valueColor={hi ? "#fbbf24" : "#f1f5f9"} sub={ivr !== null ? (ivr >= 60 ? td("ivRankHigh") : ivr >= 30 ? td("ivRankMedium") : td("ivRankLow")) : ""} barPct={ivr ?? 0} barColor={hi ? "#f59e0b" : "#64748b"}/>;
                    })()}
                </ProGate>}
            </div>
            {/* Customize Button */}
            {(tier === "pro" || tier === "elite") && (
                <div className="mt-3 flex justify-center">
                    <button onClick={() => customize.isEditing ? customize.setIsEditing(false) : customize.setIsEditing(true)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-semibold transition-all ${customize.isEditing ? "bg-cyan-500/15 text-cyan-400 border border-cyan-400/40" : "bg-white/[0.03] text-slate-400 border border-white/[0.06]"}`}>
                        {customize.isEditing ? <><Check className="w-3.5 h-3.5"/>Done</> : <><Settings className="w-3.5 h-3.5"/>Customize Metrics</>}
                    </button>
                </div>
            )}
        </div>
    );
}
