export default function Loading() {
    return (
        <div className="min-h-screen font-sans bg-slate-950 text-slate-200 selection:bg-emerald-500/30 selection:text-emerald-200">
            <main className="mx-auto max-w-7xl px-6 lg:px-8 pt-8 pb-12 space-y-6">
                {/* 1. Header Skeleton */}
                <div className="flex flex-col gap-4 pb-6 border-b border-white/10 animate-pulse">
                    <div className="flex items-end gap-x-6">
                        {/* Logo & Name */}
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-slate-800/50" />
                            <div className="space-y-2">
                                <div className="h-8 w-32 bg-slate-800/50 rounded" />
                                <div className="h-4 w-48 bg-slate-800/30 rounded" />
                            </div>
                        </div>
                        {/* Price */}
                        <div className="hidden sm:block pb-1 space-y-2">
                            <div className="h-8 w-40 bg-slate-800/50 rounded" />
                        </div>
                    </div>
                </div>

                {/* 2. Command Grid Skeleton */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-[800px]">
                    {/* Main Col (Chart) */}
                    <div className="lg:col-span-8 flex flex-col gap-4 h-full">
                        {/* Chart Area */}
                        <div className="h-[520px] rounded-2xl border border-white/5 bg-slate-900/30 relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent skew-x-12 animate-[shimmer_2s_infinite]" />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="flex flex-col items-center gap-3 opacity-50">
                                    <div className="w-12 h-12 border-4 border-slate-700 border-t-emerald-500 rounded-full animate-spin" />
                                    <div className="text-[10px] font-black text-slate-500 tracking-[0.2em] uppercase animate-pulse">
                                        Initializing Command Center...
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Bottom Panels */}
                        <div className="h-[250px] grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="rounded-2xl border border-white/5 bg-slate-900/30 animate-pulse" />
                            <div className="rounded-2xl border border-white/5 bg-slate-900/30 animate-pulse" />
                        </div>
                    </div>

                    {/* Sidebar Col */}
                    <div className="lg:col-span-4 flex flex-col gap-4 h-full">
                        <div className="h-[200px] rounded-2xl border border-white/5 bg-slate-900/30 animate-pulse" />
                        <div className="flex-1 rounded-2xl border border-white/5 bg-slate-900/30 animate-pulse" />
                        <div className="h-[150px] rounded-2xl border border-white/5 bg-slate-900/30 animate-pulse" />
                    </div>
                </div>
            </main>
        </div>
    );
}
