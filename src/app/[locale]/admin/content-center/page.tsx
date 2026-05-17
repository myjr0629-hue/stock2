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

const PLATFORMS = [
  { key: 'naver', label: '네이버', emoji: '🟢', color: 'emerald', lang: '한국어' },
  { key: 'tistory', label: '티스토리', emoji: '🟠', color: 'orange', lang: '한국어' },
  { key: 'medium', label: 'Medium', emoji: '⚪', color: 'slate', lang: 'English' },
  { key: 'note', label: 'note.com', emoji: '🟣', color: 'purple', lang: '日本語' },
] as const;

type PlatformKey = typeof PLATFORMS[number]['key'];

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
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-bold transition-all
        ${copied ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 hover:text-white'}`}>
      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      {copied ? '복사됨!' : label}
    </button>
  );
}

// ── Topic Button (Medium) ──
function TopicBtn({ topic }: { topic: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(topic);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button onClick={copy}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-bold transition-all
        ${copied
          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
          : 'bg-amber-500/10 text-amber-300 border border-amber-500/25 hover:bg-amber-500/20 hover:text-amber-200'}`}>
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? '복사됨' : topic}
    </button>
  );
}

// ── Content Display ──
function ContentBlock({ data, platform }: { data: any; platform: string }) {
  if (!data) return null;

  const parts = data.body?.split(/(\[IMAGE:[^\]]*\])/g) || [];

  return (
    <div className="space-y-4 mt-4">
      {/* Title */}
      <div>
        <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wider mb-2">제목</div>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-[17px] font-bold text-white leading-snug flex-1">{data.title}</h3>
          <CopyBtn text={data.title} label="복사" />
        </div>
      </div>

      {/* Body */}
      <div>
        <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wider mb-2">본문</div>
        <div className="bg-black/20 rounded-xl p-4 max-h-[600px] overflow-y-auto">
          {(() => {
            let imgCount = 0;
            return parts.map((part: string, i: number) => {
              if (part.match(/^\[IMAGE:/)) {
                imgCount++;
                const desc = part.replace(/^\[IMAGE:\s*/, '').replace(/\]$/, '');
                return (
                  <div key={i} className="my-4 rounded-xl overflow-hidden border-2 border-cyan-500/30 shadow-lg shadow-cyan-500/10">
                    <div className="bg-gradient-to-r from-cyan-500/20 via-indigo-500/15 to-purple-500/10 px-4 py-3 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-cyan-500/30 flex items-center justify-center text-[14px] font-black text-cyan-300 flex-shrink-0">
                        {imgCount}
                      </div>
                      <ImageIcon className="w-5 h-5 text-cyan-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-bold text-cyan-200">📸 이미지 삽입 위치</div>
                        <div className="text-[13px] text-cyan-300/80 mt-0.5">{desc}</div>
                      </div>
                    </div>
                  </div>
                );
              }
              return <div key={i} className="text-[14px] text-slate-200 leading-[1.8] whitespace-pre-wrap">{part}</div>;
            });
          })()}
        </div>
        <div className="mt-3 flex gap-2">
          <CopyBtn text={data.body} label="본문 전체 복사" />
          <CopyBtn text={`${data.title}\n\n${data.body}\n\n${data.tags}`} label="전체 복사 (제목+본문+태그)" />
        </div>
      </div>

      {/* Tags / Topics */}
      <div>
        <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wider mb-2">
          {platform === 'medium' ? 'Topics (최대 5개 · 클릭하면 복사)' : '태그'}
        </div>
        {platform === 'medium' ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {(data.tags || '').replace(/#/g, '').split(/[,\s]+/).filter(Boolean).slice(0, 5).map((topic: string, i: number) => (
                <TopicBtn key={i} topic={topic.trim()} />
              ))}
            </div>
            <div className="text-[11px] text-slate-500">
              Medium 발행 시 오른쪽 &quot;Add a topic&quot; 필드에 하나씩 입력하세요
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="text-[14px] text-cyan-400/90 flex-1">{data.tags}</div>
            <CopyBtn text={data.tags} label="복사" />
          </div>
        )}
      </div>

      {/* Image Guide */}
      {data.imageGuide && data.imageGuide.length > 0 && (
        <div>
          <div className="text-[13px] font-bold text-slate-400 uppercase tracking-wider mb-2">이미지 삽입 가이드</div>
          <div className="space-y-2">
            {data.imageGuide.map((g: any, i: number) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3 rounded-xl bg-indigo-500/5 border border-indigo-500/15">
                <ImageIcon className="w-4 h-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-indigo-300">📸 {g.slot}. {g.label}</div>
                  <div className="text-[13px] text-slate-400 mt-0.5">{g.area}</div>
                  {g.url && <div className="text-[13px] text-cyan-400/70 mt-0.5 truncate">signumhq.com{g.url}</div>}
                </div>
              </div>
            ))}
          </div>
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
  const [genMode, setGenMode] = useState<'auto' | 'ticker' | 'market'>('auto');
  const [selectedTicker, setSelectedTicker] = useState('NVDA');
  const [showDropdown, setShowDropdown] = useState(false);
  const [results, setResults] = useState<Record<string, any>>({});
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [meta, setMeta] = useState<Record<string, any>>({});
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

  const generateForPlatform = useCallback(async (platform: PlatformKey) => {
    if (!adminEmail) return;
    setGenerating(prev => ({ ...prev, [platform]: true }));
    setErrors(prev => ({ ...prev, [platform]: '' }));

    try {
      const res = await fetch('/api/admin/content-gen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: adminEmail,
          mode: genMode,
          ticker: genMode === 'ticker' ? selectedTicker : undefined,
          platform,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Generation failed');
      setResults(prev => ({ ...prev, [platform]: json.content }));
      setMeta(prev => ({ ...prev, [platform]: { model: json.model, ms: json.elapsedMs, tickers: json.tickers } }));
    } catch (err: any) {
      setErrors(prev => ({ ...prev, [platform]: err.message }));
    }
    setGenerating(prev => ({ ...prev, [platform]: false }));
  }, [adminEmail, genMode, selectedTicker]);

  const generateAll = useCallback(async () => {
    // Sequential: one platform at a time to avoid Bedrock throttling
    for (const p of PLATFORMS) {
      await generateForPlatform(p.key);
    }
  }, [generateForPlatform]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#060a13] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!isAdmin) return null;

  const isAnyGenerating = Object.values(generating).some(Boolean);

  return (
    <div className="min-h-screen bg-[#060a13] text-white" style={{ fontFamily: '"Plus Jakarta Sans", "Inter", system-ui' }}>
      {/* Header */}
      <div className="border-b border-white/[0.06] bg-gradient-to-r from-[#0d1424]/80 to-[#060a13]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => router.back()} className="text-slate-300 hover:text-white transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <FileText className="w-5 h-5 text-cyan-400" />
            <div>
              <h1 className="text-[18px] font-black tracking-wide">CONTENT COMMAND CENTER</h1>
              <div className="text-[13px] text-slate-400">플랫폼별 콘텐츠 생성 — 네이버 · 티스토리 · Medium · note.com</div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Mode + Ticker Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <button onClick={() => setGenMode('auto')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-[14px] font-bold transition-all border
              ${genMode === 'auto' ? 'bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 text-cyan-400 border-cyan-500/30' : 'bg-white/[0.03] text-slate-300 border-white/[0.06] hover:bg-white/[0.06]'}`}>
            <Sparkles className="w-4 h-4" /> 🎲 자동 선별
          </button>
          <button onClick={() => setGenMode('ticker')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-[14px] font-bold transition-all border
              ${genMode === 'ticker' ? 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 text-purple-400 border-purple-500/30' : 'bg-white/[0.03] text-slate-300 border-white/[0.06] hover:bg-white/[0.06]'}`}>
            <Search className="w-4 h-4" /> 🔍 종목 지정
          </button>
          <button onClick={() => setGenMode('market')}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-[14px] font-bold transition-all border
              ${genMode === 'market' ? 'bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-400 border-amber-500/30' : 'bg-white/[0.03] text-slate-300 border-white/[0.06] hover:bg-white/[0.06]'}`}>
            <Newspaper className="w-4 h-4" /> 📰 시황/이슈
          </button>

          {genMode === 'ticker' && (
            <div className="relative">
              <button onClick={() => setShowDropdown(!showDropdown)}
                className="flex items-center gap-2 px-5 py-3 rounded-xl text-[14px] font-bold bg-white/[0.05] border border-white/[0.08]">
                <span className="text-white font-mono">{selectedTicker}</span>
                <ChevronDown className="w-4 h-4 text-slate-400" />
              </button>
              {showDropdown && (
                <div className="absolute top-full mt-1 left-0 z-50 bg-[#0d1424] border border-white/[0.1] rounded-xl shadow-2xl p-2 grid grid-cols-4 gap-1 w-[320px]">
                  {TICKERS.map(t => (
                    <button key={t} onClick={() => { setSelectedTicker(t); setShowDropdown(false); }}
                      className={`px-3 py-2 rounded-lg text-[13px] font-mono font-bold transition-all
                        ${t === selectedTicker ? 'bg-purple-500/20 text-purple-400' : 'text-slate-300 hover:bg-white/[0.05]'}`}>
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Platform Generate Buttons */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-8">
          {PLATFORMS.map(p => {
            const isGen = generating[p.key];
            const hasResult = !!results[p.key];
            const colorActive: Record<string, string> = {
              emerald: 'from-emerald-500/20 to-green-500/20 border-emerald-500/40 text-emerald-400',
              orange: 'from-orange-500/20 to-amber-500/20 border-orange-500/40 text-orange-400',
              slate: 'from-slate-400/20 to-gray-400/20 border-slate-400/40 text-slate-200',
              purple: 'from-purple-500/20 to-violet-500/20 border-purple-500/40 text-purple-400',
            };
            return (
              <button key={p.key} onClick={() => generateForPlatform(p.key)} disabled={isGen || isAnyGenerating}
                className={`flex flex-col items-center gap-2 px-4 py-4 rounded-2xl text-[14px] font-bold transition-all border
                  ${hasResult ? `bg-gradient-to-br ${colorActive[p.color]} shadow-lg` : 'bg-white/[0.03] text-slate-300 border-white/[0.06] hover:bg-white/[0.06]'}
                  disabled:opacity-50 disabled:cursor-not-allowed`}>
                {isGen ? <Loader2 className="w-6 h-6 animate-spin" /> : <span className="text-[20px]">{p.emoji}</span>}
                <span>{p.label}</span>
                <span className="text-[11px] opacity-60">{p.lang}</span>
                {hasResult && <Check className="w-4 h-4 text-emerald-400" />}
              </button>
            );
          })}

          {/* Generate All */}
          <button onClick={generateAll} disabled={isAnyGenerating}
            className="flex flex-col items-center gap-2 px-4 py-4 rounded-2xl text-[14px] font-black transition-all border
              bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 text-cyan-400 border-cyan-500/30
              hover:from-cyan-400/30 hover:to-emerald-400/30 disabled:opacity-50 disabled:cursor-not-allowed">
            {isAnyGenerating ? <Loader2 className="w-6 h-6 animate-spin" /> : <RefreshCw className="w-6 h-6" />}
            <span>전체 생성</span>
            <span className="text-[11px] opacity-60">순차 실행</span>
          </button>
        </div>

        {/* Results per platform */}
        {PLATFORMS.map(p => {
          const data = results[p.key];
          const error = errors[p.key];
          const isGen = generating[p.key];
          const m = meta[p.key];

          if (!data && !error && !isGen) return null;

          return (
            <div key={p.key} className="mb-6 bg-gradient-to-br from-white/[0.03] to-white/[0.01] border border-white/[0.06] rounded-2xl overflow-hidden">
              {/* Platform Header */}
              <div className="px-5 py-4 border-b border-white/[0.04] bg-white/[0.02] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-[18px]">{p.emoji}</span>
                  <span className="text-[16px] font-black text-white">{p.label}</span>
                  <span className="text-[13px] text-slate-400">{p.lang}</span>
                  {m?.tickers && <span className="text-[13px] font-mono text-cyan-400">{m.tickers.join(', ')}</span>}
                </div>
                {m && <span className="text-[13px] text-slate-500">{m.model} · {m.ms}ms</span>}
              </div>

              <div className="px-5 py-4">
                {isGen && (
                  <div className="flex items-center gap-3 py-6 justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
                    <span className="text-[14px] text-slate-300">{p.label} 콘텐츠 생성 중...</span>
                  </div>
                )}
                {error && (
                  <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-[14px] text-red-400 font-bold">
                    ❌ {error}
                  </div>
                )}
                {data && <ContentBlock data={data} platform={p.key} />}
              </div>
            </div>
          );
        })}

        {/* Empty state */}
        {Object.keys(results).length === 0 && !isAnyGenerating && Object.keys(errors).length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-slate-500">
            <FileText className="w-14 h-14 opacity-20 mb-5" />
            <div className="text-[16px] font-bold">플랫폼 버튼을 클릭하여 콘텐츠를 생성하세요</div>
            <div className="text-[14px] mt-2">각 플랫폼별로 개별 생성 또는 &quot;전체 생성&quot;으로 순차 실행</div>
          </div>
        )}
      </div>
    </div>
  );
}
