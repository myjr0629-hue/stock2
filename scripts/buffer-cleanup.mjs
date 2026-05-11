import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const BUFFER_API = 'https://api.buffer.com';
const TOKEN = process.env.BUFFER_ACCESS_TOKEN;
const ORG_ID = process.env.BUFFER_ORGANIZATION_ID;

async function gql(query) {
  const res = await fetch(BUFFER_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${TOKEN}` },
    body: JSON.stringify({ query }),
  });
  return await res.json();
}

const channels = [
  { id: '69a92ae13f3b94a121198602', name: 'SignumHQ (X EN)' },
  { id: '69ca6b08af47dacb696d263d', name: 'signumhq_official (Threads EN)' },
  { id: '69ca785caf47dacb696d62f3', name: 'SignumHQ_KR (X KR)' },
  { id: '69ca6aa3af47dacb696d24c0', name: 'signumhq_official (IG EN)' },
  { id: '69ca7b31af47dacb696d6df6', name: 'signumhq_kr (IG KR)' },
  { id: '69ca7b99af47dacb696d6f8d', name: 'signumhq_kr (Threads KR)' },
  { id: '69ca84bbaf47dacb696d9d0f', name: 'SIGNUM HQ (Bluesky)' },
  { id: '69ca78a7af47dacb696d6446', name: 'SignumHQ_JP (X JP)' },
  { id: '69ca7dbeaf47dacb696d7704', name: 'signumhq_jp (IG JP)' },
  { id: '69ca7df5af47dacb696d77ad', name: 'signumhq_jp (Threads JP)' },
  { id: '69ca9432af47dacb696deb5c', name: 'Pinterest' },
  { id: '69ca95e7af47dacb696df35a', name: 'TikTok' },
  { id: '69ca9615af47dacb696df427', name: 'YouTube' },
];

let totalDeleted = 0;

for (const ch of channels) {
  for (const status of ['queue', 'draft']) {
    const result = await gql(`{
      posts(input: { organizationId: "${ORG_ID}", channelId: "${ch.id}", status: "${status}" }) {
        id text status dueAt
      }
    }`);
    
    const posts = result.data?.posts || [];
    if (posts.length === 0) continue;
    
    console.log(`[${ch.name}] ${posts.length} ${status} posts:`);
    
    for (const post of posts) {
      console.log(`  🗑️ Deleting: ${post.text?.substring(0, 70)}...`);
      try {
        const delResult = await gql(`mutation { deletePost(input: { postId: "${post.id}" }) { ... on PostActionSuccess { post { id } } ... on NotFoundError { message } ... on UnexpectedError { message } } }`);
        if (delResult.data?.deletePost?.post?.id) {
          console.log(`  ✅ Deleted`);
          totalDeleted++;
        } else {
          console.log(`  ❌ ${JSON.stringify(delResult.data?.deletePost || delResult.errors)}`);
        }
      } catch (e) {
        console.log(`  ❌ ${e.message}`);
      }
      await new Promise(r => setTimeout(r, 300));
    }
  }
}

console.log(`\n🧹 Total deleted: ${totalDeleted}`);
process.exit(0);
