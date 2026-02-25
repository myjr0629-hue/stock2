const { Redis } = require('@upstash/redis');
const r = new Redis({ url: 'https://us1-intimate-skylark-42790.upstash.io', token: 'Ab8mAAIjcDE4ZmI2MmZlODNjZTQwN2NhZTUwNTI0ZGI3OGRkY2NlMThkNWI1ZjEzMjhkNDU1OGEyNGVkZmRhNWQ4ZjU2MGM=' });

async function clear() {
    await r.del('flow:ticker:AMD');
    await r.del('flow:extended:AMD');
    console.log('Cleared AMD Redis cache');
}
clear();
