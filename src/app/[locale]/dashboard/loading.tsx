// [PERF] Streaming SSR — 페이지 전환 시 즉시 스켈레톤 표시
export default function DashboardLoading() {
    return (
        <div className="min-h-screen bg-[#0a0e14] text-white p-4">
            {/* Top Bar Skeleton */}
            <div className="h-14 bg-slate-800/40 rounded-lg mb-4 animate-pulse" />

            <div className="grid grid-cols-12 gap-4">
                {/* Left: Watchlist Skeleton */}
                <div className="col-span-12 lg:col-span-3 space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="h-16 bg-slate-800/30 rounded-lg animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
                    ))}
                </div>

                {/* Right: Chart + Indicators Skeleton */}
                <div className="col-span-12 lg:col-span-9 space-y-4">
                    {/* Chart Area */}
                    <div className="h-[400px] bg-slate-800/30 rounded-lg animate-pulse" />
                    {/* Bottom Indicators */}
                    <div className="grid grid-cols-3 gap-4">
                        <div className="h-24 bg-slate-800/20 rounded-lg animate-pulse" style={{ animationDelay: '200ms' }} />
                        <div className="h-24 bg-slate-800/20 rounded-lg animate-pulse" style={{ animationDelay: '300ms' }} />
                        <div className="h-24 bg-slate-800/20 rounded-lg animate-pulse" style={{ animationDelay: '400ms' }} />
                    </div>
                </div>
            </div>
        </div>
    );
}
