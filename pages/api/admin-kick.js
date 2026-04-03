import { Redis } from '@upstash/redis';
import Pusher from 'pusher';

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

export default async function handler(req, res) {
  const adminSecret = req.headers['x-admin-secret'];
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  try {
    const { targetUserId } = req.body;
    if (!targetUserId) return res.status(400).json({ error: 'targetUserId required' });

    // 1. Remove from all Redis sets
    await redis.srem('waiting_users', targetUserId);
    await redis.zrem('global_activity', targetUserId);

    // 2. Trigger special "kicked" event to the user
    await pusher.trigger(`user-${targetUserId}`, 'kicked', { message: 'You have been disconnected by the administrator.' });

    return res.status(200).json({ ok: true, message: `User ${targetUserId} purged.` });
  } catch (error) {
    console.error('Admin Kick Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
