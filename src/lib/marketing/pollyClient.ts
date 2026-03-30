// ============================================================================
// Amazon Polly TTS Client + BGM Manager
// 3개국어 나레이션 생성 + 시장 분위기 기반 BGM 자동 선택
// Build-only: 실제 Polly 호출은 DRY_RUN에서 건너뜀
// ============================================================================

// ---------------------------------------------------------------------------
// TTS Voice Configuration
// ---------------------------------------------------------------------------
export const POLLY_VOICES = {
  en: { voiceId: 'Matthew', engine: 'neural' as const, langCode: 'en-US' },
  ko: { voiceId: 'Seoyeon', engine: 'neural' as const, langCode: 'ko-KR' },
  ja: { voiceId: 'Takumi',  engine: 'neural' as const, langCode: 'ja-JP' },
} as const;

// ---------------------------------------------------------------------------
// BGM Categories — S3에 미리 업로드된 로열티프리 BGM
// 출처: YouTube Audio Library, Pixabay Music (CC0)
// ---------------------------------------------------------------------------
export interface BgmTrack {
  id: string;
  name: string;
  category: 'calm' | 'tense' | 'alert' | 'neutral';
  s3Key: string;      // S3 object key
  durationSec: number;
  source: string;      // 라이선스 출처
}

// Placeholder tracks — S3에 업로드 후 실제 키로 교체
export const BGM_LIBRARY: BgmTrack[] = [
  { id: 'calm-1',    name: 'Ambient Flow',           category: 'calm',    s3Key: 'bgm/calm-ambient-flow.mp3',      durationSec: 60, source: 'YouTube Audio Library (CC0)' },
  { id: 'calm-2',    name: 'Morning Light',          category: 'calm',    s3Key: 'bgm/calm-morning-light.mp3',     durationSec: 45, source: 'Pixabay Music (Free)' },
  { id: 'neutral-1', name: 'Corporate Drive',        category: 'neutral', s3Key: 'bgm/neutral-corporate-drive.mp3', durationSec: 60, source: 'YouTube Audio Library (CC0)' },
  { id: 'neutral-2', name: 'Data Pulse',             category: 'neutral', s3Key: 'bgm/neutral-data-pulse.mp3',     durationSec: 45, source: 'YouTube Audio Library (CC0)' },
  { id: 'tense-1',   name: 'Rising Tension',         category: 'tense',   s3Key: 'bgm/tense-rising-tension.mp3',   durationSec: 60, source: 'Pixabay Music (Free)' },
  { id: 'tense-2',   name: 'Market Volatility',      category: 'tense',   s3Key: 'bgm/tense-market-volatility.mp3', durationSec: 45, source: 'YouTube Audio Library (CC0)' },
  { id: 'alert-1',   name: 'Breaking News Sting',    category: 'alert',   s3Key: 'bgm/alert-breaking-news.mp3',    durationSec: 30, source: 'YouTube Audio Library (CC0)' },
  { id: 'alert-2',   name: 'Urgent Notification',    category: 'alert',   s3Key: 'bgm/alert-urgent-notification.mp3', durationSec: 20, source: 'Pixabay Music (Free)' },
];

// ---------------------------------------------------------------------------
// BGM Auto-Selection (시장 분위기 기반)
// ---------------------------------------------------------------------------
export function selectBgm(opts: {
  gexRegime: string;
  videoType: 'pulse' | 'news' | 'event';
  vix?: number;
}): BgmTrack {
  const { gexRegime, videoType, vix } = opts;

  // Event Spike → always alert
  if (videoType === 'event') {
    return pickRandom(BGM_LIBRARY.filter(t => t.category === 'alert'));
  }

  // High VIX → tense
  if (vix && vix > 25) {
    return pickRandom(BGM_LIBRARY.filter(t => t.category === 'tense'));
  }

  // GEX Negative → tense
  if (gexRegime.toLowerCase() === 'negative') {
    return pickRandom(BGM_LIBRARY.filter(t => t.category === 'tense'));
  }

  // GEX Positive → calm
  if (gexRegime.toLowerCase() === 'positive') {
    return pickRandom(BGM_LIBRARY.filter(t => t.category === 'calm'));
  }

  // Default → neutral
  return pickRandom(BGM_LIBRARY.filter(t => t.category === 'neutral'));
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------------------------------------------------------------------
// TTS Narration Script Generator
// ---------------------------------------------------------------------------
export function generateNarrationScript(opts: {
  type: 'pulse' | 'news' | 'event';
  lang: 'en' | 'ko' | 'ja';
  data: Record<string, any>;
}): string {
  const { type, lang, data } = opts;

  if (type === 'pulse') {
    return PULSE_SCRIPTS[lang](data);
  }
  if (type === 'news') {
    return NEWS_SCRIPTS[lang](data);
  }
  if (type === 'event') {
    return EVENT_SCRIPTS[lang](data);
  }

  return '';
}

const PULSE_SCRIPTS = {
  en: (d: any) => `Market Pulse. S&P 500 ${d.spy >= 0 ? 'up' : 'down'} ${Math.abs(d.spy).toFixed(2)} percent. NASDAQ ${d.qqq >= 0 ? 'up' : 'down'} ${Math.abs(d.qqq).toFixed(2)} percent. VIX at ${d.vix?.toFixed(1) || 'unknown'}. GEX regime is ${d.gexRegime || 'neutral'}. ${d.darkPool ? `Dark pool activity at ${d.darkPool.toFixed(1)} percent.` : ''} Full analysis available on Signum H Q dot com.`,

  ko: (d: any) => `마켓 펄스. S&P 500 ${Math.abs(d.spy).toFixed(2)} 퍼센트 ${d.spy >= 0 ? '상승' : '하락'}. 나스닥 ${Math.abs(d.qqq).toFixed(2)} 퍼센트 ${d.qqq >= 0 ? '상승' : '하락'}. VIX ${d.vix?.toFixed(1) || '확인 중'}. GEX 레짐은 ${d.gexRegime || '뉴트럴'}. ${d.darkPool ? `다크풀 활동 ${d.darkPool.toFixed(1)} 퍼센트.` : ''} 전체 분석은 시그넘 에이치큐 닷컴에서 확인하세요.`,

  ja: (d: any) => `マーケットパルス。S&P 500 ${Math.abs(d.spy).toFixed(2)} パーセント${d.spy >= 0 ? '上昇' : '下落'}。ナスダック ${Math.abs(d.qqq).toFixed(2)} パーセント${d.qqq >= 0 ? '上昇' : '下落'}。VIX ${d.vix?.toFixed(1) || '確認中'}。GEXレジームは${d.gexRegime || 'ニュートラル'}。${d.darkPool ? `ダークプール活動 ${d.darkPool.toFixed(1)} パーセント。` : ''}全分析はシグナムHQドットコムで。`,
};

const NEWS_SCRIPTS = {
  en: (d: any) => {
    const headlines = (d.headlines || []).slice(0, 3).map((h: any) => h.title).join('. ');
    return `News Digest. Today's top stories. ${headlines}. Market reaction: S&P ${d.spy >= 0 ? 'up' : 'down'} ${Math.abs(d.spy).toFixed(2)} percent. Full analysis on Signum H Q dot com.`;
  },
  ko: (d: any) => {
    const headlines = (d.headlines || []).slice(0, 3).map((h: any) => h.title).join('. ');
    return `뉴스 다이제스트. 오늘의 주요 뉴스. ${headlines}. 시장 반응: S&P ${Math.abs(d.spy).toFixed(2)} 퍼센트 ${d.spy >= 0 ? '상승' : '하락'}. 전체 분석은 시그넘 에이치큐에서.`;
  },
  ja: (d: any) => {
    const headlines = (d.headlines || []).slice(0, 3).map((h: any) => h.title).join('. ');
    return `ニュースダイジェスト。本日のトップニュース。${headlines}。マーケット反応: S&P ${Math.abs(d.spy).toFixed(2)} パーセント${d.spy >= 0 ? '上昇' : '下落'}。全分析はシグナムHQで。`;
  },
};

const EVENT_SCRIPTS = {
  en: (d: any) => `${d.eventType === 'whale' ? 'Whale alert' : 'Event detected'} on ${d.ticker}. ${d.details}. ${d.premium ? `Premium: ${(d.premium / 1000000).toFixed(1)} million dollars.` : ''} Track live on Signum H Q dot com.`,

  ko: (d: any) => `${d.ticker} ${d.eventType === 'whale' ? '고래 감지' : '이벤트 발생'}. ${d.details}. ${d.premium ? `프리미엄 ${(d.premium / 1000000).toFixed(1)} 백만 달러.` : ''} 실시간 추적은 시그넘 에이치큐에서.`,

  ja: (d: any) => `${d.ticker} ${d.eventType === 'whale' ? 'ホエールアラート' : 'イベント検出'}。${d.details}。${d.premium ? `プレミアム ${(d.premium / 1000000).toFixed(1)} 百万ドル。` : ''}リアルタイム追跡はシグナムHQで。`,
};

// ---------------------------------------------------------------------------
// Polly TTS API (stub — actual implementation needs AWS SDK)
// ---------------------------------------------------------------------------
export async function synthesizeSpeech(opts: {
  text: string;
  lang: 'en' | 'ko' | 'ja';
  dryRun?: boolean;
}): Promise<{ audioUrl: string; dryRun: boolean }> {
  const { text, lang, dryRun = true } = opts;
  const voice = POLLY_VOICES[lang];

  if (dryRun) {
    console.log(`[PollyTTS] DRY_RUN:
  voice: ${voice.voiceId} (${voice.engine})
  lang: ${voice.langCode}
  text: ${text.substring(0, 100)}...`);
    return { audioUrl: '', dryRun: true };
  }

  // Real implementation would use AWS SDK:
  // import { PollyClient, SynthesizeSpeechCommand } from '@aws-sdk/client-polly';
  // const polly = new PollyClient({ region: 'us-east-1' });
  // const cmd = new SynthesizeSpeechCommand({
  //   Text: text,
  //   VoiceId: voice.voiceId,
  //   Engine: voice.engine,
  //   LanguageCode: voice.langCode,
  //   OutputFormat: 'mp3',
  // });
  // const result = await polly.send(cmd);
  // ... upload to S3 and return URL

  console.log(`[PollyTTS] Would synthesize: ${voice.voiceId} / ${text.substring(0, 50)}...`);
  return { audioUrl: `s3://signum-marketing/tts/${lang}/${Date.now()}.mp3`, dryRun: false };
}
