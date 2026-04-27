// ================================================================
// Buffer 전체 채널 Draft 생성 — 실제 마케팅 컨텐츠로
// 1) marketing-dispatch dry_run=true 로 실제 컨텐츠 가져오기
// 2) 새 Buffer GraphQL API로 각 채널에 Draft 생성
// ================================================================

const BUFFER_TOKEN = 'afILPK3AZJt0aOMG03pXv-L7cALR_tQgYZlMXln3ORX';
const CRON_SECRET = 'eunhoon2912stock';
const BASE = 'https://www.signumhq.com/api/cron/marketing-dispatch';

// Channel ID map (from bufferClient.ts)
const CHANNELS = {
  'SignumHQ':            '69a92ae13f3b94a121198602',
  'SignumHQ_KR':         '69ca785caf47dacb696d62f3',
  'signumhq_official_ig':'69ca6aa3af47dacb696d24c0',
  'signumhq_official_th':'69ca6b08af47dacb696d263d',
  'signumhq_kr_ig':      '69ca7b31af47dacb696d6df6',
  'signumhq_kr_th':      '69ca7b99af47dacb696d6f8d',
  'SIGNUM_HQ_bsky':      '69ca84bbaf47dacb696d9d0f',
  'SignumHQ_JP':         '69ca78a7af47dacb696d6446',
  'signumhq_jp_ig':      '69ca7dbeaf47dacb696d7704',
  'signumhq_jp_th':      '69ca7df5af47dacb696d77ad',
  'Pinterest':           '69ca9432af47dacb696deb5c',
};

// Reverse lookup: channel name → channel ID
function findChannelId(channelName, service) {
  const map = {
    'SignumHQ':            '69a92ae13f3b94a121198602',
    'SignumHQ_KR':         '69ca785caf47dacb696d62f3',
    'SignumHQ_JP':         '69ca78a7af47dacb696d6446',
    'signumhq_official':   service === 'threads' ? '69ca6b08af47dacb696d263d' : '69ca6aa3af47dacb696d24c0',
    'signumhq_kr':         service === 'threads' ? '69ca7b99af47dacb696d6f8d' : '69ca7b31af47dacb696d6df6',
    'signumhq_jp':         service === 'threads' ? '69ca7df5af47dacb696d77ad' : '69ca7dbeaf47dacb696d7704',
    'SIGNUM HQ':           '69ca84bbaf47dacb696d9d0f',
    'Pinterest':           '69ca9432af47dacb696deb5c',
  };
  return map[channelName] || null;
}

async function bufferCreateDraft(channelId, text, imageUrl) {
  const mutation = `
    mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess { post { id } }
        ... on NotFoundError { message }
        ... on UnauthorizedError { message }
        ... on UnexpectedError { message }
        ... on RestProxyError { message code }
        ... on LimitReachedError { message }
        ... on InvalidInputError { message }
      }
    }
  `;

  const input = {
    channelId,
    text: text || '',
    schedulingType: 'automatic',
    mode: 'addToQueue',
    saveToDraft: true,
  };

  // Add image if provided
  if (imageUrl) {
    input.assets = { images: [{ url: imageUrl }] };
  }

  const r = await fetch('https://api.buffer.com', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${BUFFER_TOKEN}`,
    },
    body: JSON.stringify({ query: mutation, variables: { input } }),
  });

  const d = await r.json();
  const post = d.data?.createPost?.post;
  const error = d.data?.createPost?.message || d.errors?.[0]?.message;
  return { success: !!post?.id, postId: post?.id, error };
}

async function getDryRunContent(action, region) {
  const url = `${BASE}?action=${action}&region=${region}&dry_run=true&secret=${CRON_SECRET}`;
  const r = await fetch(url);
  return await r.json();
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  BUFFER 전체 채널 DRAFT 생성 — 실제 마케팅 컨텐츠       ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  const actions = [
    { action: 'morning', region: 'en', label: '🌅 Morning Brief EN' },
    { action: 'morning', region: 'asia', label: '🌅 Morning Brief KR/JP' },
    { action: 'pulse', region: 'en', label: '📊 Market Pulse EN' },
    { action: 'pulse', region: 'asia', label: '📊 Market Pulse KR/JP' },
    { action: 'education', region: 'en', label: '📚 Education EN' },
    { action: 'education', region: 'asia', label: '📚 Education KR/JP' },
    { action: 'spotlight', region: 'en', label: '🔦 Spotlight EN' },
    { action: 'spotlight', region: 'asia', label: '🔦 Spotlight KR/JP' },
  ];

  let totalOk = 0, totalFail = 0;

  for (const { action, region, label } of actions) {
    console.log(`\n── ${label} ──`);
    const dry = await getDryRunContent(action, region);
    
    if (!dry.success || !dry.results) {
      console.log('  ⏭️  No content available');
      continue;
    }

    for (const r of dry.results) {
      const channelId = findChannelId(r.channel, r.service);
      if (!channelId) {
        console.log(`  ⚠️  Unknown channel: ${r.channel} (${r.service}) — skipping`);
        continue;
      }

      // Get full text (textPreview is truncated, but it's what we have from dry_run)
      const text = r.textPreview || r.text || '';
      
      // Get image URL if available
      let imageUrl = null;
      if (r.format !== 'story') {
        // For non-story formats, use the OG image
        // Story images need different handling
        imageUrl = r.imageUrl || null;
      }

      const result = await bufferCreateDraft(channelId, text, imageUrl);
      
      if (result.success) {
        totalOk++;
        console.log(`  ✅ ${r.service.padEnd(10)} @${r.channel.padEnd(22)} (${r.format}) → ID: ${result.postId}`);
      } else {
        totalFail++;
        console.log(`  ❌ ${r.service.padEnd(10)} @${r.channel.padEnd(22)} (${r.format}) → ${result.error}`);
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  console.log('\n══════════════════════════════════════════════');
  console.log(`✅ 성공: ${totalOk}  ❌ 실패: ${totalFail}  📊 총: ${totalOk + totalFail}`);
  console.log('\n→ Buffer 대시보드 → Drafts 탭에서 모든 컨텐츠 확인하세요!');
}

main().catch(e => console.error(e));
