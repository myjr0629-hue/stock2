// [PERF] Streaming SSR — 페이지 전환 시 즉시 스켈레톤 표시
export default function IntelLoading() {
    return (
        <div className="min-h-screen bg-[#050505] text-white flex">
            {/* ── Left Sidebar ── */}
            <aside className="hidden lg:flex flex-col w-48 shrink-0 border-r border-white/5 p-3 gap-1.5">
                {/* Sector Command Header */}
                <div className="h-10 bg-slate-800/40 rounded-lg animate-pulse mb-2" />
                {/* Post-Market */}
                <div className="h-9 bg-slate-800/30 rounded-lg animate-pulse" style={{ animationDelay: '50ms' }} />
                {/* Sector Intel */}
                <div className="h-9 bg-slate-800/30 rounded-lg animate-pulse" style={{ animationDelay: '100ms' }} />
                {/* M7 Report */}
                <div className="h-9 bg-slate-800/25 rounded-lg animate-pulse" style={{ animationDelay: '150ms' }} />
                {/* 10 Sector Items */}
                {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="h-12 bg-slate-800/20 rounded-lg animate-pulse" style={{ animationDelay: `${200 + i * 50}ms` }} />
                ))}
            </aside>

            {/* ── Main Content ── */}
            <div className="flex-1 p-4 space-y-5 overflow-hidden">
                {/* Sector Command Hero */}
                <div className="h-32 bg-slate-800/30 rounded-xl animate-pulse" />

                {/* Alpha Leaders / Laggards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="h-44 bg-slate-800/20 rounded-xl animate-pulse" style={{ animationDelay: '100ms' }} />
                    <div className="h-44 bg-slate-800/20 rounded-xl animate-pulse" style={{ animationDelay: '200ms' }} />
                </div>

                {/* 10 Sector Cards — 5×2 Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    {Array.from({ length: 10 }).map((_, i) => (
                        <div key={i} className="h-40 bg-slate-800/15 rounded-xl animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
                    ))}
                </div>

                {/* Ranking Table */}
                <div className="space-y-2">
                    <div className="h-8 bg-slate-800/30 rounded-lg animate-pulse w-40" />
                    {Array.from({ length: 10 }).map((_, i) => (
                        <div key={i} className="h-10 bg-slate-800/15 rounded-lg animate-pulse" style={{ animationDelay: `${i * 40}ms` }} />
                    ))}
                </div>
            </div>
        </div>
    );
}
