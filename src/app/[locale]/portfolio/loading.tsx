// [PERF] Streaming SSR — 페이지 전환 시 즉시 스켈레톤 표시
export default function PortfolioLoading() {
    return (
        <div className="min-h-screen bg-[#0a0e14] text-white p-4">
            {/* Portfolio Stats Bar Skeleton */}
            <div className="flex gap-4 mb-6">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex-1 h-20 bg-slate-800/30 rounded-xl animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
                ))}
            </div>

            {/* Holdings Table Skeleton */}
            <div className="space-y-2">
                {/* Table Header */}
                <div className="h-12 bg-slate-800/40 rounded-lg animate-pulse" />
                {/* Rows */}
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-16 bg-slate-800/20 rounded-lg animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
                ))}
            </div>
        </div>
    );
}
