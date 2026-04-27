// ================================================================
// Buffer Draft FINAL — 이미지 multipart 직접 업로드
// Buffer REST API v1 /updates/create 사용
// ================================================================

const fs = require('fs');
const path = require('path');

const BUFFER_TOKEN = 'afILPK3AZJt0aOMG03pXv-L7cALR_tQgYZlMXln3ORX';
const CRON_SECRET = 'eunhoon2912stock';
const BASE = 'https://www.signumhq.com/api/cron/marketing-dispatch';

const CHAR_LIMITS = { twitter: 280, threads: 500, instagram: 2200, bluesky: 300, pinterest: 500 };
const CACHE_DIR = path.join(__dirname, '_og_cache');

function findChannelId(channelName, service) {
  const map = {
    'SignumHQ':          '69a92ae13f3b94a121198602',
    'SignumHQ_KR':       '69ca785caf47dacb696d62f3',
    'SignumHQ_JP':       '69ca78a7af47dacb696d6446',
    'signumhq_official': service === 'threads' ? '69ca6b08af47dacb696d263d' : '69ca6aa3af47dacb696d24c0',
    'signumhq_kr':       service === 'threads' ? '69ca7b99af47dacb696d6f8d' : '69ca7b31af47dacb696d6df6',
    'signumhq_jp':       service === 'threads' ? '69ca7df5af47dacb696d77ad' : '69ca7dbeaf47dacb696d7704',
    'SIGNUM HQ':         '69ca84bbaf47dacb696d9d0f',
    'Pinterest':         '69ca9432af47dacb696deb5c',
  };
  return map[channelName] || null;
}

async function downloadImage(url, hash) {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  const filepath = path.join(CACHE_DIR, `${hash}.png`);
  if (fs.existsSync(filepath)) return filepath;
  
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(filepath, buf);
    return filepath;
  } catch { return null; }
}

// GraphQL draft creation (text-only or with image URL)
async function createDraftGQL(channelId, text, imageUrl, igMeta) {
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
    channelId, text: text || '', schedulingType: 'automatic',
    mode: 'addToQueue', saveToDraft: true,
  };
  if (imageUrl) input.assets = { images: [{ url: imageUrl }] };
  if (igMeta) input.metadata = { instagram: igMeta };

  const r = await fetch('https://api.buffer.com', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${BUFFER_TOKEN}` },
    body: JSON.stringify({ query: mutation, variables: { input } }),
  });
  const d = await r.json();
  const post = d.data?.createPost?.post;
  const error = d.data?.createPost?.message || d.errors?.[0]?.message;
  return { success: !!post?.id, postId: post?.id, error };
}

// Upload image via Buffer's image upload, returns CDN URL
async function uploadImageToBuffer(filepath, channelId) {
  const fileBuffer = fs.readFileSync(filepath);
  const blob = new Blob([fileBuffer], { type: 'image/png' });
  
  // Buffer's image upload endpoint
  const formData = new FormData();
  formData.append('media', blob, 'og_image.png');
  formData.append('access_token', BUFFER_TOKEN);
  formData.append('profile_ids[]', channelId);
  
  try {
    const r = await fetch('https://api.bufferapp.com/1/media/upload.json', {
      method: 'POST',
      body: formData,
    });
    
    if (r.ok) {
      const d = await r.json();
      return d.upload?.thumbnail || d.upload?.picture || d.thumbnail || null;
    }
    
    // Try alternative: upload/retrieve signed URL
    const r2 = await fetch(`https://upload.buffer.com/upload?client_id=buffer&access_token=${BUFFER_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'image/png' },
      body: fileBuffer,
    });
    
    if (r2.ok) {
      const d2 = await r2.json();
      return d2.url || d2.uploaded?.url || null;
    }
    
    return null;
  } catch {
    return null;
  }
}

async function getDryRunContent(action, region) {
  const url = `${BASE}?action=${action}&region=${region}&dry_run=true&secret=${CRON_SECRET}`;
  const r = await fetch(url);
  return await r.json();
}

async function deleteAllDrafts() {
  const listQ = `{ posts(input: { organizationId: "69a92687c9f20bfac044a189", status: draft }) { id } }`;
  const r = await fetch('https://api.buffer.com', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${BUFFER_TOKEN}` },
    body: JSON.stringify({ query: listQ }),
  });
  const d = await r.json();
  const posts = d.data?.posts || [];
  for (const p of posts) {
    await fetch('https://api.buffer.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${BUFFER_TOKEN}` },
      body: JSON.stringify({
        query: `mutation { deletePost(input: { postId: "${p.id}" }) { ... on PostActionSuccess { post { id } } ... on NotFoundError { message } } }`,
      }),
    });
    await new Promise(r => setTimeout(r, 100));
  }
  return posts.length;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  BUFFER DRAFT FINAL — 텍스트 + OG 이미지 완벽 버전        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const deleted = await deleteAllDrafts();
  console.log(`🗑️  기존 Draft ${deleted}개 삭제\n`);

  const actions = [
    { action: 'morning', region: 'en' }, { action: 'morning', region: 'asia' },
    { action: 'morning_ig', region: 'en' }, { action: 'morning_ig', region: 'asia' },
    { action: 'midday', region: 'en' }, { action: 'midday', region: 'asia' },
    { action: 'education', region: 'en' }, { action: 'education', region: 'asia' },
    { action: 'pulse', region: 'en' }, { action: 'pulse', region: 'asia' },
    { action: 'pulse_ig', region: 'en' }, { action: 'pulse_ig', region: 'asia' },
    { action: 'spotlight', region: 'en' }, { action: 'spotlight', region: 'asia' },
  ];

  // STEP 1: Collect content
  console.log('📥 컨텐츠 수집 중...');
  const allItems = [];
  for (const { action, region } of actions) {
    const dry = await getDryRunContent(action, region);
    if (!dry.success || !dry.results) continue;
    for (const r of dry.results) {
      const channelId = findChannelId(r.channel, r.service);
      if (!channelId) continue;
      allItems.push({ ...r, channelId, action: `${action}_${region}` });
    }
  }
  console.log(`   ${allItems.length}개 수집 완료\n`);

  // STEP 2: Download all unique OG images (one by one, with 3s gap)
  const uniqueUrls = [...new Set(allItems.map(i => i.imageUrl).filter(Boolean))];
  console.log(`🖼️  OG 이미지 ${uniqueUrls.length}개 다운로드 중 (순차)...\n`);
  
  const imgCache = {};
  for (let i = 0; i < uniqueUrls.length; i++) {
    const url = uniqueUrls[i];
    const hash = Buffer.from(url).toString('base64url').substring(0, 20);
    process.stdout.write(`   [${i+1}/${uniqueUrls.length}] `);
    const fp = await downloadImage(url, hash);
    if (fp) {
      imgCache[url] = fp;
      const sz = fs.statSync(fp).size;
      console.log(`✅ ${(sz/1024).toFixed(0)}KB`);
    } else {
      console.log('❌');
    }
    if (i < uniqueUrls.length - 1) await new Promise(r => setTimeout(r, 3000));
  }
  console.log(`\n   캐시 완료: ${Object.keys(imgCache).length}/${uniqueUrls.length}\n`);

  // STEP 3: Test image upload to Buffer
  console.log('📤 Buffer 이미지 업로드 테스트...');
  let uploadTestUrl = null;
  const testFile = Object.values(imgCache)[0];
  const testChannelId = '69a92ae13f3b94a121198602'; // SignumHQ twitter
  if (testFile) {
    uploadTestUrl = await uploadImageToBuffer(testFile, testChannelId);
    if (uploadTestUrl) {
      console.log(`   ✅ 업로드 성공: ${uploadTestUrl.substring(0, 60)}...`);
    } else {
      console.log('   ❌ REST 업로드 불가 — CDN URL 방식으로 대체 시도');
      
      // Warm up cached images so CDN has them, then try GraphQL with URL
      console.log('   🔥 CDN Warm-up 시도...');
      for (const url of uniqueUrls.slice(0, 3)) {
        try { await fetch(url); } catch {}
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  // STEP 4: Create all drafts
  console.log('\n📝 STEP 4: 전체 Draft 생성...\n');
  let ok = 0, fail = 0, skip = 0;
  let lastAction = '';

  for (const item of allItems) {
    if (item.action !== lastAction) {
      lastAction = item.action;
      console.log(`\n── ${lastAction} ──`);
    }

    let text = item.fullText || item.textPreview || '';
    const limit = CHAR_LIMITS[item.service] || 500;

    if (item.format === 'thread' && text.includes('---')) {
      text = text.split('---')[0].trim();
    }
    if (text.length > limit) text = text.substring(0, limit - 3) + '...';

    let igMeta = null;
    if (item.service === 'instagram') {
      igMeta = item.format === 'story' 
        ? { type: 'story', shouldShareToFeed: false }
        : { type: 'post', shouldShareToFeed: true };
    }

    // IG story without text — need placeholder
    if (item.format === 'story' && !text) text = '📊';

    // Determine image URL to attach:
    // 1. Use the original imageUrl from dry_run output (not null!)
    // 2. For platforms that REQUIRE images (IG, Pinterest), this is critical
    let imageUrlToUse = null;
    if (item.imageUrl) {
      // Check if we have this image cached locally (proves it's fetchable)
      if (imgCache[item.imageUrl]) {
        imageUrlToUse = item.imageUrl; // Use original URL — Buffer will fetch it
      } else {
        // Try to warm it up first
        try { await fetch(item.imageUrl, { signal: AbortSignal.timeout(10000) }); } catch {}
        imageUrlToUse = item.imageUrl;
      }
    }

    // Create draft — WITH image URL for IG/Pinterest
    const result = await createDraftGQL(item.channelId, text, imageUrlToUse, igMeta);

    if (result.success) {
      ok++;
      const imgTag = imageUrlToUse ? '🖼️' : '📝';
      console.log(`  ✅ ${item.service.padEnd(10)} @${item.channel.padEnd(22)} (${item.format.padEnd(8)}) ${text.length}자 ${imgTag}`);
    } else {
      fail++;
      console.log(`  ❌ ${item.service.padEnd(10)} @${item.channel.padEnd(22)} (${item.format}) → ${result.error}`);
    }

    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`✅ 성공: ${ok}  ❌ 실패: ${fail}  ⏭️ 스킵: ${skip}  📊 총: ${ok + fail + skip}`);
  console.log(`📁 OG 이미지 캐시: ${Object.keys(imgCache).length}개 → scripts/_og_cache/`);
  console.log('\n→ Buffer 대시보드 → Drafts 탭에서 확인!');
}

main().catch(e => console.error(e));
