const crypto = require('node:crypto');

// All writes finish before the HTTP response; no background work on serverless.
function createRedisStore({ url, token, prefix = 'vo-paper:development', fetchImpl = fetch }) {
  if (!url || !token) throw new Error('Redis REST credentials are required');
  async function command(...args) {
    const response = await fetchImpl(url.replace(/\/$/, ''), {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args), signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error('Analytics storage unavailable');
    const data = await response.json();
    if (data.error) throw new Error('Analytics storage command failed');
    return data.result;
  }
  const key = name => `${prefix}:${name}`;
  return {
    async getSession(token) { return token ? Number(await command('GET', key(`session:${token}`))) : 0; },
    async setSession(token, expires) { await command('SET', key(`session:${token}`), expires, 'EX', 28800); },
    async deleteSession(token) { if (token) await command('DEL', key(`session:${token}`)); },
    async presence(visitor, timestamp, leave) { await command(leave ? 'ZREM' : 'ZADD', key('online'), ...(leave ? [visitor] : [timestamp, visitor])); },
    async online(timestamp) {
      return Number(await command('EVAL', "redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1]); return redis.call('ZCARD', KEYS[1])", 1, key('online'), timestamp - 65000));
    },
    async append(event) { await command('ZADD', key('events'), event.timestamp, JSON.stringify({ ...event, id: crypto.randomUUID() })); },
    async events(start, end) {
      const min = Date.parse(start) - 7 * 3600000, max = Date.parse(end) - 7 * 3600000 + 86400000 - 1;
      return (await command('ZRANGEBYSCORE', key('events'), min, max)).map(item => JSON.parse(item));
    },
    async rate(bucket, max) {
      const hash = crypto.createHash('sha256').update(bucket).digest('hex');
      const count = await command('EVAL', "local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 60) end; return n", 1, key(`rate:${hash}`));
      return Number(count) <= max;
    }
  };
}

function storeFromEnv(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (url && token) return createRedisStore({ url, token, prefix: env.ANALYTICS_KEY_PREFIX || `vo-paper:${env.VERCEL_ENV || 'development'}` });
  if (env.VERCEL === '1') {
    const unavailable = async () => { const error = new Error('Chưa kết nối Redis. Thêm UPSTASH_REDIS_REST_URL và UPSTASH_REDIS_REST_TOKEN trong Vercel rồi Redeploy.'); error.status = 503; throw error; };
    return Object.fromEntries(['getSession','setSession','deleteSession','presence','online','append','events','rate'].map(name => [name, unavailable]));
  }
  return null;
}
module.exports = { createRedisStore, storeFromEnv };
