const requireDotenv = require('dotenv');
requireDotenv.config({ path: '.env.local' });

const token = process.env.BUFFER_ACCESS_TOKEN;
const orgId = process.env.BUFFER_ORGANIZATION_ID;

if (!token || !orgId) {
  console.log('❌ Buffer credentials not fully set');
  process.exit(1);
}

const query = `
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

async function test() {
  console.log('--- Testing Direct createPost Mutation via Buffer GraphQL API ---');
  
  // Test target: Threads channel
  const targetChannelId = '69ca6b08af47dacb696d263d'; // signumhq_official (threads)
  
  // Try 5 minutes from now
  const publishTime = new Date(Date.now() + 300_000).toISOString();
  
  const input = {
    channelId: targetChannelId,
    text: `SignumHQ Live System Test — Intraday structural flow verification. [${new Date().toISOString()}]`,
    schedulingType: 'automatic',
    mode: 'customScheduled',
    dueAt: publishTime
  };

  try {
    const res = await fetch('https://api.buffer.com', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables: { input } }),
    });

    if (!res.ok) {
      console.log(`❌ HTTP Error: ${res.status} - ${await res.text()}`);
      return;
    }

    const json = await res.json();
    console.log('Response JSON:', JSON.stringify(json, null, 2));

  } catch (err) {
    console.error('❌ Exception during direct createPost test:', err.message);
  }
}

test();
