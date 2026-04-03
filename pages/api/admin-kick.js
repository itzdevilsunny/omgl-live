import { Redis } from '@upstash/redis';
import Pusher from 'pusher';

export const config = {
  runtime: 'edge',
};

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.NEXT_PUBLIC_PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
  useTLS: true,
});

export default async function handler(req) {
  const adminSecret = req.headers.get('x-admin-secret');
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const { targetUserId } = await req.json();
    if (!targetUserId) return new Response('targetUserId required', { status: 400 });

    // 1. Remove from all Redis sets
    await redis.srem('waiting_users', targetUserId);
    await redis.zrem('global_activity', targetUserId);

    // 2. Trigger special "kicked" event to the user
    await pusher.trigger(`user-${targetUserId}`, 'kicked', { message: 'You have been disconnected by the administrator.' });

    return new Response(JSON.stringify({ ok: true, message: `User ${targetUserId} purged.` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
}
