import { Redis } from '@upstash/redis';
import Pusher from 'pusher';

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.NEXT_PUBLIC_PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
  useTLS: true,
});

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const HEARTBEAT_WINDOW_MS = 5500; // 5.5s timeout (pings are every 2s)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId, interests } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const now = Date.now();
    const minTime = now - HEARTBEAT_WINDOW_MS;

    // 1. Update Heartbeat
    await redis.zadd('active_queue', { score: now, member: userId });
    
    // 2. Fetch Trending Tags (Top 12)
    const trending = await redis.zrevrange('trending_tags', 0, 11);
    const onlineCount = await redis.zcount('active_queue', minTime, '+inf');

    // 3. Matchmaking by interests
    if (interests && Array.isArray(interests) && interests.length > 0) {
      for (const tag of interests) {
        const sanitizedTag = tag.toLowerCase().trim();
        if (!sanitizedTag) continue;

        // Find an active user in this tag who isn't me
        const candidates = await redis.zrangebyscore(`waiting_tag:${sanitizedTag}`, minTime, '+inf', { offset: 0, count: 10 });
        const partnerId = candidates.find(id => id !== userId);

        if (partnerId) {
          // Atomic grab
          const removed = await redis.zrem(`waiting_tag:${sanitizedTag}`, partnerId);
          if (removed) {
            const roomId = `room-i-${now}-${Math.random().toString(36).slice(2, 6)}`;
            
            // Trigger both
            await pusher.trigger(`user-${userId}`, 'matched', { roomId, isInitiator: false, partnerId, matchedTag: sanitizedTag });
            await pusher.trigger(`user-${partnerId}`, 'matched', { roomId, isInitiator: true, partnerId: userId, matchedTag: sanitizedTag });
            
            // Cleanup my own presence
            await redis.zrem('active_queue', userId);
            await redis.zrem('active_queue', partnerId);
            for (const t of interests) await redis.zrem(`waiting_tag:${t.toLowerCase().trim()}`, userId);

            return res.status(200).json({ waiting: false, partnerId, trending, onlineCount, matchedTag: sanitizedTag });
          }
        }
      }

      // Add self to tag queues
      for (const tag of interests) {
        const sanitizedTag = tag.toLowerCase().trim();
        if (sanitizedTag) {
          await redis.zadd(`waiting_tag:${sanitizedTag}`, { score: now, member: userId });
          await redis.expire(`waiting_tag:${sanitizedTag}`, 10);
          await redis.zincrby('trending_tags', 1, sanitizedTag);
        }
      }
    }

    // 4. Global Matchmaking (fallback)
    const globalCandidates = await redis.zrangebyscore('active_queue', minTime, '+inf', { offset: 0, count: 20 });
    const partnerId = globalCandidates.find(id => id !== userId);

    if (partnerId) {
      const removed = await redis.zrem('active_queue', partnerId);
      if (removed) {
        const roomId = `room-g-${now}-${Math.random().toString(36).slice(2, 6)}`;
        
        await pusher.trigger(`user-${userId}`, 'matched', { roomId, isInitiator: false, partnerId });
        await pusher.trigger(`user-${partnerId}`, 'matched', { roomId, isInitiator: true, partnerId: userId });

        await redis.zrem('active_queue', userId);
        return res.status(200).json({ waiting: false, partnerId, trending, onlineCount });
      }
    }

    // Still waiting
    return res.status(200).json({ waiting: true, trending, onlineCount });
  } catch (error) {
    console.error('Join API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
