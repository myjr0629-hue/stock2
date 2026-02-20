// [PERF] Streaming SSR — 페이지 전환 시 즉시 스켈레톤 표시
export default function GuardianLoading() {
    return (
        <div className="min-h-screen bg-[#050505] text-white">
            {/* Oracle Header Skeleton */}
            <div className="h-20 bg-slate-800/30 animate-pulse" />

            {/* Main Grid Skeleton */}
            <main className="pb-4 px-4 max-w-[1920px] mx-auto flex flex-col gap-4 mt-4">
                {/* Top Row: 3 panels */}
                <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-12 lg:col-span-4 h-56 bg-slate-800/20 rounded-lg animate-pulse" />
                    <div className="col-span-12 lg:col-span-4 h-56 bg-slate-800/20 rounded-lg animate-pulse" style={{ animationDelay: '100ms' }} />
                    <div className="col-span-12 lg:col-span-4 h-56 bg-slate-800/20 rounded-lg animate-pulse" style={{ animationDelay: '200ms' }} />
                </div>

                {/* Bottom Row: Map + Intel */}
                <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-12 lg:col-span-8 h-[500px] bg-slate-800/15 rounded-lg animate-pulse" />
                    <div className="col-span-12 lg:col-span-4 space-y-4">
                        <div className="h-32 bg-slate-800/20 rounded-lg animate-pulse" style={{ animationDelay: '150ms' }} />
                        <div className="h-48 bg-slate-800/20 rounded-lg animate-pulse" style={{ animationDelay: '250ms' }} />
                        <div className="flex-1 h-48 bg-slate-800/20 rounded-lg animate-pulse" style={{ animationDelay: '350ms' }} />
                    </div>
                </div>
            </main>
        </div>
    );
}
