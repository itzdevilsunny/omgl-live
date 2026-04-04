import Pusher from 'pusher';
import { Redis } from '@upstash/redis';
import { ratelimit } from '../../lib/ratelimit';
import { GoogleGenAI } from '@google/genai';

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

// Initialize Gemini conditionally
const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  try {
    const { targetUserId, type, data, from } = req.body;
    if (!targetUserId || !type) return res.status(400).json({ error: 'Missing fields' });

    // Apply Rate Limiting
    const { success } = await ratelimit.limit(`signal-${from || targetUserId}`);
    if (!success) return res.status(429).json({ error: 'Too many requests' });

    // --- AI MODERATION STEP (GEMINI) ---
    if (type === 'chat' && data && data.text && ai) {
      try {
        const targetLang = await redis.get(`lang:${targetUserId}`) || 'en'; // default to English

        const MODERATION_PROMPT = `You are a strict, lightning-fast AI safety moderator and translator for an anonymous chat app. 
First, evaluate the following text. If it contains severe toxicity, explicit sexual content, hate speech, or obvious spam, respond with flagged: true and a brief reason.
If it is safe, respond flagged: false.
Second, if the text is safe, detect its language. If the text is NOT already mainly written in the ISO language code "${targetLang}", translate it into "${targetLang}" retaining its exact original tone, slang, and meaning.
If it is already in "${targetLang}", or is just an emoji/symbol, leave the translation null.
Respond ONLY in valid JSON.`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `${MODERATION_PROMPT}\n\nTEXT TO EVALUATE: "${data.text}"`,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                flagged: { type: "boolean" },
                reason: { type: "string" },
                translation: { type: "string", nullable: true }
              },
              required: ["flagged", "reason"]
            }
          }
        });

        const resultText = response.text || "{}";
        const result = JSON.parse(resultText);

        if (result.flagged) {
          console.log(`[Moderation Block by Gemini]: ${data.text} -> Reason: ${result.reason}`);
          return res.status(403).json({ 
            error: 'Message blocked by AI Moderation.',
            reason: result.reason 
          });
        }

        // Successfully cleared moderation, apply translation mutation if any
        if (result.translation && result.translation.trim().length > 0) {
          data.original = data.text;
          data.text = result.translation;
          data.translated = true;
          console.log(`[Gemini Translate]: "${data.original}" -> "${data.text}" (${targetLang})`);
        }

      } catch (aiError) {
        console.error('Gemini AI Moderation Error:', aiError.message, aiError);
        // Do not throw 500 error to the client to avoid disrupting chat functionality if API is unreachable.
        // We will fail-open and let the message pass if the API fails entirely.
      }
    }

    await pusher.trigger(`user-${targetUserId}`, 'signal', { type, data, from });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Signal API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
