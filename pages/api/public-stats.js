import { Redis } from '@upstash/redis';

export const config = {
  runtime: 'edge',
};

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler() {
  try {
    const now = Date.now();
    const activeThreshold = now - (5 * 60 * 1000); // 5 minutes

    const waitingCount = await redis.scard('waiting_users');
    const activeUsers = await redis.zcount('global_activity', activeThreshold, now);

    return new Response(JSON.stringify({
      waitingCount,
      activeUsers,
      status: 'online',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
}
