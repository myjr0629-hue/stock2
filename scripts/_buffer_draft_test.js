async function main() {
  const token = 'afILPK3AZJt0aOMG03pXv-L7cALR_tQgYZlMXln3ORX';
  
  const mutation = `
    mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess {
          post { id }
        }
        ... on NotFoundError { message }
        ... on UnauthorizedError { message }
        ... on UnexpectedError { message }
        ... on RestProxyError { message code }
        ... on LimitReachedError { message }
        ... on InvalidInputError { message }
      }
    }
  `;
  
  console.log('=== Creating DRAFT post on Buffer (SignumHQ Twitter EN) ===');
  const r = await fetch('https://api.buffer.com', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      query: mutation,
      variables: {
        input: {
          channelId: '69a92ae13f3b94a121198602',
          text: '[DRAFT TEST] Market structure analysis — Neutral GEX, VIX 18.0. Test post, please delete.',
          schedulingType: 'automatic',
          mode: 'addToQueue',
          saveToDraft: true,
        }
      }
    }),
  });
  
  const result = await r.json();
  console.log('HTTP Status:', r.status);
  console.log(JSON.stringify(result, null, 2));
  
  if (result.data?.createPost?.post?.id) {
    console.log('\n✅ DRAFT created! ID:', result.data.createPost.post.id);
    console.log('→ Buffer dashboard → Drafts tab에서 확인하세요');
  }
}

main();
