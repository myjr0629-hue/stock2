const fs = require('fs');
const f = 'src/lib/marketing/bufferMultiClient.ts';
let c = fs.readFileSync(f, 'utf8');

// Replace all dryRun return statements to include fullText and imageUrl
// Pattern: textPreview: text.substring(0, 100) }
// Replace with: textPreview: text.substring(0, 100), fullText: text, imageUrl }

// dispatchTweet - has imageUrl in opts
c = c.replace(
  "return { success: true, format: 'tweet', channel: channel?.name || channelId, service: 'twitter', lang: channel?.lang || 'en', dryRun: true, textPreview: text.substring(0, 100) };",
  "return { success: true, format: 'tweet', channel: channel?.name || channelId, service: 'twitter', lang: channel?.lang || 'en', dryRun: true, textPreview: text.substring(0, 100), fullText: text, imageUrl };"
);

// dispatchThread - has slides with imageUrl
c = c.replace(
  "return { success: true, format: 'thread', channel: channel?.name || channelId, service: 'twitter', lang: channel?.lang || 'en', dryRun: true, textPreview: slides[0]?.text.substring(0, 100) || '' };",
  "return { success: true, format: 'thread', channel: channel?.name || channelId, service: 'twitter', lang: channel?.lang || 'en', dryRun: true, textPreview: slides[0]?.text.substring(0, 100) || '', fullText: slides.map(s => s.text).join('\\n---\\n'), imageUrl: slides[0]?.imageUrl };"
);

// dispatchCarousel - has caption and imageUrls
c = c.replace(
  "return { success: true, format: 'carousel', channel: channel?.name || channelId, service: 'instagram', lang: channel?.lang || 'en', dryRun: true, textPreview: caption.substring(0, 100) };",
  "return { success: true, format: 'carousel', channel: channel?.name || channelId, service: 'instagram', lang: channel?.lang || 'en', dryRun: true, textPreview: caption.substring(0, 100), fullText: caption, imageUrl: imageUrls[0] };"
);

// dispatchStory - has imageUrl in opts
c = c.replace(
  "return { success: true, format: 'story', channel: channel?.name || channelId, service: 'instagram', lang: channel?.lang || 'en', dryRun: true, textPreview: `Story: ${imageUrl}` };",
  "return { success: true, format: 'story', channel: channel?.name || channelId, service: 'instagram', lang: channel?.lang || 'en', dryRun: true, textPreview: `Story: ${imageUrl}`, fullText: '', imageUrl };"
);

// dispatchPin - has title as text
c = c.replace(
  "return { success: true, format: 'pin', channel: channel?.name || channelId, service: 'pinterest', lang: 'en', dryRun: true, textPreview: title };",
  "return { success: true, format: 'pin', channel: channel?.name || channelId, service: 'pinterest', lang: 'en', dryRun: true, textPreview: title, fullText: `${title}\\n\\n${description}\\n\\n${link}`, imageUrl };"
);

// dispatchPost - has text and imageUrl in opts  
c = c.replace(
  "return { success: true, format: 'post', channel: channel?.name || channelId, service: channel?.service || 'unknown', lang: channel?.lang || 'en', dryRun: true, textPreview: text.substring(0, 100) };",
  "return { success: true, format: 'post', channel: channel?.name || channelId, service: channel?.service || 'unknown', lang: channel?.lang || 'en', dryRun: true, textPreview: text.substring(0, 100), fullText: text, imageUrl };"
);

fs.writeFileSync(f, c);

// Verify
const fullTextCount = (c.match(/fullText/g) || []).length;
console.log('fullText occurrences:', fullTextCount, '(expected ~8: 2 in interface + 6 in functions)');
