import { Redis } from '@upstash/redis';
import Pusher from 'pusher';

export const config = {
  runtime: 'edge',
};

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

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const { partnerId, userId, interests } = await req.json();

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

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Leave API Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
