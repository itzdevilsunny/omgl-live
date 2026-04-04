import { ratelimit } from '../../lib/ratelimit';
import { GoogleGenAI } from '@google/genai';

const ai = process.env.GEMINI_API_KEY ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY }) : null;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');

  try {
    const { tag } = req.body;
    
    // Simple ip-based ratelimiting fallback for generic endpoints
    // Extract IP from headers or use a generic 'global-icebreaker' limit if no user context available
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown';
    const { success } = await ratelimit.limit(`icebreaker-${ip}`);
    if (!success) {
      return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
    }

    if (!ai) {
      return res.status(503).json({ error: 'AI Service is currently unavailable.' });
    }

    let prompt = "";
    if (tag) {
      prompt = `You are a quirky, extroverted genius on an anonymous chat app. Give me EXACTLY ONE single short, witty, and highly engaging icebreaker line to start a conversation about "${tag}". Keep it under fifteen words. Do not use emojis. Do not use quotes.`;
    } else {
      prompt = `You are a quirky, extroverted genius on an anonymous chat app. Give me EXACTLY ONE single short, witty, and highly engaging random icebreaker line to start a conversation with a stranger. Keep it under fifteen words. Do not use emojis. Do not use quotes.`;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        maxOutputTokens: 50,
        temperature: 0.8 // high temp for creativity
      }
    });

    const icebreaker = response.text ? response.text.replace(/"/g, '').trim() : "What's the most controversial opinion you hold?";

    return res.status(200).json({ icebreaker });
  } catch (error) {
    console.error('Icebreaker API Error:', error);
    return res.status(500).json({ error: 'Failed to generate icebreaker' });
  }
}
