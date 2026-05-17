'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft, Sparkles, Search, Newspaper, Copy, Check,
  RefreshCw, FileText, Loader2, ChevronDown, ImageIcon
} from 'lucide-react';

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
const TICKERS = ['NVDA','TSLA','AAPL','MSFT','GOOGL','AMZN','META','AMD','PLTR','COIN','SMCI','ARM','MSTR','TSM','AVGO','NFLX','CRM','SNOW','BA','DIS'];

// ── Copy Button ──
function CopyBtn({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all
        ${copied ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white'}`}>
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? '복사됨!' : label}
    </button>
  );
}

// ── Image Guide Card ──
function ImageGuide({ guide }: { guide: any }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-indigo-500/5 border border-indigo-500/15">
      <ImageIcon className="w-4 h-4 text-indigo-400 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-bold text-indigo-300">📸 {guide.slot}. {guide.label}</div>
        <div className="text-[11px] text-slate-400 mt-0.5">{guide.area}</div>
        {guide.url && <div className="text-[11px] text-cyan-400/70 mt-0.5 truncate">signumhq.com{guide.url}</div>}
      </div>
    </div>
  );
}

// ── Post Card ──
function PostCard({ post, platform }: { post: any; platform: 'naver' | 'tistory' }) {
  const d = post[platform];
  if (!d) return null;

  // Split body by image markers for display
  const parts = d.body.split(/(\[📸[^\]]*\])/g);

  return (
    <div className="bg-gradient-to-br from-white/[0.03] to-white/[0.01] border border-white/[0.06] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.04] flex items-center justify-between bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider
            ${post.type === 'analysis' ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/25' : 'bg-amber-500/15 text-amber-400 border border-amber-500/25'}`}>
            {post.type === 'analysis' ? '종목' : '시황'}
          </span>
          {post.ticker && <span className="text-[13px] font-mono font-bold text-white">{post.ticker}</span>}
          <span className={`text-[11px] font-bold uppercase tracking-wider ${platform === 'naver' ? 'text-emerald-400' : 'text-orange-400'}`}>
            {platform === 'naver' ? 'NAVER' : 'TISTORY'}
          </span>
        </div>
      </div>

      {/* Title */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-[15px] font-bold text-white leading-snug flex-1">{d.title}</h3>
          <CopyBtn text={d.title} label="제목" />
        </div>
      </div>

      {/* Body */}
      <div className="px-4 pb-2">
        <div className="bg-black/20 rounded-lg p-3 max-h-[400px] overflow-y-auto scrollbar-thin">
          {parts.map((part: string, i: number) => {
            if (part.match(/^\[📸/)) {
              return (
                <div key={i} className="my-2 px-3 py-2 rounded bg-indigo-500/10 border border-indigo-500/20 text-[12px] text-indigo-300 font-bold">
                  {part}
                </div>
              );
            }
            return <div key={i} className="text-[13px] text-slate-300 leading-relaxed whitespace-pre-wrap">{part}</div>;
          })}
        </div>
        <div className="mt-2 flex gap-2">
          <CopyBtn text={d.body} label="본문 복사" />
        </div>
      </div>

      {/* Tags */}
      <div className="px-4 pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[12px] text-cyan-400/80 truncate flex-1">{d.tags}</div>
          <CopyBtn text={d.tags} label="태그" />
        </div>
      </div>

      {/* Image Guide */}
      {post.imageGuide && post.imageGuide.length > 0 && (
        <div className="px-4 pb-3 space-y-1.5">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">이미지 가이드</div>
          {post.imageGuide.map((g: any, i: number) => <ImageGuide key={i} guide={g} />)}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════
export default function ContentCenterPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adminEmail, setAdminEmail] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genMode, setGenMode] = useState<'auto' | 'ticker' | 'market'>('auto');
  const [selectedTicker, setSelectedTicker] = useState('NVDA');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const router = useRouter();

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
      } catch { router.replace('/'); }
      setLoading(false);
    };
    check();
  }, [router]);

  const generate = useCallback(async () => {
    if (!adminEmail) return;
    setGenerating(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/admin/content-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: adminEmail,
          mode: genMode,
          ticker: genMode === 'ticker' ? selectedTicker : undefined,
          platform: 'naver',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Generation failed');
      setResult(json);
    } catch (err: any) {
      setError(err.message);
    }
    setGenerating(false);
  }, [adminEmail, genMode, selectedTicker]);

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
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="text-slate-300 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <FileText className="w-5 h-5 text-cyan-400" />
            <div>
              <h1 className="text-[16px] font-black tracking-wide">CONTENT COMMAND CENTER</h1>
              <div className="text-[11px] text-slate-400">블로그 콘텐츠 반자동화 — 네이버 · 티스토리</div>
            </div>
          </div>
          {result && (
            <div className="text-[11px] text-slate-400">
              {result.model} · {result.elapsedMs}ms
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="max-w-6xl mx-auto px-4 py-5">
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {/* Mode buttons */}
          <button onClick={() => setGenMode('auto')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all border
              ${genMode === 'auto' ? 'bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 text-cyan-400 border-cyan-500/30 shadow-lg shadow-cyan-500/10' : 'bg-white/[0.03] text-slate-300 border-white/[0.06] hover:bg-white/[0.06]'}`}>
            <Sparkles className="w-4 h-4" />
            🎲 자동 생성
          </button>

          <button onClick={() => setGenMode('ticker')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all border
              ${genMode === 'ticker' ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-400 border-purple-500/30 shadow-lg shadow-purple-500/10' : 'bg-white/[0.03] text-slate-300 border-white/[0.06] hover:bg-white/[0.06]'}`}>
            <Search className="w-4 h-4" />
            🔍 종목 지정
          </button>

          <button onClick={() => setGenMode('market')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all border
              ${genMode === 'market' ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-400 border-amber-500/30 shadow-lg shadow-amber-500/10' : 'bg-white/[0.03] text-slate-300 border-white/[0.06] hover:bg-white/[0.06]'}`}>
            <Newspaper className="w-4 h-4" />
            📰 시황/이슈
          </button>

          {/* Ticker Dropdown (only in ticker mode) */}
          {genMode === 'ticker' && (
            <div className="relative">
              <button onClick={() => setShowDropdown(!showDropdown)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.08] transition-all">
                <span className="text-white font-mono">{selectedTicker}</span>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>
              {showDropdown && (
                <div className="absolute top-full mt-1 left-0 z-50 bg-[#0d1424] border border-white/[0.1] rounded-xl shadow-2xl p-2 grid grid-cols-4 gap-1 w-[320px]">
                  {TICKERS.map(t => (
                    <button key={t} onClick={() => { setSelectedTicker(t); setShowDropdown(false); }}
                      className={`px-3 py-1.5 rounded-lg text-[12px] font-mono font-bold transition-all
                        ${t === selectedTicker ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' : 'text-slate-300 hover:bg-white/[0.05] hover:text-white'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Generate button */}
          <button onClick={generate} disabled={generating}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-[14px] font-black bg-gradient-to-r from-cyan-500 to-emerald-500 text-white
              hover:from-cyan-400 hover:to-emerald-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {generating ? '생성 중...' : '생성하기'}
          </button>
        </div>

        {/* Mode description */}
        <div className="mb-6 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.04] text-[12px] text-slate-400">
          {genMode === 'auto' && '🎲 AI가 오늘 가장 이슈되는 종목 2개를 자동 선별 + 시황 1개 = 총 3개 블로그 글을 생성합니다. 이전 발행 이력과 중복되지 않습니다.'}
          {genMode === 'ticker' && `🔍 ${selectedTicker} 종목에 대한 분석 블로그 글 1개를 생성합니다. GEX, 다크풀, Smart Flow 등 실시간 데이터 기반.`}
          {genMode === 'market' && '📰 오늘의 시장 이슈/시황 기반 블로그 글 1개를 생성합니다. 관심사 높은 주제를 AI가 선정합니다.'}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-[13px] text-red-400 font-bold">
            ❌ {error}
          </div>
        )}

        {/* Results */}
        {result?.content?.posts && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-[12px] text-slate-400">
              <span>✅ {result.content.posts.length}개 생성 완료</span>
              <span>·</span>
              <span>종목: {result.tickers?.join(', ') || '시황'}</span>
            </div>

            {result.content.posts.map((post: any, idx: number) => (
              <div key={idx} className="space-y-3">
                <div className="text-[13px] font-bold text-white flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-400 text-[12px] font-black">
                    {idx + 1}
                  </span>
                  {post.ticker ? `${post.ticker} 분석` : '시황/이슈'}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <PostCard post={post} platform="naver" />
                  <PostCard post={post} platform="tistory" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!result && !generating && !error && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <FileText className="w-12 h-12 opacity-20 mb-4" />
            <div className="text-[14px] font-bold">모드를 선택하고 "생성하기"를 클릭하세요</div>
            <div className="text-[12px] mt-1">AI가 Redis 실시간 데이터 기반으로 블로그 글을 자동 생성합니다</div>
          </div>
        )}

        {/* Generating state */}
        {generating && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="relative">
              <div className="w-16 h-16 border-2 border-cyan-500/30 rounded-full animate-spin border-t-cyan-400" />
              <Sparkles className="w-6 h-6 text-cyan-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
            </div>
            <div className="text-[14px] font-bold text-white mt-4">AI가 콘텐츠를 생성하고 있습니다...</div>
            <div className="text-[12px] text-slate-400 mt-1">Redis 데이터 분석 → Claude Haiku → 포맷팅</div>
          </div>
        )}
      </div>
    </div>
  );
}
