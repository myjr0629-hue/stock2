// ============================================================================
// Marketing V2 — X (Twitter) Adapter
// 280자 weighted char, 해시태그, 데이터 헤드라인 스타일
// ============================================================================

import { BaseAdapter } from './base';
import { ContentPackage, Lang, Platform, ImageFormat } from '../core/types';

export class TwitterAdapter extends BaseAdapter {
  readonly platform: Platform = 'twitter';
  readonly maxChars = 280;
  readonly imageFormat: ImageFormat = 'tweet';
  readonly supportedLangs: Lang[] = ['en', 'ko', 'ja'];

  buildText(pkg: ContentPackage, lang: Lang): string {
    const t = pkg.text[lang];
    if (!t) return '';
    
    // X = 헤드라인 + 데이터 + 인사이트 + CTA (280자는 base.format()이 처리)
    const parts = [
      t.headline,
      t.data,
      t.insight ? `🎯 ${t.insight}` : '',
      t.cta,
    ].filter(Boolean);

    return parts.join('\n\n');
  }
}
