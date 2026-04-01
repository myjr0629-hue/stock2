'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTier } from '@/contexts/TierContext';
import { usePathname } from 'next/navigation';
import { Eye, Users, UserCheck, UserX, ChevronDown, ChevronUp, X } from 'lucide-react';

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
const HEARTBEAT_INTERVAL = 30000; // 30초
const STATS_REFRESH_INTERVAL = 15000; // 15초

interface VisitorStats {
    active: {
        total: number;
        members: number;
        guests: number;
        tierBreakdown: Record<string, number>;
    };
    today: {
        totalVisitors: number;
    };
    pages: Record<string, number>;
    details: { userId: string; tier: string; page: string; lastSeen: string }[];
}

export function AdminVisitorWidget() {
    const [isAdmin, setIsAdmin] = useState(false);
    const [adminEmail, setAdminEmail] = useState('');
    const [stats, setStats] = useState<VisitorStats | null>(null);
    const [expanded, setExpanded] = useState(false);
    const [minimized, setMinimized] = useState(false);
    const sessionIdRef = useRef<string>('');
    const { tier } = useTier();
    const pathname = usePathname();

    // 관리자 여부 확인
    useEffect(() => {
        const checkAdmin = async () => {
            try {
                const supabase = createClient();
                const { data: { user } } = await supabase.auth.getUser();
                if (user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) {
                    setIsAdmin(true);
                    setAdminEmail(user.email);
                }
            } catch { }
        };
        checkAdmin();
    }, []);

    // 세션 ID 생성 (최초 1회)
    useEffect(() => {
        if (!sessionIdRef.current) {
            sessionIdRef.current = 'sess-' + Math.random().toString(36).slice(2, 12) + '-' + Date.now().toString(36);
        }
    }, []);

    // 하트비트 전송 (모든 유저)
    const sendHeartbeat = useCallback(async () => {
        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();

            await fetch('/api/admin/heartbeat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: sessionIdRef.current,
                    userId: user?.id || null,
                    tier: user ? tier : 'guest',
                    page: pathname || '/',
                }),
            });
        } catch { }
    }, [tier, pathname]);

    // 하트비트 인터벌
    useEffect(() => {
        sendHeartbeat(); // 즉시 1회
        const interval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
        return () => clearInterval(interval);
    }, [sendHeartbeat]);

    // 통계 fetch (관리자만)
    const fetchStats = useCallback(async () => {
        if (!isAdmin || !adminEmail) return;
        try {
            const res = await fetch(`/api/admin/visitors?email=${encodeURIComponent(adminEmail)}`);
            if (res.ok) {
                const data = await res.json();
                setStats(data);
            }
        } catch { }
    }, [isAdmin, adminEmail]);

    useEffect(() => {
        if (!isAdmin) return;
        fetchStats();
        const interval = setInterval(fetchStats, STATS_REFRESH_INTERVAL);
        return () => clearInterval(interval);
    }, [isAdmin, fetchStats]);

    // 관리자가 아니면 렌더링 안 함
    if (!isAdmin || !stats) return null;

    // 최소화 상태
    if (minimized) {
        return (
            <button
                onClick={() => setMinimized(false)}
                className="fixed bottom-20 right-4 z-[9999] w-10 h-10 rounded-full
                    bg-gradient-to-br from-cyan-500/20 to-purple-500/20
                    backdrop-blur-xl border border-cyan-500/30
                    flex items-center justify-center
                    shadow-lg shadow-cyan-500/10
                    hover:shadow-cyan-500/20 hover:border-cyan-500/50
                    transition-all duration-300"
                title="Visitor Monitor"
            >
                <Eye className="w-4 h-4 text-cyan-400" />
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-cyan-500 text-[9px] font-black text-white flex items-center justify-center">
                    {stats.active.total}
                </span>
            </button>
        );
    }

    return (
        <div className="fixed bottom-20 right-4 z-[9999] w-[220px]
            bg-gradient-to-br from-[#0d1424]/95 to-[#0a0e1a]/95
            backdrop-blur-2xl
            border border-white/[0.08] rounded-2xl
            shadow-2xl shadow-black/30
            text-[12px] overflow-hidden
            animate-in slide-in-from-right-5 duration-300"
            style={{ fontFamily: '"Plus Jakarta Sans", system-ui' }}
        >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.06]">
                <div className="flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="font-bold text-white tracking-wide text-[11px]">LIVE MONITOR</span>
                    <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={() => setExpanded(!expanded)} className="text-slate-500 hover:text-white transition-colors p-0.5">
                        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
                    </button>
                    <button onClick={() => setMinimized(true)} className="text-slate-500 hover:text-white transition-colors p-0.5">
                        <X className="w-3 h-3" />
                    </button>
                </div>
            </div>

            {/* Main Stats */}
            <div className="px-3 py-2.5 space-y-2">
                {/* Active Now */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                        <Users className="w-3 h-3 text-cyan-400" />
                        <span className="text-slate-300">접속 중</span>
                    </div>
                    <span className="font-black text-[16px] text-white tabular-nums">{stats.active.total}</span>
                </div>

                {/* Members / Guests */}
                <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                        <UserCheck className="w-2.5 h-2.5 text-emerald-400" />
                        <span className="text-emerald-400 font-bold">{stats.active.members}</span>
                        <span className="text-[10px] text-slate-400">회원</span>
                    </div>
                    <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-500/10 border border-slate-500/20">
                        <UserX className="w-2.5 h-2.5 text-slate-400" />
                        <span className="text-slate-300 font-bold">{stats.active.guests}</span>
                        <span className="text-[10px] text-slate-400">비회원</span>
                    </div>
                </div>

                {/* Today Total */}
                <div className="flex items-center justify-between px-2 py-1 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                    <span className="text-slate-400">오늘 총 방문</span>
                    <span className="font-bold text-amber-400 tabular-nums">{stats.today.totalVisitors}</span>
                </div>

                {/* Tier Breakdown */}
                {Object.keys(stats.active.tierBreakdown).length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                        {Object.entries(stats.active.tierBreakdown).map(([t, count]) => (
                            <span key={t} className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                                t === 'elite' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                                t === 'pro' ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400' :
                                'bg-slate-500/10 border-slate-500/20 text-slate-400'
                            }`}>
                                {t.toUpperCase()} {count}
                            </span>
                        ))}
                    </div>
                )}
            </div>

            {/* Expanded Detail */}
            {expanded && (
                <div className="px-3 pb-2.5 space-y-2 border-t border-white/[0.06] pt-2">
                    {/* Page breakdown */}
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">페이지별 접속</div>
                    <div className="space-y-1 max-h-[120px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                        {Object.entries(stats.pages)
                            .sort(([, a], [, b]) => b - a)
                            .map(([page, count]) => {
                                // 페이지 경로 축약
                                const short = page.replace(/^\/(en|ko|ja)\//, '/').replace(/\?.*$/, '') || '/';
                                return (
                                    <div key={page} className="flex items-center justify-between">
                                        <span className="text-slate-300 truncate max-w-[140px]">{short}</span>
                                        <span className="text-white font-bold tabular-nums">{count}</span>
                                    </div>
                                );
                            })}
                    </div>

                    {/* Member details */}
                    {stats.details.length > 0 && (
                        <>
                            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold mt-1">회원 상세</div>
                            <div className="space-y-1 max-h-[80px] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
                                {stats.details.map((d, i) => (
                                    <div key={i} className="flex items-center justify-between text-[10px]">
                                        <span className="text-slate-300 truncate max-w-[100px]">{d.userId?.slice(0, 8)}...</span>
                                        <span className={`font-bold ${
                                            d.tier === 'elite' ? 'text-amber-400' :
                                            d.tier === 'pro' ? 'text-cyan-400' : 'text-slate-400'
                                        }`}>{d.tier.toUpperCase()}</span>
                                        <span className="text-slate-500 truncate max-w-[60px]">{d.page.replace(/^\/(en|ko|ja)\//, '/')}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
