const fs = require('fs');

const path = 'src/components/TechnicalLevelsMap.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add isMobile to props interface
content = content.replace(
    'gammaFlipLevel?: number;\n}',
    'gammaFlipLevel?: number;\n    isMobile?: boolean;\n}'
);

// 2. Add isMobile to destructured props
content = content.replace(
    'gammaFlipLevel,\n}: TechnicalLevelsMapProps) {',
    'gammaFlipLevel,\n    isMobile\n}: TechnicalLevelsMapProps) {'
);

// 3. Inject mobile rendering right before the main return
const targetLine = "    return (\n        <div className={`rounded-xl border backdrop-blur-sm";

const mobileRender = `    if (isMobile) {
        return (
            <div className={\`rounded-xl border backdrop-blur-sm p-4 space-y-3 relative overflow-hidden transition-all duration-500 \${
                isBullishPos ? 'border-emerald-500/25 bg-slate-900/40' : isBearishPos ? 'border-rose-500/25 bg-slate-900/40' : 'border-indigo-500/25 bg-slate-900/40'
            }\`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className={\`w-2 h-2 rounded-full \${isBullishPos ? 'bg-emerald-400' : isBearishPos ? 'bg-rose-400' : 'bg-indigo-400'}\`} />
                        <span className="text-[13px] font-bold text-slate-300 uppercase font-jakarta">Tech Levels</span>
                    </div>
                </div>
                <div className="text-[12px] text-slate-300 leading-relaxed font-jakarta">
                    {insightText}
                </div>
                <div className="space-y-1.5 pt-2">
                    {[...levels].reverse().map((level, i) => (
                        <div key={i} className={\`flex items-center justify-between py-1.5 px-3 rounded-lg border \${level.isCurrent ? 'bg-white/10 border-white/20' : 'bg-slate-800/40 border-slate-700/50'}\`}>
                            <div className="flex items-center gap-2">
                                <div className={\`w-2 h-2 rounded-full \${level.isCurrent ? 'bg-white' : level.dotColor}\`} />
                                <span className={\`text-[13px] font-jakarta \${level.isCurrent ? 'text-white font-bold' : 'text-slate-300'}\`}>
                                    {locale === 'ko' ? level.labelKo : locale === 'ja' ? level.labelJa : level.label}
                                </span>
                            </div>
                            <span className={\`text-[13px] font-mono tabular-nums \${level.isCurrent ? 'text-white font-bold' : 'text-slate-300'}\`}>
                                \${level.value.toFixed(2)}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

`;

content = content.replace(targetLine, mobileRender + targetLine);
fs.writeFileSync(path, content, 'utf8');
console.log("Refactored TechnicalLevelsMap successfully.");
