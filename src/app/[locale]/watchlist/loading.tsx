// [PERF] Streaming SSR — 페이지 전환 시 즉시 스켈레톤 표시
export default function WatchlistLoading() {
    return (
        <div className="min-h-screen bg-gradient-to-b from-[#0b1120] via-[#0d1424] to-[#0b1120] text-slate-100 p-4">
            <div className="flex gap-4 mb-6">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex-1 h-20 bg-slate-800/30 rounded-xl animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
                ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="h-48 bg-slate-800/20 rounded-xl animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
                ))}
            </div>
        </div>
    );
}
