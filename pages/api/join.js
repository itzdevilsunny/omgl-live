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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId, interests } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    // 1. Try to match by interests (if any)
    if (interests && Array.isArray(interests) && interests.length > 0) {
      for (const tag of interests) {
        const sanitizedTag = tag.toLowerCase().trim();
        if (!sanitizedTag) continue;

        const partnerId = await redis.spop(`waiting_tag:${sanitizedTag}`);
        if (partnerId && partnerId !== userId) {
          const roomId = `room-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          
          // ✅ FIX: Only ONE peer is initiator. The newly-matched user (partnerId) 
          // is the initiator (they create the offer). The waiting user (userId) is the answerer.
          await pusher.trigger(`user-${userId}`, 'matched', { roomId, isInitiator: false, partnerId });
          await pusher.trigger(`user-${partnerId}`, 'matched', { roomId, isInitiator: true, partnerId: userId });
          
          for (const otherTag of interests) {
            await redis.srem(`waiting_tag:${otherTag.toLowerCase().trim()}`, userId);
          }
          await redis.srem('waiting_users', userId);

          return res.status(200).json({ waiting: false, partnerId });
        }
      }

      for (const tag of interests) {
        const sanitizedTag = tag.toLowerCase().trim();
        if (sanitizedTag) {
          await redis.sadd(`waiting_tag:${sanitizedTag}`, userId);
          await redis.expire(`waiting_tag:${sanitizedTag}`, 60);
          await redis.zincrby('trending_tags', 1, sanitizedTag);
        }
      }
    }

    // 2. Global Fallback / Default Matching
    const partnerId = await redis.spop('waiting_users');
    if (partnerId && partnerId !== userId) {
      const roomId = `room-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      
      // ✅ FIX: Only ONE peer is initiator. The waiting user (partnerId) is initiator.
      await pusher.trigger(`user-${userId}`, 'matched', { roomId, isInitiator: false, partnerId });
      await pusher.trigger(`user-${partnerId}`, 'matched', { roomId, isInitiator: true, partnerId: userId });
      
      if (interests) {
        for (const tag of interests) {
          await redis.srem(`waiting_tag:${tag.toLowerCase().trim()}`, userId);
        }
      }

      return res.status(200).json({ waiting: false, partnerId });
    }

    // Still waiting
    await redis.sadd('waiting_users', userId);
    await redis.zadd('global_activity', { score: Date.now(), member: userId });
    
    return res.status(200).json({ waiting: true });
  } catch (error) {
    console.error('Join API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
