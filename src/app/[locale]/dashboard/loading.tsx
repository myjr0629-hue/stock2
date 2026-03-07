// [PERF] Streaming SSR — 페이지 전환 시 즉시 스켈레톤 표시
export default function DashboardLoading() {
    return (
        <div className="min-h-screen bg-[#0a0e14] text-white">
            {/* Alpha Status Bar */}
            <div className="h-10 bg-[#0a0f1a] border-b border-white/5" />

            <div className="grid grid-cols-12 h-[calc(100vh-40px)]">
                {/* Left: Watchlist Skeleton */}
                <div className="col-span-12 lg:col-span-2 border-r border-white/5 p-2 space-y-1">
                    <div className="h-8 bg-slate-800/30 rounded mb-2 animate-pulse" />
                    <div className="h-8 bg-slate-800/20 rounded animate-pulse" />
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="h-12 bg-slate-800/20 rounded-lg animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
                    ))}
                </div>

                {/* Center: Main Panel Skeleton */}
                <div className="col-span-12 lg:col-span-8 p-4 space-y-3 overflow-hidden">
                    {/* Header */}
                    <div className="h-10 bg-slate-800/30 rounded-lg animate-pulse" />
                    {/* 3×4 Card Grid */}
                    {Array.from({ length: 3 }).map((_, row) => (
                        <div key={row} className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {Array.from({ length: 4 }).map((_, col) => (
                                <div key={col} className="h-24 bg-slate-800/20 rounded-xl animate-pulse" style={{ animationDelay: `${(row * 4 + col) * 60}ms` }} />
                            ))}
                        </div>
                    ))}
                    {/* Chart Area */}
                    <div className="h-[400px] bg-slate-800/20 rounded-xl animate-pulse" style={{ animationDelay: '400ms' }} />
                </div>

                {/* Right: Signal Feed Skeleton */}
                <div className="hidden lg:block lg:col-span-2 border-l border-white/5 p-2 space-y-2">
                    <div className="h-8 bg-slate-800/30 rounded animate-pulse" />
                    <div className="flex flex-col items-center justify-center h-32 gap-2 animate-pulse">
                        <div className="w-5 h-5 rounded-full bg-slate-700" />
                        <div className="h-4 w-32 bg-slate-800/30 rounded" />
                    </div>
                </div>
            </div>
        </div>
    );
}
