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
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  try {
    const { partnerId, userId, interests } = req.body;

    // If userId provided, remove from waiting queue and activity tracker
    if (userId) {
      await redis.srem('waiting_users', userId);
      await redis.zrem('global_activity', userId);
      
      // Cleanup all interest tags
      if (interests && Array.isArray(interests)) {
        for (const tag of interests) {
          await redis.srem(`waiting_tag:${tag.toLowerCase().trim()}`, userId);
        }
      }
    }

    // If partnerId provided, notify them that we left
    if (partnerId) {
      await pusher.trigger(`user-${partnerId}`, 'partner-left', {});
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Leave API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
