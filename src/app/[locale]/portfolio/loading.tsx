// [PERF] Streaming SSR — 페이지 전환 시 즉시 스켈레톤 표시
export default function PortfolioLoading() {
    return (
        <div className="min-h-screen bg-gradient-to-b from-[#0b1120] via-[#0d1424] to-[#0b1120] text-slate-100 p-4">
            {/* Header */}
            <div className="h-10 bg-slate-800/30 rounded-lg animate-pulse mb-4 w-60" />

            {/* 5 Stats Bar */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-20 bg-slate-800/30 rounded-xl animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
                ))}
            </div>

            {/* Table Header */}
            <div className="h-10 bg-slate-800/25 rounded-lg animate-pulse mb-2" />

            {/* Table Rows */}
            <div className="space-y-1.5">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-14 bg-slate-800/15 rounded-lg animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
                ))}
            </div>
        </div>
    );
}
