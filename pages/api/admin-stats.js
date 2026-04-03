import { Redis } from '@upstash/redis';

export const config = {
  runtime: 'edge',
};

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req) {
  const adminSecret = req.headers.get('x-admin-secret');
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    // Current timestamp for activity filtering
    const now = Date.now();
    const activeThreshold = now - (5 * 60 * 1000); // 5 minutes ago

    // Get stats from Redis
    const waitingCount = await redis.scard('waiting_users');
    
    // Get all users who were active in the last 5 minutes
    const activeUsers = await redis.zcount('global_activity', activeThreshold, now);

    // Clean up old activity entries (maintain sanity)
    await redis.zremrangebyscore('global_activity', 0, activeThreshold - (60 * 60 * 1000)); // 1 hour ago

    // Get trending tags
    const trendingTags = await redis.zrange('trending_tags', 0, 4, { rev: true, withScores: true });

    return new Response(JSON.stringify({
      waitingCount,
      activeUsers,
      trendingTags,
      timestamp: now,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
}
