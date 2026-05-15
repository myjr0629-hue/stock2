// ============================================================================
// Marketing V2 — Threads Adapter
// 500자, https URL 금지 (Meta 차단 방지), 대화형
// ============================================================================

import { BaseAdapter } from './base';
import { ContentPackage, Lang, Platform, ImageFormat } from '../core/types';

export class ThreadsAdapter extends BaseAdapter {
  readonly platform: Platform = 'threads';
  readonly maxChars = 500;
  readonly imageFormat: ImageFormat = 'og';
  readonly supportedLangs: Lang[] = ['en', 'ko', 'ja'];

  buildText(pkg: ContentPackage, lang: Lang): string {
    const t = pkg.text[lang];
    if (!t) return '';

    // Threads = 풀 분석 + 면책 + 브랜드 멘션 (URL 없음)
    const parts = [
      t.headline,
      t.data,
      t.insight,
      // URL 없이 브랜드 멘션만 (Meta 정책)
      this.buildThreadsCta(lang, pkg.slot),
      t.disclaimer,
    ].filter(Boolean);

    return parts.join('\n\n');
  }

  private buildThreadsCta(lang: Lang, slot: string): string {
    const page = slot === 'education' ? 'how-it-works' : 'intel-guardian';
    const ctas: Record<Lang, string> = {
      en: `📊 Full analysis → signumhq.com/${page}`,
      ko: `📊 전체 분석 보기 → signumhq.com/${page}`,
      ja: `📊 詳細分析 → signumhq.com/${page}`,
    };
    return ctas[lang];
  }
}
