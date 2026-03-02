// [PERF] Streaming SSR — Flow 페이지 전환 시 즉시 스켈레톤 표시
export default function FlowLoading() {
    return (
        <div className="min-h-screen bg-[#0a0e14] text-white p-4">
            {/* Ticker Header Skeleton */}
            <div className="flex items-center gap-3 mb-4">
                <div className="h-8 w-24 bg-slate-800/40 rounded-lg animate-pulse" />
                <div className="h-6 w-32 bg-slate-800/30 rounded-lg animate-pulse" style={{ animationDelay: '100ms' }} />
            </div>

            {/* Price Display Skeleton */}
            <div className="h-12 w-48 bg-slate-800/30 rounded-lg animate-pulse mb-4" />

            {/* AI Verdict Skeleton */}
            <div className="h-24 bg-slate-800/20 rounded-xl animate-pulse mb-4" style={{ animationDelay: '150ms' }} />

            {/* 4 Metric Cards Row */}
            <div className="grid grid-cols-4 gap-3 mb-4">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-28 bg-slate-800/20 rounded-xl animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
                ))}
            </div>

            {/* Flow Radar Chart Area */}
            <div className="grid grid-cols-2 gap-4">
                <div className="h-[300px] bg-slate-800/15 rounded-xl animate-pulse" style={{ animationDelay: '200ms' }} />
                <div className="h-[300px] bg-slate-800/15 rounded-xl animate-pulse" style={{ animationDelay: '250ms' }} />
            </div>
        </div>
    );
}
