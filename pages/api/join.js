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
          const roomId = `room-${userId}-${partnerId}`;
          await pusher.trigger([`user-${userId}`, `user-${partnerId}`], 'matched', { roomId, isInitiator: true });
          
          // Cleanup this user from other potential tag sets
          for (const otherTag of interests) {
            await redis.srem(`waiting_tag:${otherTag.toLowerCase().trim()}`, userId);
          }
          await redis.srem('waiting_users', userId);

          return res.status(200).json({ waiting: false, partnerId });
        }
      }

      // If no partner found in any tag set, add current user to all their tag sets
      for (const tag of interests) {
        const sanitizedTag = tag.toLowerCase().trim();
        if (sanitizedTag) {
          await redis.sadd(`waiting_tag:${sanitizedTag}`, userId);
          await redis.expire(`waiting_tag:${sanitizedTag}`, 60); // 1 minute TTL
          
          // Rank trending tags (for the dashboard)
          await redis.zincrby('trending_tags', 1, sanitizedTag);
        }
      }
    }

    // 2. Global Fallback / Default Matching
    const partnerId = await redis.spop('waiting_users');
    if (partnerId && partnerId !== userId) {
      const roomId = `room-${userId}-${partnerId}`;
      await pusher.trigger([`user-${userId}`, `user-${partnerId}`], 'matched', { roomId, isInitiator: true });
      
      // Cleanup tags if they matched globally
      if (interests) {
        for (const tag of interests) {
          await redis.srem(`waiting_tag:${tag.toLowerCase().trim()}`, userId);
        }
      }

      return res.status(200).json({ waiting: false, partnerId });
    }

    // Still waiting
    await redis.sadd('waiting_users', userId);
    
    // Update global activity tracker
    await redis.zadd('global_activity', { score: Date.now(), member: userId });
    
    return res.status(200).json({ waiting: true });
  } catch (error) {
    console.error('Join API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
