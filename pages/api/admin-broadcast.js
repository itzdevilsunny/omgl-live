import Pusher from 'pusher';

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
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message required' });

    // Trigger a global announcement event on a public channel
    await pusher.trigger('global-announcements', 'message', { text: message });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Admin Broadcast Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
