// Pinterest 실발행 테스트 — "Options Flow & Market Structure" 보드에 Pin 생성
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const TOKEN = process.env.BUFFER_ACCESS_TOKEN;
const PIN_CHANNEL_ID = '69ca9432af47dacb696deb5c';
const BOARD_ID = '1102115408751808397'; // Options Flow & Market Structure
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function main() {
  // 1. EC2 캡처
  console.log('1. EC2 캡처 (1000×1500)...');
  const captureRes = await fetch('https://ws.signumhq.com/capture', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://signumhq.com/templates/og/pulse?format=pin&spy=0.77&vix=17.3&gex=positive&dp=42.1',
      width: 1000, height: 1500,
      waitForSelector: '.ready',
      timeout: 15000,
    }),
  });
  const imageBuffer = Buffer.from(await captureRes.arrayBuffer());
  console.log(`   ✅ ${(imageBuffer.length/1024).toFixed(0)}KB`);

  // 2. Supabase 업로드
  console.log('2. Supabase 업로드...');
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  const path = `cards/pin_live_${Date.now()}.png`;
  const { error } = await supabase.storage.from('marketing-assets').upload(path, imageBuffer, { contentType: 'image/png', upsert: true });
  if (error) { console.log('❌ 업로드 실패:', error.message); return; }
  const { data: urlData } = supabase.storage.from('marketing-assets').getPublicUrl(path);
  console.log(`   ✅ ${urlData.publicUrl}`);

  // 3. Pin 실발행 (saveToDraft 없음!)
  console.log('3. Pin 실발행...');
  const pinRes = await fetch('https://api.buffer.com', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
    body: JSON.stringify({
      query: `mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) {
          ... on PostActionSuccess { post { id status } }
          ... on NotFoundError { message }
          ... on UnauthorizedError { message }
          ... on UnexpectedError { message }
          ... on RestProxyError { message code }
          ... on LimitReachedError { message }
          ... on InvalidInputError { message }
        }
      }`,
      variables: {
        input: {
          channelId: PIN_CHANNEL_ID,
          text: 'S&P 500 options flow, gamma exposure, and dark pool activity — institutional positioning decoded.\n\n#SP500 #Options #StockMarket #DarkPool #Trading #Investing #WallStreet #OptionsFlow #SignumHQ',
          assets: { images: [{ url: urlData.publicUrl }] },
          schedulingType: 'automatic',
          mode: 'customScheduled',
          dueAt: new Date(Date.now() + 30_000).toISOString(),
          metadata: {
            pinterest: {
              title: 'S&P 500 Options Flow Analysis — Market Structure',
              url: 'https://www.signumhq.com/intel-guardian?utm_source=pinterest&utm_medium=social&utm_campaign=pulse',
              boardServiceId: BOARD_ID,
            },
          },
        },
      },
    }),
  });

  const result = (await pinRes.json())?.data?.createPost;
  if (result?.post?.id) {
    console.log(`\n🎉 PIN 실발행 성공! postId: ${result.post.id}`);
    console.log(`   Pinterest에서 1~2분 내 확인 가능`);
  } else {
    console.log(`\n❌ 실패:`, JSON.stringify(result, null, 2));
  }
}

main().catch(console.error);
