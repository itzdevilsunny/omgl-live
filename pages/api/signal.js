import Pusher from 'pusher';
import { ratelimit } from '../../lib/ratelimit';

const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID,
  key: process.env.NEXT_PUBLIC_PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
  useTLS: true,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  try {
    const { targetUserId, type, data } = req.body;
    if (!targetUserId || !type) return res.status(400).json({ error: 'Missing fields' });

    // Apply Rate Limiting (Note: Upstash Ratelimit still works in Node.js)
    const { success } = await ratelimit.limit(`signal-${targetUserId}`);
    if (!success) return res.status(429).json({ error: 'Too many requests' });

    await pusher.trigger(`user-${targetUserId}`, 'signal', { type, data });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Signal API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
