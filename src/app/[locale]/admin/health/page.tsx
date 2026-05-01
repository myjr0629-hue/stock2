'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import {
  Activity, Server, Database, FileText, Layout,
  RefreshCw, CheckCircle2, XCircle, AlertTriangle,
  Clock, Zap, Shield, ChevronDown, ChevronRight,
  ArrowLeft, Wifi, BarChart3, Globe
} from 'lucide-react';

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

// ── Status Badge ──
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; border: string; text: string; icon: any; label: string }> = {
    HEALTHY: { bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', text: 'text-emerald-400', icon: CheckCircle2, label: 'HEALTHY' },
    RUNNING: { bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', text: 'text-emerald-400', icon: CheckCircle2, label: 'RUNNING' },
    OK: { bg: 'bg-emerald-500/15', border: 'border-emerald-500/30', text: 'text-emerald-400', icon: CheckCircle2, label: 'OK' },
    DEGRADED: { bg: 'bg-amber-500/15', border: 'border-amber-500/30', text: 'text-amber-400', icon: AlertTriangle, label: 'DEGRADED' },
    PARTIAL: { bg: 'bg-amber-500/15', border: 'border-amber-500/30', text: 'text-amber-400', icon: AlertTriangle, label: 'PARTIAL' },
    DOWN: { bg: 'bg-red-500/15', border: 'border-red-500/30', text: 'text-red-400', icon: XCircle, label: 'DOWN' },
    IDLE: { bg: 'bg-slate-500/15', border: 'border-slate-500/30', text: 'text-slate-300', icon: Clock, label: 'IDLE' },
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
function CacheDetailTable({ results }: { results: any[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mt-2">
      {results.map((r: any) => (
        <div key={r.ticker} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-[13px]
          ${r.exists ? 'bg-emerald-500/8 border border-emerald-500/15' : 'bg-red-500/8 border border-red-500/15'}`}>
          {r.exists ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" /> : <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
          <span className={`font-mono font-bold ${r.exists ? 'text-emerald-300' : 'text-red-300'}`}>{r.ticker}</span>
          {r.exists && r.age !== undefined && (
            <span className="text-slate-300 ml-auto tabular-nums">{r.age < 60 ? r.age + 's' : Math.round(r.age / 60) + 'm'}</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Collapsible Section ──
function Section({ title, icon: Icon, status, children, defaultOpen = false }: {
  title: string; icon: any; status?: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-gradient-to-br from-white/[0.03] to-white/[0.01] border border-white/[0.06] rounded-xl overflow-hidden">
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

  // 상태 판정 — API가 이미 정확하게 판정하므로 그대로 사용
  const flowStatus = data?.lambda?.signumFlowHarvest?.status || 'IDLE';
  const probeHitRate = data?.cache?.snapshotProbe?.hitRate || 0;
  const flowHitRate = data?.cache?.flowUnified?.hitRate || 0;
  const flowLock = data?.lambda?.signumFlowHarvest?.lockActive;

  const harvestStatus = data?.lambda?.signumHarvest?.status;
  const fmpStatus = data?.lambda?.signumFmp?.status;
  const lambdaPipelineStatus = harvestStatus === 'RUNNING' && flowStatus !== 'DOWN' ? 'RUNNING' : 'DEGRADED';

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
          </div>
        </div>
      </div>

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
            {/* ═══ LAMBDA PIPELINE ═══ */}
            <Section title="LAMBDA PIPELINE" icon={Server} status={lambdaPipelineStatus} defaultOpen={true}>
              {/* signum-harvest */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-bold text-white">signum-harvest</span>
                    <span className="text-[13px] text-slate-300">(Dashboard/Command/Watchlist)</span>
                  </div>
                  <StatusBadge status={data.lambda.signumHarvest.status} />
                </div>
                <div className="text-[13px] text-slate-300">{data.lambda.signumHarvest.evidence}</div>
                <div className="text-[13px] text-slate-300">평균 데이터 나이: <span className="text-cyan-400 font-bold">{data.lambda.signumHarvest.avgDataAge}</span></div>
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
                  <StatusBadge status={flowStatus} />
                </div>
                <div className="text-[13px] text-slate-300">{data.lambda.signumFlowHarvest.evidence}</div>
                <div className="text-[13px] text-slate-300">{data.lambda.signumFlowHarvest.probeEvidence}</div>
                <div className="flex items-center gap-4 text-[13px]">
                  <span className="text-slate-300">평균 나이: <span className="text-cyan-400 font-bold">{data.lambda.signumFlowHarvest.avgDataAge}</span></span>
                  <span className="text-slate-300">Lock: {data.lambda.signumFlowHarvest.lockActive
                    ? <span className="text-amber-400 font-bold">ACTIVE (실행 중)</span>
                    : <span className="text-slate-300">IDLE</span>}</span>
                </div>
                {flowHitRate === 0 && probeHitRate > 0 && (
                  <div className="text-[13px] text-amber-400/80 bg-amber-500/5 border border-amber-500/10 rounded-lg px-3 py-2">
                    💡 flow:unified TTL이 5분이라 MISS가 정상입니다. probe 데이터가 있으면 Lambda는 작동 중입니다.
                  </div>
                )}
                <HitRateBar rate={data.cache?.flowUnified?.hitRate || 0} count={data.cache?.flowUnified?.count || 0} total={data.cache?.flowUnified?.total || 20} label="cache:flow:unified (TTL 5분)" />
                <HitRateBar rate={data.cache?.snapshotProbe?.hitRate || 0} count={data.cache?.snapshotProbe?.count || 0} total={data.cache?.snapshotProbe?.total || 20} label="polygon:snapshot:probe (TTL 10분)" />
                <CacheDetailTable results={data.lambda.signumFlowHarvest.details} />
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
                      <StatusBadge status={data.lambda.signumFmp.status} />
                    </div>
                    <div className="text-[13px] text-slate-300">{data.lambda.signumFmp.evidence}</div>
                    <div className="text-[13px] text-slate-400">{data.lambda.signumFmp.note}</div>
                  </div>
                </>
              )}
            </Section>

            {/* ═══ EC2 INFRASTRUCTURE ═══ */}
            {data.ec2 && (
              <Section title="EC2 INFRASTRUCTURE" icon={Wifi}
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
              <Section title="MARKET FEED" icon={BarChart3} status={data.marketFeed.status}>
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

            {/* ═══ CACHE STATUS ═══ */}
            <Section title="REDIS / ELASTICACHE" icon={Database} status={(data.cache?.commandUnified?.hitRate || 0) >= 80 ? 'OK' : 'DEGRADED'}>
              <HitRateBar rate={data.cache?.commandUnified?.hitRate || 0} count={data.cache?.commandUnified?.count || 0} total={data.cache?.commandUnified?.total || 20} label="cache:command:unified" />
              <HitRateBar rate={data.cache?.analysisCache?.hitRate || 0} count={data.cache?.analysisCache?.count || 0} total={data.cache?.analysisCache?.total || 20} label="cache:analysis" />
              <HitRateBar rate={data.cache?.flowUnified?.hitRate || 0} count={data.cache?.flowUnified?.count || 0} total={data.cache?.flowUnified?.total || 20} label="cache:flow:unified" />
              <HitRateBar rate={data.cache?.snapshotProbe?.hitRate || 0} count={data.cache?.snapshotProbe?.count || 0} total={data.cache?.snapshotProbe?.total || 20} label="polygon:snapshot:probe" />

            </Section>

            {/* ═══ CONTENT PIPELINE ═══ */}
            <Section title="CONTENT PIPELINE" icon={FileText}
              status={data.content.morningBriefing?.status === 'OK' || data.content.crossSectorBrief?.exists ? 'OK' : 'DEGRADED'}>
              <div className="text-[13px] text-slate-300 uppercase tracking-wider font-bold mb-1">
                모닝 브리핑 <span className="text-slate-500 normal-case font-normal ml-1">{data.content.morningBriefing?.source}</span>
              </div>
              <ContentItem label="한국어 (ko)" exists={data.content.morningBriefing?.ko?.exists} date={data.content.morningBriefing?.ko?.date} />
              <ContentItem label="English (en)" exists={data.content.morningBriefing?.en?.exists} date={data.content.morningBriefing?.en?.date} />
              <ContentItem label="Legacy" exists={data.content.morningBriefing?.legacy?.exists} date={data.content.morningBriefing?.legacy?.date} />

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
            <Section title="PAGE INTEGRITY" icon={Layout}
              status={Object.values(data.pages).every((p: any) => p.status === 'OK' || p.status === 'PENDING') ? 'OK' : 'DEGRADED'}>
              {Object.entries(data.pages).map(([page, info]: [string, any]) => (
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
