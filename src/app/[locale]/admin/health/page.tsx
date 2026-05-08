'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import {
  Activity, Server, Database, FileText, Layout,
  RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Clock, Zap, Shield, ChevronDown, ChevronRight,
  ArrowLeft, Wifi, BarChart3, Globe, Users, CalendarDays, GitCompareArrows, TrendingUp
} from 'lucide-react';

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

// ── Status Badge ──
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; border: string; text: string; icon: any; label: string }> = {
    HEALTHY: { bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', text: 'text-emerald-400', icon: CheckCircle2, label: 'HEALTHY' },
    RUNNING: { bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', text: 'text-emerald-400', icon: CheckCircle2, label: 'RUNNING' },
    OK: { bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', text: 'text-emerald-400', icon: CheckCircle2, label: 'OK' },
    FRESH: { bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', text: 'text-emerald-400', icon: CheckCircle2, label: 'FRESH' },
    DEGRADED: { bg: 'bg-amber-500/15', border: 'border-amber-500/30', text: 'text-amber-400', icon: AlertTriangle, label: 'DEGRADED' },
    PARTIAL: { bg: 'bg-amber-500/15', border: 'border-amber-500/30', text: 'text-amber-400', icon: AlertTriangle, label: 'PARTIAL' },
    STALE: { bg: 'bg-amber-500/15', border: 'border-amber-500/30', text: 'text-amber-400', icon: Clock, label: 'STALE' },
    DOWN: { bg: 'bg-red-500/15', border: 'border-red-500/30', text: 'text-red-400', icon: XCircle, label: 'DOWN' },
    EMPTY: { bg: 'bg-red-500/15', border: 'border-red-500/30', text: 'text-red-400', icon: XCircle, label: 'EMPTY' },
    IDLE: { bg: 'bg-slate-500/15', border: 'border-slate-500/30', text: 'text-slate-300', icon: Clock, label: 'IDLE' },
    SCHEDULED_IDLE: { bg: 'bg-blue-500/15', border: 'border-blue-500/30', text: 'text-blue-300', icon: Clock, label: '예약 대기' },
    PENDING: { bg: 'bg-slate-500/15', border: 'border-slate-500/30', text: 'text-slate-300', icon: Clock, label: 'PENDING' },
    MISSING: { bg: 'bg-red-500/15', border: 'border-red-500/30', text: 'text-red-400', icon: XCircle, label: 'MISSING' },
  };
  const c = config[status] || config.DEGRADED;
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[13px] font-bold ${c.bg} border ${c.border} ${c.text}`}>
      <Icon className="w-3.5 h-3.5" />
      {c.label}
    </span>
  );
}

// ── Hit Rate Bar ──
function HitRateBar({ rate, count, total, label }: { rate: number; count: number; total: number; label: string }) {
  const color = rate >= 80 ? '#10b981' : rate >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[13px]">
        <span className="text-slate-300">{label}</span>
        <span className="font-bold tabular-nums" style={{ color }}>{count}/{total} <span className="text-slate-400">({rate}%)</span></span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${rate}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// ── Cache Detail Table ──
function CacheDetailTable({ results, isActive }: { results: any[]; isActive?: boolean }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-2">
      {results.map((r: any) => (
        <div key={r.ticker} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[13px]
          ${r.exists ? 'bg-emerald-500/8 border border-emerald-500/15' :
            isActive ? 'bg-slate-500/8 border border-slate-500/15' : 'bg-red-500/8 border border-red-500/15'}`}>
          {r.exists
            ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            : isActive
              ? <Clock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              : <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
          <span className={`font-mono font-bold ${r.exists ? 'text-emerald-300' : isActive ? 'text-slate-400' : 'text-red-300'}`}>{r.ticker}</span>
          {r.exists && r.age !== undefined && (
            <span className="text-slate-300 ml-auto tabular-nums">{r.age < 60 ? r.age + 's' : Math.round(r.age / 60) + 'm'}</span>
          )}
          {!r.exists && isActive && <span className="text-slate-500 ml-auto text-[13px]">대기</span>}
        </div>
      ))}
    </div>
  );
}

// ── Collapsible Section ──
function Section({ title, icon: Icon, status, children, defaultOpen = false, id }: {
  title: string; icon: any; status?: string; children: React.ReactNode; defaultOpen?: boolean; id?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div id={id} className="bg-gradient-to-br from-white/[0.03] to-white/[0.01] border border-white/[0.06] rounded-xl overflow-hidden scroll-mt-28">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-white/[0.02] transition-colors">
        <Icon className="w-5 h-5 text-cyan-400 flex-shrink-0" />
        <span className="font-bold text-white text-[14px] tracking-wide">{title}</span>
        {status && <StatusBadge status={status} />}
        <div className="ml-auto">
          {open ? <ChevronDown className="w-4 h-4 text-slate-300" /> : <ChevronRight className="w-4 h-4 text-slate-300" />}
        </div>
      </button>
      {open && <div className="px-5 pb-5 space-y-3 border-t border-white/[0.04] pt-3">{children}</div>}
    </div>
  );
}

// ── Content Item ──
function ContentItem({ label, exists, date, extra }: { label: string; exists: boolean; date?: string; extra?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-slate-300 text-[13px]">{label}</span>
      <div className="flex items-center gap-2">
        {exists ? (
          <>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            {date && <span className="text-[13px] text-slate-300 tabular-nums">{date}</span>}
            {extra && <span className="text-[13px] text-cyan-400">{extra}</span>}
          </>
        ) : (
          <><XCircle className="w-3.5 h-3.5 text-red-400" /><span className="text-[13px] text-red-400">MISSING</span></>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════
export default function AdminHealthPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const router = useRouter();

  // Auth check
  useEffect(() => {
    const check = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) {
          setIsAdmin(true);
          setAdminEmail(user.email);
        } else {
          router.replace('/');
        }
      } catch {
        router.replace('/');
      }
      setLoading(false);
    };
    check();
  }, [router]);

  // Fetch health data
  const fetchHealth = useCallback(async () => {
    if (!adminEmail) return;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/admin/health-check?email=${encodeURIComponent(adminEmail)}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
        setLastRefresh(new Date());
      }
    } catch { }
    setRefreshing(false);
  }, [adminEmail]);

  useEffect(() => {
    if (isAdmin && adminEmail) fetchHealth();
  }, [isAdmin, adminEmail, fetchHealth]);

  // Auto-refresh every 30s
  const [countdown, setCountdown] = useState(30);
  useEffect(() => {
    if (!isAdmin || !adminEmail) return;
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          fetchHealth();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isAdmin, adminEmail, fetchHealth]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#060a13] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAdmin) return null;

  // ET time
  const now = new Date();
  const etTime = now.toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const etHour = parseInt(etTime.split(':')[0]);
  const isMarketHours = etHour >= 9 && etHour < 16;
  const isExtendedHours = (etHour >= 4 && etHour < 9) || (etHour >= 16 && etHour < 20);

  // 상태 판정 — API가 operationalStatus / dataStatus 분리해서 제공
  const flowOp = data?.lambda?.signumFlowHarvest?.operationalStatus || 'IDLE';
  const flowData = data?.lambda?.signumFlowHarvest?.dataStatus || 'EMPTY';
  const probeHitRate = data?.cache?.snapshotProbe?.hitRate || 0;
  const flowHitRate = data?.cache?.flowUnified?.hitRate || 0;

  const harvestOp = data?.lambda?.signumHarvest?.operationalStatus || 'DOWN';
  const harvestData = data?.lambda?.signumHarvest?.dataStatus || 'EMPTY';
  const lambdaPipelineStatus = harvestOp === 'RUNNING' && flowOp !== 'DOWN' ? 'RUNNING' : flowOp === 'SCHEDULED_IDLE' && harvestOp === 'RUNNING' ? 'RUNNING' : 'DEGRADED';

  return (
    <div className="min-h-screen bg-[#060a13] text-white" style={{ fontFamily: '"Plus Jakarta Sans", "Inter", system-ui' }}>
      {/* Header */}
      <div className="border-b border-white/[0.06] bg-gradient-to-r from-[#0d1424]/80 to-[#060a13]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="text-slate-300 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Shield className="w-5 h-5 text-cyan-400" />
            <div>
              <h1 className="text-[16px] font-black tracking-wide">SYSTEM HEALTH</h1>
              <p className="text-[13px] text-slate-300 tracking-wide">Admin Control Center</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Market Status */}
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] font-bold border
              ${isMarketHours ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                isExtendedHours ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                  'bg-slate-500/10 border-slate-500/20 text-slate-300'}`}>
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75
                  ${isMarketHours ? 'bg-emerald-400' : isExtendedHours ? 'bg-amber-400' : 'bg-slate-400'}`} />
                <span className={`relative inline-flex rounded-full h-2 w-2
                  ${isMarketHours ? 'bg-emerald-500' : isExtendedHours ? 'bg-amber-500' : 'bg-slate-500'}`} />
              </span>
              ET {etTime} · {isMarketHours ? 'MARKET OPEN' : isExtendedHours ? 'EXTENDED' : 'CLOSED'}
            </div>

            {/* Refresh */}
            <button onClick={fetchHealth} disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20
                hover:bg-cyan-500/20 text-cyan-400 text-[13px] font-bold transition-all disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              REFRESH
            </button>
            <span className="text-[11px] text-slate-500 font-mono tabular-nums">{countdown}s</span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      {data && (
        <div className="border-b border-white/[0.06] bg-[#060a13]/95 backdrop-blur-md sticky top-[56px] z-40">
          <div className="max-w-5xl mx-auto px-4 flex flex-wrap gap-1 py-1.5">
            {[
              { id: 'sec-calendar', label: 'Calendar', icon: CalendarDays },
              { id: 'sec-users', label: 'Users', icon: Users },
              { id: 'sec-integrity', label: 'Integrity', icon: GitCompareArrows },
              { id: 'sec-alpha', label: 'Alpha History', icon: TrendingUp },
              { id: 'sec-lambda', label: 'Lambda', icon: Server },
              { id: 'sec-ec2', label: 'EC2', icon: Wifi },
              { id: 'sec-feed', label: 'Market Feed', icon: BarChart3 },
              { id: 'sec-cache', label: 'Cache', icon: Database },
              { id: 'sec-chart', label: 'Chart Cache', icon: Activity },
              { id: 'sec-content', label: 'Content', icon: FileText },
              { id: 'sec-pages', label: 'Pages', icon: Layout },
            ].map(tab => (
              <button key={tab.id}
                onClick={() => {
                  document.getElementById(tab.id)?.scrollIntoView({ behavior: 'smooth' });
                  // 자동으로 열기
                  const section = document.getElementById(tab.id);
                  if (section) {
                    const btn = section.querySelector('button');
                    const content = section.querySelector('[data-content]');
                    if (content?.classList.contains('hidden')) btn?.click();
                  }
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-bold
                  text-slate-300 hover:text-white hover:bg-white/[0.05] transition-all whitespace-nowrap">
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* Overall Status Banner */}
        {data && (
          <div className={`flex items-center justify-between px-5 py-4 rounded-xl border
            ${data.overall === 'HEALTHY'
              ? 'bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 border-emerald-500/20'
              : 'bg-gradient-to-r from-amber-500/10 to-amber-500/5 border-amber-500/20'}`}>
            <div className="flex items-center gap-3">
              <Zap className={`w-6 h-6 ${data.overall === 'HEALTHY' ? 'text-emerald-400' : 'text-amber-400'}`} />
              <div>
                <div className="text-[16px] font-black">{data.overall === 'HEALTHY' ? '시스템 정상' : '일부 점검 필요'}</div>
                <div className="text-[13px] text-slate-300">
                  응답 {data.elapsed} · 최종 새로고침 {lastRefresh?.toLocaleTimeString('ko-KR') || '-'}
                </div>
              </div>
            </div>
            <StatusBadge status={data.overall} />
          </div>
        )}

        {!data ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full" />
          </div>
        ) : (
          <>
            {/* ═══ MARKET CALENDAR ═══ */}
            <div id="sec-calendar" className="scroll-mt-28 bg-gradient-to-br from-white/[0.03] to-white/[0.01] border border-white/[0.06] rounded-xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <CalendarDays className="w-5 h-5 text-cyan-400" />
                <span className="font-bold text-white text-[14px] tracking-wide">MARKET CALENDAR</span>
                <span className={`ml-auto px-3 py-1 rounded-lg text-[13px] font-black border ${data.et.isMarketHours ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' : data.et.isPreMarket ? 'bg-amber-500/15 border-amber-500/30 text-amber-400' : data.et.isPostMarket ? 'bg-blue-500/15 border-blue-500/30 text-blue-300' : 'bg-slate-500/15 border-slate-500/30 text-slate-300'}`}>{data.et.sessionLabel}</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-3 text-center">
                  <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">ET Time</div>
                  <div className="text-[22px] font-mono font-black text-white">{data.et.etTimeFormatted}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{data.et.etDateStr}</div>
                </div>
                <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-3 text-center">
                  <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">Session</div>
                  <div className={`text-[18px] font-black ${data.et.isMarketHours ? 'text-emerald-400' : data.et.isPreMarket ? 'text-amber-400' : 'text-slate-300'}`}>{data.et.session}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][data.et.dayOfWeek]}</div>
                </div>
                <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-3 text-center">
                  <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">Next Open</div>
                  <div className="text-[18px] font-mono font-bold text-cyan-400">{data.et.nextOpenEta || 'NOW'}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">9:30 ET</div>
                </div>
                <div className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-3 text-center">
                  <div className="text-[11px] text-slate-400 uppercase tracking-wider mb-1">Status</div>
                  <div className="flex items-center justify-center gap-1.5">
                    {data.et.isWeekend && <span className="text-[13px] font-bold text-orange-400">🏖️ Weekend</span>}
                    {data.et.isHoliday && <span className="text-[13px] font-bold text-red-400">🎌 Holiday</span>}
                    {!data.et.isWeekend && !data.et.isHoliday && <span className="text-[13px] font-bold text-emerald-400">📈 Trading Day</span>}
                  </div>
                </div>
              </div>
            </div>

            {/* ═══ USERS & SUBSCRIPTIONS ═══ */}
            {data.users && data.users.status !== 'UNAVAILABLE' && (
              <Section title="USERS & SUBSCRIPTIONS" icon={Users} status={data.users.status} defaultOpen={true} id="sec-users">
                {data.users.status === 'ERROR' ? (
                  <div className="text-[13px] text-red-400">{data.users.error}</div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 rounded-xl border border-cyan-500/20 p-4 text-center">
                        <div className="text-[11px] text-cyan-300 uppercase tracking-wider font-bold mb-1">Total Users</div>
                        <div className="text-[28px] font-black text-white">{data.users.totalUsers}</div>
                      </div>
                      <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 rounded-xl border border-emerald-500/20 p-4 text-center">
                        <div className="text-[11px] text-emerald-300 uppercase tracking-wider font-bold mb-1">Active (7d)</div>
                        <div className="text-[28px] font-black text-emerald-400">{data.users.activeUsers7d}</div>
                      </div>
                      <div className="bg-gradient-to-br from-amber-500/10 to-amber-500/5 rounded-xl border border-amber-500/20 p-4 text-center">
                        <div className="text-[11px] text-amber-300 uppercase tracking-wider font-bold mb-1">Paid</div>
                        <div className="text-[28px] font-black text-amber-400">{data.users.paidSubscriptions}</div>
                      </div>
                      <div className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 rounded-xl border border-purple-500/20 p-4 text-center">
                        <div className="text-[11px] text-purple-300 uppercase tracking-wider font-bold mb-1">New (24h)</div>
                        <div className="text-[28px] font-black text-purple-400">{data.users.recentSignups24h}</div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="text-[12px] text-slate-400 uppercase tracking-wider font-bold mb-2">Tier Distribution</div>
                      <div className="flex gap-2">
                        {Object.entries(data.users.tierDistribution || {}).map(([tier, count]: [string, any]) => (
                          <div key={tier} className={`flex-1 rounded-lg border p-2.5 text-center ${
                            tier === 'elite' ? 'bg-amber-500/10 border-amber-500/20' :
                            tier === 'pro' ? 'bg-cyan-500/10 border-cyan-500/20' :
                            'bg-slate-500/10 border-slate-500/20'}`}>
                            <div className="text-[20px] font-black text-white">{count}</div>
                            <div className={`text-[11px] font-bold uppercase ${
                              tier === 'elite' ? 'text-amber-400' : tier === 'pro' ? 'text-cyan-400' : 'text-slate-400'}`}>{tier}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-[12px] text-slate-400">
                      <span>7d signups: <span className="text-white font-bold">{data.users.recentSignups7d}</span></span>
                      <span>Profiles: <span className="text-white font-bold">{data.users.profileCount}</span></span>
                    </div>
                  </>
                )}
              </Section>
            )}

            {/* ═══ DATA INTEGRITY ═══ */}
            {data.dataIntegrity && (
              <Section title="DATA INTEGRITY — Cross-Source Verification" icon={GitCompareArrows}
                status={data.dataIntegrity.status === 'CONSISTENT' ? 'OK' : data.dataIntegrity.status === 'PARTIAL' ? 'DEGRADED' : 'DOWN'}
                defaultOpen={data.dataIntegrity.status !== 'CONSISTENT'} id="sec-integrity">
                <div className="mb-3">
                  <HitRateBar rate={data.dataIntegrity.matchRate} count={data.dataIntegrity.matches} total={data.dataIntegrity.total} label="cache:analysis Field Completeness & Score Health" />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className="text-left py-2 text-slate-400 font-bold">Ticker</th>
                        <th className="text-center py-2 text-slate-400 font-bold">Score</th>
                        <th className="text-center py-2 text-slate-400 font-bold">Engine</th>
                        <th className="text-center py-2 text-slate-400 font-bold">Fields</th>
                        <th className="text-center py-2 text-slate-400 font-bold">Whale/RSI/GEX</th>
                        <th className="text-center py-2 text-slate-400 font-bold">DarkPool</th>
                        <th className="text-center py-2 text-slate-400 font-bold">Command</th>
                        <th className="text-center py-2 text-slate-400 font-bold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.dataIntegrity.results.map((r: any) => (
                        <tr key={r.ticker} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                          <td className="py-2 font-mono font-bold text-white">{r.ticker}</td>
                          <td className="py-2 text-center">
                            <span className="font-mono font-bold text-cyan-400">{r.analysis.score ?? '—'}</span>
                            <span className="text-slate-500 ml-1">{r.analysis.grade || ''}</span>
                          </td>
                          <td className="py-2 text-center text-[11px] text-slate-400">{r.analysis.engine || '—'}</td>
                          <td className="py-2 text-center">
                            <span className={`font-mono font-bold ${r.fieldCompleteness >= 85 ? 'text-emerald-400' : r.fieldCompleteness >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{r.fieldCompleteness}%</span>
                          </td>
                          <td className="py-2 text-center text-[11px] font-mono">
                            <span className={r.analysis.whaleIndex !== null ? 'text-cyan-400' : 'text-red-400'}>{r.analysis.whaleIndex ?? '—'}</span>
                            <span className="text-slate-600 mx-0.5">/</span>
                            <span className={r.analysis.rsi !== null ? 'text-slate-300' : 'text-red-400'}>{r.analysis.rsi ?? '—'}</span>
                            <span className="text-slate-600 mx-0.5">/</span>
                            <span className={r.analysis.gex !== null ? 'text-slate-300' : 'text-red-400'}>{typeof r.analysis.gex === 'number' ? (Math.abs(r.analysis.gex) >= 1e6 ? (r.analysis.gex/1e6).toFixed(0)+'M' : r.analysis.gex) : '—'}</span>
                          </td>
                          <td className="py-2 text-center text-[11px] font-mono">
                            <span className={r.analysis.darkPoolPct ? 'text-emerald-400' : 'text-red-400'}>{r.analysis.darkPoolPct ? r.analysis.darkPoolPct + '%' : '—'}</span>
                            {r.rtMetrics?.darkPoolPct != null && (
                              <span className="text-slate-500 ml-1">({r.rtMetrics.darkPoolPct}%)</span>
                            )}
                          </td>
                          <td className="py-2 text-center text-[11px]">
                            {['hasInst','hasEarnings','hasAnalyst','hasVolatility'].filter(k => r.command[k]).length}/{4}
                          </td>
                          <td className="py-2 text-center">
                            {r.isHealthy ? <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto" /> : <XCircle className="w-4 h-4 text-red-400 mx-auto" />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}

            {/* ═══ LAMBDA PIPELINE ═══ */}
            <Section title="LAMBDA PIPELINE" icon={Server} status={lambdaPipelineStatus} defaultOpen={true} id="sec-lambda">
              {/* signum-harvest */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-bold text-white">signum-harvest</span>
                    <span className="text-[13px] text-slate-300">(Dashboard/Command/Watchlist)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={data.lambda.signumHarvest.operationalStatus} />
                    <StatusBadge status={data.lambda.signumHarvest.dataStatus} />
                  </div>
                </div>
                <div className="text-[13px] text-slate-400">{data.lambda.signumHarvest.schedule}</div>
                <div className="text-[13px] text-cyan-300 bg-cyan-500/5 border border-cyan-500/10 rounded-lg px-3 py-2">
                  {data.lambda.signumHarvest.statusNote}
                </div>
                <div className="text-[13px] text-slate-300">{data.lambda.signumHarvest.evidence}</div>
                <HitRateBar rate={data.cache?.commandUnified?.hitRate || 0} count={data.cache?.commandUnified?.count || 0} total={data.cache?.commandUnified?.total || 20} label="cache:command:unified" />
                <CacheDetailTable results={data.lambda.signumHarvest.details} />
              </div>

              <div className="border-t border-white/[0.04] my-3" />

              {/* signum-flow-harvest */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-bold text-white">signum-flow-harvest</span>
                    <span className="text-[13px] text-slate-300">(Flow 페이지)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={data.lambda.signumFlowHarvest.operationalStatus} />
                    <StatusBadge status={data.lambda.signumFlowHarvest.dataStatus} />
                  </div>
                </div>
                <div className="text-[13px] text-slate-400">{data.lambda.signumFlowHarvest.schedule}</div>
                <div className={`text-[13px] rounded-lg px-3 py-2 border ${
                  flowOp === 'DOWN' ? 'text-red-300 bg-red-500/5 border-red-500/10' :
                  flowOp === 'SCHEDULED_IDLE' ? 'text-blue-300 bg-blue-500/5 border-blue-500/10' :
                  'text-cyan-300 bg-cyan-500/5 border-cyan-500/10'
                }`}>
                  {data.lambda.signumFlowHarvest.statusNote}
                </div>
                <div className="text-[13px] text-slate-300">{data.lambda.signumFlowHarvest.evidence}</div>
                <div className="text-[13px] text-slate-300">{data.lambda.signumFlowHarvest.probeEvidence}</div>
                <div className="flex items-center gap-4 text-[13px]">
                  <span className="text-slate-300">평균 나이: <span className="text-cyan-400 font-bold">{data.lambda.signumFlowHarvest.avgDataAge}</span></span>
                  <span className="text-slate-300">Lock: {data.lambda.signumFlowHarvest.lockActive
                    ? <span className="text-amber-400 font-bold">ACTIVE (실행 중)</span>
                    : <span className="text-slate-300">IDLE</span>}</span>
                </div>
                <HitRateBar rate={data.cache?.flowUnified?.hitRate || 0} count={data.cache?.flowUnified?.count || 0} total={data.cache?.flowUnified?.total || 20} label="cache:flow:unified (TTL 5분)" />
                <HitRateBar rate={data.cache?.snapshotProbe?.hitRate || 0} count={data.cache?.snapshotProbe?.count || 0} total={data.cache?.snapshotProbe?.total || 20} label="polygon:snapshot:probe (TTL 10분)" />
                <CacheDetailTable results={data.lambda.signumFlowHarvest.details} isActive={flowOp === 'RUNNING'} />
              </div>

              {/* signum-fmp */}
              {data.lambda.signumFmp && (
                <>
                  <div className="border-t border-white/[0.04] my-3" />
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-bold text-white">signum-fmp</span>
                        <span className="text-[13px] text-slate-300">(Analyst/Earnings/Fundamentals)</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={data.lambda.signumFmp.operationalStatus} />
                        <StatusBadge status={data.lambda.signumFmp.dataStatus} />
                      </div>
                    </div>
                    <div className="text-[13px] text-slate-400">{data.lambda.signumFmp.schedule}</div>
                    <div className="text-[13px] text-cyan-300 bg-cyan-500/5 border border-cyan-500/10 rounded-lg px-3 py-2">
                      {data.lambda.signumFmp.statusNote}
                    </div>
                    <div className="text-[13px] text-slate-300">{data.lambda.signumFmp.evidence}</div>
                  </div>
                </>
              )}
            </Section>

            {/* ═══ EC2 INFRASTRUCTURE ═══ */}
            {data.ec2 && (
              <Section title="EC2 INFRASTRUCTURE" icon={Wifi} id="sec-ec2"
                status={data.ec2.redisProxy?.status === 'OK' && data.ec2.flowAccumulator?.status !== 'DOWN' ? 'OK' : 'DEGRADED'}>
                <div className="space-y-3">
                  {/* Redis Proxy */}
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[14px] font-bold text-white">Redis Proxy</span>
                      <span className="text-[13px] text-slate-300 ml-2">{data.ec2.redisProxy?.url}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] text-cyan-400 font-bold">{data.ec2.redisProxy?.latency}</span>
                      <StatusBadge status={data.ec2.redisProxy?.status || 'DOWN'} />
                    </div>
                  </div>

                  <div className="border-t border-white/[0.04]" />

                  {/* Flow Accumulator */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-bold text-white">Flow Accumulator</span>
                        <span className="text-[13px] text-slate-300">(signum-flow-acc)</span>
                      </div>
                      <StatusBadge status={data.ec2.flowAccumulator?.status || 'DOWN'} />
                    </div>
                    <div className="text-[13px] text-slate-300">{data.ec2.flowAccumulator?.evidence}</div>
                    <div className="text-[13px] text-slate-400">{data.ec2.flowAccumulator?.note}</div>
                    {data.ec2.flowAccumulator?.details && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-2">
                        {data.ec2.flowAccumulator.details.map((r: any) => (
                          <div key={r.ticker} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[13px]
                            ${r.exists ? 'bg-emerald-500/8 border border-emerald-500/15' : 'bg-red-500/8 border border-red-500/15'}`}>
                            {r.exists ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                            <span className={`font-mono font-bold ${r.exists ? 'text-emerald-300' : 'text-red-300'}`}>{r.ticker}</span>
                            {r.exists && <span className="text-slate-300 ml-auto text-[13px]">{r.source}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Section>
            )}

            {/* ═══ MARKET FEED ═══ */}
            {data.marketFeed && (
              <Section title="MARKET FEED" icon={BarChart3} status={data.marketFeed.status} id="sec-feed">
                <div className="text-[13px] text-slate-400 mb-2">{data.marketFeed.source}</div>
                <HitRateBar rate={Math.round((data.marketFeed.hitCount / data.marketFeed.total) * 100)} count={data.marketFeed.hitCount} total={data.marketFeed.total} label="Market Indicators" />
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                  {data.marketFeed.items?.map((m: any) => (
                    <div key={m.key} className={`px-3 py-2 rounded-lg border ${m.exists ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-red-500/5 border-red-500/10'}`}>
                      <div className="text-[13px] text-slate-300 font-semibold">{m.label}</div>
                      {m.exists ? (
                        <div className="text-[15px] font-bold mt-0.5">
                          <span className="text-white">{typeof m.value === 'number' ? (m.value > 1000 ? m.value.toLocaleString(undefined, {maximumFractionDigits: 0}) : m.value.toFixed(2)) : m.value}</span>
                          {m.changePct != null && (
                            <span className={`text-[13px] ml-1 ${m.changePct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {m.changePct >= 0 ? '+' : ''}{m.changePct}%
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="text-[14px] text-slate-500 mt-0.5">—</div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-4 mt-3">
                  <ContentItem label="Economic Calendar" exists={data.marketFeed.econCalendar?.exists} />
                  <div className="flex items-center gap-2">
                    <span className="text-slate-300 text-[13px]">RLSI:</span>
                    {data.marketFeed.rlsi?.exists ? (
                      <span className="text-cyan-400 font-bold text-[13px]">{data.marketFeed.rlsi.value} ({data.marketFeed.rlsi.regime})</span>
                    ) : (
                      <span className="text-slate-500 text-[13px]">—</span>
                    )}
                  </div>
                </div>
              </Section>
            )}

            {/* ═══ ALPHA HISTORY (DynamoDB) ═══ */}
            {data.alphaHistory && (
              <Section title="ALPHA HISTORY — DynamoDB 저장 무결성" icon={TrendingUp}
                status={data.alphaHistory.status === 'HEALTHY' ? 'OK' : data.alphaHistory.status === 'DEGRADED' ? 'DEGRADED' : 'DOWN'}
                defaultOpen={data.alphaHistory.status !== 'HEALTHY'} id="sec-alpha">
                <div className="text-[13px] text-cyan-300 bg-cyan-500/5 border border-cyan-500/10 rounded-lg px-3 py-2 mb-3">
                  {data.alphaHistory.note}
                </div>
                <div className="text-[12px] text-slate-400 mb-2">{data.alphaHistory.source}</div>
                {/* Today / Yesterday stats */}
                <div className="grid grid-cols-2 gap-3 mb-3">
                  {[data.alphaHistory.today, data.alphaHistory.yesterday].filter(Boolean).map((s: any) => (
                    <div key={s.date} className="bg-white/[0.03] rounded-xl border border-white/[0.06] p-3">
                      <div className="text-[11px] text-slate-400 uppercase tracking-wider font-bold mb-2">{s.date}</div>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <div className="text-[18px] font-black text-white">{s.total}</div>
                          <div className="text-[10px] text-slate-400">총 레코드</div>
                        </div>
                        <div>
                          <div className={`text-[18px] font-black ${s.scoreGt0 > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{s.scoreGt0}</div>
                          <div className="text-[10px] text-slate-400">Score&gt;0</div>
                        </div>
                        <div>
                          <div className={`text-[18px] font-black ${s.scoreEq0 === 0 ? 'text-emerald-400' : 'text-red-400'}`}>{s.scoreEq0}</div>
                          <div className="text-[10px] text-slate-400">Score=0</div>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-2 text-[11px]">
                        <span className="text-slate-400">LIVE: <span className="text-cyan-400 font-bold">{s.liveTier}</span></span>
                        <span className="text-slate-400">SSR: <span className="text-slate-300 font-bold">{s.ssrTier}</span></span>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Sample tickers */}
                {data.alphaHistory.samples?.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px]">
                      <thead>
                        <tr className="border-b border-white/[0.06]">
                          <th className="text-left py-2 text-slate-400 font-bold">Ticker</th>
                          <th className="text-center py-2 text-slate-400 font-bold">Date</th>
                          <th className="text-center py-2 text-slate-400 font-bold">Score</th>
                          <th className="text-center py-2 text-slate-400 font-bold">Tier</th>
                          <th className="text-center py-2 text-slate-400 font-bold">Close</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.alphaHistory.samples.map((s: any) => (
                          <tr key={s.ticker} className="border-b border-white/[0.03]">
                            <td className="py-2 font-mono font-bold text-white">{s.ticker}</td>
                            <td className="py-2 text-center text-slate-300">{s.date}</td>
                            <td className="py-2 text-center"><span className="font-mono font-bold text-cyan-400">{s.score}</span></td>
                            <td className="py-2 text-center text-[11px] text-slate-400">{s.tier}</td>
                            <td className="py-2 text-center font-mono text-slate-300">${s.close?.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>
            )}

            {/* ═══ CACHE STATUS ═══ */}
            <Section title="REDIS / ELASTICACHE" icon={Database} status={(data.cache?.commandUnified?.hitRate || 0) >= 80 ? 'OK' : 'DEGRADED'} id="sec-cache">
              <HitRateBar rate={data.cache?.commandUnified?.hitRate || 0} count={data.cache?.commandUnified?.count || 0} total={data.cache?.commandUnified?.total || 20} label="cache:command:unified" />
              <HitRateBar rate={data.cache?.analysisCache?.hitRate || 0} count={data.cache?.analysisCache?.count || 0} total={data.cache?.analysisCache?.total || 20} label="cache:analysis" />
              <HitRateBar rate={data.cache?.flowUnified?.hitRate || 0} count={data.cache?.flowUnified?.count || 0} total={data.cache?.flowUnified?.total || 20} label="cache:flow:unified" />
              <HitRateBar rate={data.cache?.snapshotProbe?.hitRate || 0} count={data.cache?.snapshotProbe?.count || 0} total={data.cache?.snapshotProbe?.total || 20} label="polygon:snapshot:probe" />
            </Section>

            {/* ═══ CHART CACHE — 1D 실시간성 모니터링 ═══ */}
            {data.chartCache && (
              <Section title="CHART CACHE — 1D 실시간 추적" icon={Activity}
                status={data.chartCache.hitRate >= 60 ? 'OK' : 'DEGRADED'} id="sec-chart">
                <div className="text-[12px] text-slate-400 mb-2">TTL: {data.chartCache.ttlConfig} · Cache-Control: {data.chartCache.cacheControl}</div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {data.chartCache.results?.map((r: any) => (
                    <div key={r.ticker} className={`px-3 py-2.5 rounded-lg border ${
                      r.exists ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-red-500/5 border-red-500/10'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono font-bold text-white text-[13px]">{r.ticker}</span>
                        {r.exists ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                      </div>
                      {r.exists ? (
                        <>
                          <div className="text-[11px] text-slate-400">Age: <span className={`font-mono font-bold ${(r.age || 0) <= 60 ? 'text-emerald-400' : (r.age || 0) <= 300 ? 'text-amber-400' : 'text-red-400'}`}>{r.age != null ? r.age + 's' : '?'}</span></div>
                          <div className="text-[11px] text-slate-400">Session: <span className="text-cyan-400">{r.session}</span></div>
                          <div className="text-[11px] text-slate-400">Points: <span className="text-white">{r.points}</span></div>
                        </>
                      ) : (
                        <div className="text-[11px] text-red-400">캐시 없음</div>
                      )}
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* ═══ CONTENT PIPELINE ═══ */}
            <Section title="CONTENT PIPELINE" icon={FileText} id="sec-content"
              status={data.content?.morningBriefing?.status === 'OK' || data.content?.crossSectorBrief?.exists ? 'OK' : 'DEGRADED'}>
              <div className="text-[13px] text-slate-300 uppercase tracking-wider font-bold mb-1">
                모닝 브리핑 <span className="text-slate-500 normal-case font-normal ml-1">{data.content.morningBriefing?.source}</span>
              </div>
              <ContentItem label="한국어 (ko)" exists={data.content?.morningBriefing?.ko?.exists} date={data.content?.morningBriefing?.ko?.date} />
              <ContentItem label="English (en)" exists={data.content?.morningBriefing?.en?.exists} date={data.content?.morningBriefing?.en?.date} />
              <ContentItem label="日本語 (ja)" exists={data.content?.morningBriefing?.ja?.exists} date={data.content?.morningBriefing?.ja?.date} />
              <ContentItem label="Legacy" exists={data.content?.morningBriefing?.legacy?.exists} date={data.content?.morningBriefing?.legacy?.date} />

              <div className="border-t border-white/[0.04] my-2" />
              <div className="text-[13px] text-slate-300 uppercase tracking-wider font-bold mb-1">
                크로스 섹터 브리프 <span className="text-slate-500 normal-case font-normal ml-1">{data.content.crossSectorBrief?.source}</span>
              </div>
              <ContentItem label={`postmarket:cross-brief-v3`} exists={data.content.crossSectorBrief?.exists} date={data.content.crossSectorBrief?.date} />

              <div className="border-t border-white/[0.04] my-2" />
              <div className="text-[13px] text-slate-300 uppercase tracking-wider font-bold mb-1">
                마케팅 콘텐츠 <span className="text-slate-500 normal-case font-normal ml-1">{data.content.marketing?.source}</span>
              </div>
              <ContentItem label="Morning Brief" exists={data.content.marketing?.morning?.exists} />
              <ContentItem label="Market Pulse" exists={data.content.marketing?.pulse?.exists} />
            </Section>

            {/* ═══ PAGE HEALTH ═══ */}
            <Section title="PAGE INTEGRITY" icon={Layout} id="sec-pages"
              status={Object.values(data.pages || {}).every((p: any) => p.status === 'OK' || p.status === 'PENDING') ? 'OK' : 'DEGRADED'}>
              {Object.entries(data.pages || {}).map(([page, info]: [string, any]) => (
                <div key={page} className="flex items-center justify-between py-2 border-b border-white/[0.03] last:border-0">
                  <div>
                    <span className="text-[14px] font-bold text-white capitalize">{page}</span>
                    <span className="text-[13px] text-slate-300 ml-2">{info.dependency}</span>
                  </div>
                  <StatusBadge status={info.status} />
                </div>
              ))}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
