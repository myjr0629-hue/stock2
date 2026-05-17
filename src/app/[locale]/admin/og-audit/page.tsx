'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Eye, ExternalLink, RefreshCw } from 'lucide-react';

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

// ─── All OG Templates ───
const OG_GROUPS = [
  {
    label: '🐦 TWEET / OG',
    sublabel: '1200 × 628',
    color: 'emerald',
    borderColor: 'border-emerald-500/25',
    bgColor: 'bg-emerald-500/5',
    hoverColor: 'hover:border-emerald-400/50 hover:shadow-emerald-500/15',
    labelColor: 'text-emerald-400',
    ratio: '52.33%',
    scale: 0.25,
    cols: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    items: [
      { name: 'Morning', path: '/templates/og/morning' },
      { name: 'Market Close', path: '/templates/og/market-close' },
      { name: 'Pulse', path: '/templates/og/pulse' },
      { name: 'Education', path: '/templates/og/education' },
      { name: 'Spotlight', path: '/templates/og/spotlight' },
      { name: 'SpaceX IPO', path: '/templates/og/spacex-ipo' },
      { name: 'Event', path: '/templates/og/event' },
    ],
  },
  {
    label: '📱 STORY / IG',
    sublabel: '1080 × 1920',
    color: 'purple',
    borderColor: 'border-purple-500/25',
    bgColor: 'bg-purple-500/5',
    hoverColor: 'hover:border-purple-400/50 hover:shadow-purple-500/15',
    labelColor: 'text-purple-400',
    ratio: '177.78%',
    scale: 0.14,
    cols: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
    items: [
      { name: 'Morning IG', path: '/templates/og/morning-ig' },
      { name: 'Market Close IG', path: '/templates/og/market-close-ig' },
    ],
  },
  {
    label: '📌 PINTEREST PIN',
    sublabel: '1000 × 1500',
    color: 'pink',
    borderColor: 'border-pink-500/25',
    bgColor: 'bg-pink-500/5',
    hoverColor: 'hover:border-pink-400/50 hover:shadow-pink-500/15',
    labelColor: 'text-pink-400',
    ratio: '150%',
    scale: 0.15,
    cols: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
    items: [
      { name: 'Morning Pin', path: '/templates/og/morning-pin' },
      { name: 'Market Close Pin', path: '/templates/og/market-close-pin' },
      { name: 'Pulse Pin', path: '/templates/og/pulse-pin' },
      { name: 'Education Pin', path: '/templates/og/education-pin' },
      { name: 'SpaceX IPO Pin', path: '/templates/og/spacex-ipo?format=pin' },
    ],
  },
  {
    label: '🎠 IG CAROUSEL',
    sublabel: '1080 × 1080',
    color: 'amber',
    borderColor: 'border-amber-500/25',
    bgColor: 'bg-amber-500/5',
    hoverColor: 'hover:border-amber-400/50 hover:shadow-amber-500/15',
    labelColor: 'text-amber-400',
    ratio: '100%',
    scale: 0.2,
    cols: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
    items: [
      { name: 'Market Carousel', path: '/templates/og/carousel' },
      { name: 'Education Carousel', path: '/templates/og/education-carousel' },
    ],
  },
];

const TOTAL_TEMPLATES = OG_GROUPS.reduce((sum, g) => sum + g.items.length, 0);

export default function OGAuditPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const check = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) {
          setIsAdmin(true);
        } else {
          router.replace('/');
        }
      } catch { router.replace('/'); }
      setLoading(false);
    };
    check();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#060a13] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-[#060a13] text-white" style={{ fontFamily: '"Plus Jakarta Sans", "Inter", system-ui' }}>
      {/* Header */}
      <div className="border-b border-white/[0.06] bg-gradient-to-r from-[#0d1424]/80 to-[#060a13]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="text-slate-300 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Eye className="w-5 h-5 text-pink-400" />
            <div>
              <h1 className="text-[18px] font-black tracking-wide">OG IMAGE AUDIT</h1>
              <div className="text-[13px] text-slate-400">
                전체 {TOTAL_TEMPLATES}개 템플릿 · 실시간 미리보기
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Quick filter badges */}
            {OG_GROUPS.map(g => (
              <a key={g.label} href={`#group-${g.color}`}
                className={`hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold ${g.bgColor} ${g.borderColor} border ${g.labelColor}`}>
                {g.label.split(' ')[0]} <span className="opacity-60">{g.items.length}</span>
              </a>
            ))}
            <button onClick={() => setRefreshKey(k => k + 1)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pink-500/10 border border-pink-500/20 text-pink-400 text-[13px] font-bold hover:bg-pink-500/20 transition-all">
              <RefreshCw className="w-3.5 h-3.5" /> 새로고침
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">
        {OG_GROUPS.map(group => (
          <div key={group.label} id={`group-${group.color}`} className="scroll-mt-20">
            {/* Group Header */}
            <div className="flex items-center gap-3 mb-4">
              <span className={`text-[15px] font-black ${group.labelColor} tracking-wide`}>
                {group.label}
              </span>
              <span className="text-[13px] text-slate-500 font-mono">{group.sublabel}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-md font-bold ${group.bgColor} ${group.borderColor} border ${group.labelColor}`}>
                {group.items.length}개
              </span>
              <div className="flex-1 border-t border-white/[0.04]" />
            </div>

            {/* Thumbnails Grid */}
            <div className={`grid ${group.cols} gap-4`}>
              {group.items.map(item => {
                const scalePercent = Math.round(1 / group.scale * 100);
                return (
                  <div key={item.name}
                    className={`rounded-2xl border ${group.borderColor} bg-black/40 overflow-hidden ${group.hoverColor} hover:shadow-xl transition-all group`}>
                    {/* Thumbnail iframe */}
                    <div className="relative w-full overflow-hidden" style={{ paddingBottom: group.ratio }}>
                      <iframe
                        key={refreshKey}
                        src={item.path}
                        className="absolute top-0 left-0 pointer-events-none border-0"
                        style={{
                          transform: `scale(${group.scale})`,
                          transformOrigin: 'top left',
                          width: `${scalePercent}%`,
                          height: `${scalePercent}%`,
                        }}
                        loading="lazy"
                        tabIndex={-1}
                      />
                    </div>
                    {/* Label */}
                    <div className="px-3 py-2.5 bg-white/[0.02] border-t border-white/[0.04] flex items-center justify-between">
                      <div>
                        <div className={`text-[13px] font-bold ${group.labelColor} group-hover:brightness-125`}>
                          {item.name}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">{group.sublabel}</div>
                      </div>
                      <a href={item.path} target="_blank" rel="noopener"
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/[0.05] border border-white/[0.08] text-[11px] font-bold text-slate-300 hover:text-white hover:bg-white/[0.1] transition-all"
                        onClick={e => e.stopPropagation()}>
                        <ExternalLink className="w-3 h-3" /> 원본
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Footer */}
        <div className="text-center py-4 text-[13px] text-slate-500">
          총 {TOTAL_TEMPLATES}개 OG 이미지 템플릿 · signumhq.com
        </div>
      </div>
    </div>
  );
}
