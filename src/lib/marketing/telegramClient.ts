// ============================================================================
// Telegram Bot API Client — Direct dispatch to @signumhq channel
// No Buffer dependency, no rate limit concerns, $0 cost
// ============================================================================

export interface TelegramDispatchResult {
  success: boolean;
  platform: 'telegram';
  messageId?: number;
  error?: string;
}

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID || '@signumhq';
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

/**
 * Send text message (with optional image) to Telegram channel
 * Supports Markdown formatting
 */
export async function dispatchTelegram(opts: {
  text: string;
  imageUrl?: string;
  dryRun?: boolean;
}): Promise<TelegramDispatchResult> {
  const { text, imageUrl, dryRun } = opts;

  if (!BOT_TOKEN) {
    console.warn('[Telegram] No TELEGRAM_BOT_TOKEN set, skipping');
    return { success: false, platform: 'telegram', error: 'No token' };
  }

  if (dryRun) {
    console.log(`[Telegram] DRY_RUN → ${text.substring(0, 80)}...`);
    return { success: true, platform: 'telegram', messageId: 0 };
  }

  try {
    // If image URL is provided, send as photo with caption
    if (imageUrl) {
      const res = await fetch(`${API_BASE}/sendPhoto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: CHANNEL_ID,
          photo: imageUrl,
          caption: truncateTelegramText(text, 1024), // Photo captions max 1024 chars
          parse_mode: 'HTML',
          disable_notification: false,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        console.log(`[Telegram] ✅ Photo sent (msg: ${data.result?.message_id})`);
        return { success: true, platform: 'telegram', messageId: data.result?.message_id };
      }

      // Fallback: if photo fails (e.g. URL issue), send text only
      console.warn(`[Telegram] Photo failed: ${data.description}, falling back to text`);
    }

    // Text-only message (max 4096 chars)
    const res = await fetch(`${API_BASE}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHANNEL_ID,
        text: truncateTelegramText(text, 4096),
        parse_mode: 'HTML',
        disable_web_page_preview: false,
        disable_notification: false,
      }),
    });

    const data = await res.json();
    if (data.ok) {
      console.log(`[Telegram] ✅ Message sent (msg: ${data.result?.message_id})`);
      return { success: true, platform: 'telegram', messageId: data.result?.message_id };
    }

    console.error(`[Telegram] ❌ Failed: ${data.description}`);
    return { success: false, platform: 'telegram', error: data.description };
  } catch (err: any) {
    console.error(`[Telegram] ❌ Error: ${err.message}`);
    return { success: false, platform: 'telegram', error: err.message };
  }
}

/**
 * Truncate text to Telegram limits while preserving whole lines
 */
function truncateTelegramText(text: string, maxLen: number): string {
  // Escape HTML special chars that could break parse_mode=HTML
  let safe = text
    .replace(/&(?!amp;|lt;|gt;|quot;)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  if (safe.length <= maxLen) return safe;

  // Truncate at last newline before limit
  const truncated = safe.substring(0, maxLen - 3);
  const lastNewline = truncated.lastIndexOf('\n');
  return (lastNewline > maxLen * 0.5 ? truncated.substring(0, lastNewline) : truncated) + '...';
}

/**
 * Format marketing content for Telegram (richer formatting)
 * Converts our standard text to Telegram-friendly format with bold headers
 */
export function formatForTelegram(text: string, opts?: {
  channelLink?: string;
  contentType?: string;
}): string {
  const lines = text.split('\n');
  const formatted: string[] = [];

  for (const line of lines) {
    // Bold the first line (title/hook)
    if (formatted.length === 0 && line.trim()) {
      formatted.push(`<b>${line}</b>`);
    }
    // Bold data lines starting with ▸
    else if (line.startsWith('▸')) {
      formatted.push(`<b>${line}</b>`);
    }
    else {
      formatted.push(line);
    }
  }

  // Add channel link footer
  if (opts?.channelLink) {
    formatted.push('');
    formatted.push(`📊 <a href="${opts.channelLink}">Full Analysis → SIGNUM HQ</a>`);
  }

  return formatted.join('\n');
}
