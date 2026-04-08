import React, { useMemo } from 'react';
import { CardTooltip, COMMAND_TOOLTIPS } from './CardTooltip';

interface DualGaugeHUDProps {
  contextScore?: number;
  contextGrade?: string;
  smartFlow?: number;
}

const getSmartFlowConfig = (val: number) => {
  if (val >= 80) return { color: '#10b981', label: 'HEAVY ACCUMULATION', glow: 'rgba(16,185,129,0.5)' };
  if (val >= 60) return { color: '#34d399', label: 'INFLOW TREND', glow: 'rgba(52,211,153,0.3)' };
  if (val >= 40) return { color: '#64748b', label: 'NEUTRAL RANGE', glow: 'rgba(100,116,139,0.2)' };
  if (val >= 20) return { color: '#f59e0b', label: 'OUTFLOW TREND', glow: 'rgba(245,158,11,0.3)' };
  return { color: '#f43f5e', label: 'HEAVY DISTRIBUTION', glow: 'rgba(244,63,94,0.5)' };
};

const getContextConfig = (val: number) => {
  if (val >= 80) return { color: '#0ea5e9', label: 'STRONG CONTEXT', glow: 'rgba(14,165,233,0.5)' };
  if (val >= 60) return { color: '#38bdf8', label: 'FAVORABLE', glow: 'rgba(56,189,248,0.3)' };
  if (val >= 40) return { color: '#94a3b8', label: 'MIXED', glow: 'rgba(148,163,184,0.2)' };
  if (val >= 20) return { color: '#fbbf24', label: 'VULNERABLE', glow: 'rgba(251,191,36,0.3)' };
  return { color: '#ef4444', label: 'WEAK CONTEXT', glow: 'rgba(239,68,68,0.5)' };
};

const SemiCircleGauge = ({ value, config, title, grade, tooltipContent }: { value: number, config: any, title: string, grade?: string, tooltipContent?: any }) => {
  // SVG Math
  const radius = 42;
  const arcLength = Math.PI * radius; // Approx 131.95
  const dashOffset = useMemo(() => {
    const safeValue = Math.min(Math.max(value, 0), 100);
    return arcLength - (arcLength * safeValue) / 100;
  }, [value, arcLength]);

  return (
    <div className="flex flex-col items-center justify-end relative w-[106px] h-[54px] shrink-0">
      
      <svg viewBox="0 0 100 55" className="absolute top-0 left-0 w-full h-full overflow-visible pointer-events-none">
        <path 
          d="M 8 50 A 42 42 0 0 1 92 50" 
          fill="none" 
          stroke="rgba(255,255,255,0.06)" 
          strokeWidth="6" 
          strokeLinecap="round" 
        />
        <path 
          d="M 8 50 A 42 42 0 0 1 92 50" 
          fill="none" 
          stroke={config.color} 
          strokeWidth="6" 
          strokeLinecap="round"
          strokeDasharray={arcLength}
          strokeDashoffset={dashOffset}
          className="transition-all duration-1000 ease-out"
          style={{ filter: `drop-shadow(0 0 5px ${config.glow})` }}
        />
      </svg>

      <div className="absolute top-[-16px] z-10">
        {tooltipContent ? (
          <CardTooltip tooltip={tooltipContent.tooltip} badge={tooltipContent.badge}>
            <div className="text-[12px] font-bold text-white/90 hover:text-white uppercase tracking-wider font-jakarta whitespace-nowrap cursor-help border-b border-dashed border-white/30 pb-[1px] transition-colors">
              {title}
            </div>
          </CardTooltip>
        ) : (
          <div className="text-[12px] font-bold text-white uppercase tracking-wider font-jakarta whitespace-nowrap">
            {title}
          </div>
        )}
      </div>

      <div className="absolute inset-0 flex flex-col items-center justify-end pb-1.5 z-10">
        <div className="flex items-baseline gap-0.5">
            <div 
              className="text-[24px] font-black tabular-nums tracking-tighter text-slate-200 leading-none" 
              style={{ 
                color: config.color, 
                textShadow: value > 0 ? `0 0 10px ${config.glow}` : 'none' 
              }}
            >
              {Math.round(value)}
            </div>
            {grade && (
               <span 
                 className="text-[14px] font-black tracking-tighter leading-none ml-0.5"
                 style={{ color: config.color, textShadow: value > 0 ? `0 0 10px ${config.glow}` : 'none' }}
               >
                 {grade}
               </span>
            )}
        </div>
      </div>

      <div className="absolute -bottom-4 w-[160%] text-center">
        <div 
          className="text-[11px] font-extrabold tracking-widest uppercase truncate px-1 font-jakarta text-slate-200" 
          style={{ color: config.color }}
        >
          {config.label}
        </div>
      </div>
    </div>
  );
};

export const DualGaugeHUD = ({ contextScore = 0, contextGrade, smartFlow = 0 }: DualGaugeHUDProps) => {
  const sfConfig = getSmartFlowConfig(smartFlow);
  const cxConfig = getContextConfig(contextScore);
  
  return (
    <div className="hidden lg:flex items-center gap-5 py-0 px-4 ml-3 border-l border-white/[0.08]">
      <SemiCircleGauge value={contextScore} grade={contextGrade} config={cxConfig} title="CONTEXT SCORE" tooltipContent={COMMAND_TOOLTIPS.CONTEXT_SCORE} />
      <div className="w-px h-10 bg-white/[0.04]" />
      <SemiCircleGauge value={smartFlow} config={sfConfig} title="SMART FLOW" tooltipContent={COMMAND_TOOLTIPS.SMART_FLOW} />
    </div>
  );
};

export default DualGaugeHUD;
