const fs = require('fs');

const path = 'src/components/GammaPressureGauge.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add isMobile to props interface
content = content.replace(
    'squeezeScore?: number;\n}',
    'squeezeScore?: number;\n    isMobile?: boolean;\n}'
);

// 2. Add isMobile to destructured props
content = content.replace(
    'squeezeScore = 0,\n}: GammaPressureGaugeProps) {',
    'squeezeScore = 0,\n    isMobile\n}: GammaPressureGaugeProps) {'
);

// 3. Inject mobile rendering right before the main return
const targetLine = "    return (\n        <div className={`rounded-lg backdrop-blur-md shadow-lg relative group transition-all duration-500 ${";

const mobileRender = `    if (isMobile) {
        return (
            <div className={\`rounded-xl border backdrop-blur-sm p-4 relative overflow-hidden transition-all duration-500 \${
                isLongGamma ? 'border-emerald-500/25 bg-slate-900/40' : 'border-red-500/25 bg-slate-900/40'
            }\`}>
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className={\`w-2 h-2 rounded-full \${isLongGamma ? 'bg-emerald-400' : 'bg-red-400'}\`} />
                        <span className="text-[13px] font-bold text-slate-300 uppercase font-jakarta">Gamma Pressure</span>
                    </div>
                    <span className={\`text-[12px] px-1.5 py-0.5 rounded border font-mono font-bold font-jakarta flex items-center gap-1.5 \${
                        isLongGamma ? 'bg-emerald-900/50 text-emerald-400 border-emerald-500/30' : 'bg-red-900/50 text-red-400 border-red-500/30'
                    }\`}>
                        {isLongGamma ? 'LONG' : 'SHORT'}
                    </span>
                </div>
                
                <div className="space-y-2">
                    <div className="flex justify-between items-center bg-slate-800/40 px-3 py-1.5 rounded-lg border border-slate-700/50">
                        <span className="text-[13px] font-jakarta text-slate-300">Net GEX</span>
                        <span className={\`font-mono font-bold text-[14px] \${isLongGamma ? 'text-emerald-400' : 'text-red-400'}\`}>{formatGex(netGex)}</span>
                    </div>
                    
                    <div className="flex justify-between items-center px-2 py-1">
                        <div className="flex flex-col">
                            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Put Floor</span>
                            <span className="text-red-400 font-mono font-bold text-[13px]">\${putFloor > 0 ? putFloor.toFixed(0) : '—'}</span>
                        </div>
                        <div className="flex flex-col justify-end items-end">
                            <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Call Wall</span>
                            <span className="text-emerald-400 font-mono font-bold text-[13px]">\${callWall > 0 ? callWall.toFixed(0) : '—'}</span>
                        </div>
                    </div>

                    {flipDistance !== null && gammaFlipLevel > 0 && (
                        <div className="flex items-center justify-between px-2 pt-1 border-t border-white/5">
                            <span className="text-[12px] font-jakarta text-amber-400">Gamma Flip</span>
                            <span className={\`font-mono font-bold text-[12px] \${flipDistance >= 0 ? 'text-emerald-400' : 'text-red-400'}\`}>
                                \${gammaFlipLevel.toFixed(0)} ({flipDistance >= 0 ? '+' : ''}{flipPct?.toFixed(1)}%)
                            </span>
                        </div>
                    )}
                </div>
            </div>
        );
    }

`;

content = content.replace(targetLine, mobileRender + targetLine);
fs.writeFileSync(path, content, 'utf8');
console.log("Refactored GammaPressureGauge successfully.");
