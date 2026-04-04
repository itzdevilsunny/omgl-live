import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  const adminSecret = req.headers['x-admin-secret'];
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const now = Date.now();
    const expiryThreshold = now - (30 * 60 * 1000); // 30 minutes

    // 1. Clean up old global activity entries
    const removedActivity = await redis.zremrangebyscore('global_activity', 0, expiryThreshold);

    // 2. Scan for and clean up orphaned waiting_tag sets
    // Since Upstash Redis handles SCAN, we can find tag keys
    // For this prototype, we'll focus on the main activity queue
    const removedQueue = await redis.zremrangebyscore('active_queue', 0, now - 60000); // 1 minute stale

    return res.status(200).json({ 
      ok: true, 
      purgedActivity: removedActivity, 
      purgedQueue: removedQueue,
      timestamp: now 
    });
  } catch (error) {
    console.error('System Purge Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
