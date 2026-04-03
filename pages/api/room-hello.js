import Pusher from 'pusher';

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
    const { roomId, userId } = req.body;
    if (!roomId || !userId) return res.status(400).json({ error: 'Missing fields' });

    // Broadcast to the room channel so both peers can discover each other
    await pusher.trigger(`room-${roomId}`, 'peer-hello', { from: userId });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('RoomHello API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
