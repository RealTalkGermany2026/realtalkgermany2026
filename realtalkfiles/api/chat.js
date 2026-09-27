// api/chat.js
// Serverless function (Vercel) that proxies chat requests to the Gemini API.
// The Gemini API key lives only in the GEMINI_API_KEY environment variable
// on the hosting platform — it is never sent to the browser.

const GEMINI_MODEL = 'gemini-3.8-flash';

const GEMINI_SYSTEM = [
  'You are the Real Talk Germany chat assistant for Devaraj Iyer, an independent German immigration advisor in Berlin.',
  'Answer clearly and practically about Opportunity Card (Chancenkarte), job search, housing, Anmeldung, banking, language, and typical timelines.',
  'You are not a lawyer. Do not give legal advice or guarantee visa outcomes. Suggest WhatsApp +91 8921498825 or email realtalkgermany2026@gmail.com for a personal consult when needed.',
  'Keep replies concise (a few short paragraphs). If you are unsure, say so.'
].join(' ');

// --- very small in-memory rate limiter -------------------------------
// Good enough for a portfolio/demo project. Resets when the function's
// container recycles, and won't work across multiple regions/instances —
// for real production traffic you'd swap this for Redis, Upstash, etc.
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10;     // per IP, per window
const requestLog = new Map(); // ip -> array of timestamps

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (requestLog.get(ip) || []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS
  );
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return timestamps.length > RATE_LIMIT_MAX_REQUESTS;
}
// -----------------------------------------------------------------------

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';

  if (isRateLimited(ip)) {
    res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set in the environment.');
    res.status(500).json({ error: 'Server is not configured. Missing API key.' });
    return;
  }

  const { message, history } = req.body || {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'A non-empty "message" string is required.' });
    return;
  }
  if (message.length > 2000) {
    res.status(400).json({ error: 'Message is too long.' });
    return;
  }

  // history is the running Gemini-format conversation the frontend keeps:
  // [{ role: 'user' | 'model', parts: [{ text: '...' }] }, ...]
  const contents = Array.isArray(history) ? [...history] : [];
  contents.push({ role: 'user', parts: [{ text: message }] });

  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(GEMINI_MODEL) +
    ':generateContent?key=' +
    encodeURIComponent(apiKey);

  try {
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: GEMINI_SYSTEM }] },
        contents,
        generationConfig: { temperature: 0.6, maxOutputTokens: 1024 }
      })
    });

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      const msg = (data.error && data.error.message) || `Gemini request failed (${geminiRes.status})`;
      res.status(502).json({ error: msg });
      return;
    }

    const reply =
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts
        ? data.candidates[0].content.parts.map((p) => p.text || '').join('')
        : '';

    if (!reply.trim()) {
      res.status(502).json({ error: 'Gemini returned an empty reply. Try again.' });
      return;
    }

    res.status(200).json({ reply: reply.trim() });
  } catch (err) {
    console.error('Error calling Gemini API:', err);
    res.status(500).json({ error: 'Something went wrong contacting the assistant.' });
  }
};
