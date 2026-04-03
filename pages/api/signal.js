import Pusher from 'pusher';
import { ratelimit } from '../../lib/ratelimit';

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

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const { targetUserId, type, data } = await req.json();
    if (!targetUserId || !type) return new Response('Missing fields', { status: 400 });

    // Apply Rate Limiting
    const { success } = await ratelimit.limit(`signal-${targetUserId}`);
    if (!success) return new Response('Too many requests', { status: 429 });

    await pusher.trigger(`user-${targetUserId}`, 'signal', { type, data });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Signal API Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
