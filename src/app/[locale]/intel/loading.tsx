// [PERF] Streaming SSR — 페이지 전환 시 즉시 스켈레톤 표시
export default function IntelLoading() {
    return (
        <div className="min-h-screen bg-[#050505] text-white p-4">
            {/* Tab Selector Skeleton */}
            <div className="flex gap-2 mb-6">
                <div className="h-10 w-32 bg-slate-800/40 rounded-lg animate-pulse" />
                <div className="h-10 w-32 bg-slate-800/40 rounded-lg animate-pulse" style={{ animationDelay: '100ms' }} />
            </div>

            {/* Session Summary Grid Skeleton */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
                {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="h-36 bg-slate-800/20 rounded-xl animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
                ))}
            </div>

            {/* Report Deck Skeleton */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="h-64 bg-slate-800/15 rounded-xl animate-pulse" />
                <div className="h-64 bg-slate-800/15 rounded-xl animate-pulse" style={{ animationDelay: '150ms' }} />
            </div>
        </div>
    );
}
