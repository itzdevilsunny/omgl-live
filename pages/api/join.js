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

const HEARTBEAT_WINDOW_MS = 5500; // 5.5s timeout

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { userId, interests, mode, age, qual, language } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.USPTASH_REDIS_REST_TOKEN && !process.env.UPSTASH_REDIS_REST_TOKEN) {
      console.error('[SL] Redis credentials missing in environment!');
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    const now = Date.now();
    const minTime = now - HEARTBEAT_WINDOW_MS;

    const safeMode = mode || 'video';
    const safeAge = age || 'any';
    const safeQual = qual || 'any';

    // 🌐 Detect Country (Vercel header or fallback)
    const country = req.headers['x-vercel-ip-country'] || 'US'; 

    // 1. Update Global Heartbeat, Language & Country Config
    await redis.zadd('active_queue', { score: now, member: userId });
    if (language) {
      await redis.set(`lang:${userId}`, language, { ex: 3600 }); // cache for 1 hour
    }
    await redis.set(`country:${userId}`, country, { ex: 3600 }); // cache country
    
    // Fetch stats
    const trending = await redis.zrange('trending_tags', 0, 11, { rev: true });
    const onlineCount = await redis.zcount('active_queue', minTime, '+inf');

    // Helper function to try matching on a specific key
    const tryMatch = async (queueKey, matchedTag = null) => {
      const candidates = await redis.zrange(queueKey, minTime, '+inf', { byScore: true, offset: 0, count: 10 });
      const partnerId = candidates.find(id => id !== userId);

      if (partnerId) {
        const removed = await redis.zrem(queueKey, partnerId);
        if (removed) {
          const roomId = `room-${safeMode}-${now}-${Math.random().toString(36).slice(2, 6)}`;
          
          // 🌐 Fetch partner's country before triggering
          const partnerCountry = await redis.get(`country:${partnerId}`) || 'UN';

          await pusher.trigger(`user-${userId}`, 'matched', { roomId, isInitiator: false, partnerId, matchedTag, mode: safeMode, partnerCountry });
          await pusher.trigger(`user-${partnerId}`, 'matched', { roomId, isInitiator: true, partnerId: userId, matchedTag, mode: safeMode, partnerCountry: country });
          
          // Cleanup global presence
          await redis.zrem('active_queue', userId);
          await redis.zrem('active_queue', partnerId);
          
          return { partnerId, partnerCountry };
        }
      }
      return null;
    };

    // Helper: Build keys
    const getTier1Key = (tag) => `wait:t1:${safeMode}:a:${safeAge}:q:${safeQual}:i:${tag}`;
    const getTier2Key = (tag) => `wait:t2:${safeMode}:i:${tag}`;
    const tier3Key = `wait:t3:${safeMode}`;

    const validInterests = (interests && Array.isArray(interests)) ? interests.map(t => t.toLowerCase().trim()).filter(Boolean) : [];

    // --- MATCHMAKING LOGIC ---
    
    if (validInterests.length > 0) {
      for (const tag of validInterests) {
        // TIER 1: Exact Match (Mode + Age + Qual + Tag)
        // Wait! Only try T1 if they actually specified an age or qual. If everything is 'any', it's basically T2.
        if (safeAge !== 'any' || safeQual !== 'any') {
           const matchT1 = await tryMatch(getTier1Key(tag), tag);
           if (matchT1) {
             // Cleanup self queues
             return res.status(200).json({ waiting: false, partnerId: matchT1.partnerId, trending, onlineCount, matchedTag: tag, matchLevel: 'perfect' });
           }
        }

        // TIER 2: Interest Match (Mode + Tag)
        const matchT2 = await tryMatch(getTier2Key(tag), tag);
        if (matchT2) {
           return res.status(200).json({ waiting: false, partnerId: matchT2.partnerId, trending, onlineCount, matchedTag: tag, matchLevel: 'interest' });
        }
      }
    }

    // TIER 3: Random/Mode Match (Mode only)
    const matchT3 = await tryMatch(tier3Key);
    if (matchT3) {
      return res.status(200).json({ waiting: false, partnerId: matchT3.partnerId, trending, onlineCount, matchLevel: 'random' });
    }

    // --- ADD SELF TO QUEUES (NO MATCH FOUND YET) ---

    if (validInterests.length > 0) {
      for (const tag of validInterests) {
        if (safeAge !== 'any' || safeQual !== 'any') {
          await redis.zadd(getTier1Key(tag), { score: now, member: userId });
          await redis.expire(getTier1Key(tag), 10);
        }
        await redis.zadd(getTier2Key(tag), { score: now, member: userId });
        await redis.expire(getTier2Key(tag), 10);
        await redis.zincrby('trending_tags', 1, tag);
      }
    }
    
    // Always add to Tier 3 (Random pool)
    await redis.zadd(tier3Key, { score: now, member: userId });
    await redis.expire(tier3Key, 10);

    return res.status(200).json({ waiting: true, trending, onlineCount });
  } catch (error) {
    console.error('Join API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
