// Serverless function (Vercel, Node runtime) that proxies chat messages to the
// Google Gemini API. The API key stays server-side; the client never sees it.
//
// To give the bot more to work with, edit api/faq-context.js — that file is
// plain text and doesn't require touching this one.

const FAQ_CONTEXT = require('./faq-context');

const SYSTEM_PROMPT = `You are the FAQ assistant embedded on Theresa Pettingill's product design portfolio site (theresapettingill.com). Answer visitors' questions about Theresa's background, work, and how to get in touch, using only the facts below. Keep answers short (2-4 sentences), friendly, and specific. Always answer in the third person, referring to her as "Theresa" or "she"/"her". Never answer in the first person as if you were Theresa, even if some of the facts below are phrased in the first person. If something isn't covered by these facts, begin your reply with "That's a good question," followed by a short note that you're not sure, and suggest reaching out to Theresa directly at theresapdesign@gmail.com rather than guessing. Never use em dashes (—) in your responses; use commas, periods, or parentheses instead. When you reference a case study, the resume, contact info, or another page covered in the LINKS section below, include it as a markdown link using the exact URL given there, so visitors can click straight to it; never invent a URL that isn't listed.

${FAQ_CONTEXT}`;

const MAX_MESSAGE_LENGTH = 1000;
const MAX_HISTORY_MESSAGES = 6;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Chat is not configured yet.' });
    return;
  }

  const body = req.body || {};
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const history = Array.isArray(body.history) ? body.history : [];

  if (!message) {
    res.status(400).json({ error: 'Missing message.' });
    return;
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    res.status(400).json({ error: 'Message is too long.' });
    return;
  }

  const trimmedHistory = history.slice(-MAX_HISTORY_MESSAGES).map((turn) => ({
    role: turn && turn.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String((turn && turn.text) || '').slice(0, MAX_MESSAGE_LENGTH) }],
  }));

  const contents = [...trimmedHistory, { role: 'user', parts: [{ text: message }] }];

  const model = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents,
    generationConfig: { maxOutputTokens: 400, temperature: 0.4 },
  });

  const callGemini = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      return await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: requestBody,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    let upstream = await callGemini();

    if (upstream.status === 503) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      upstream = await callGemini();
    }

    if (!upstream.ok) {
      const detail = await upstream.text();
      console.error('Gemini API error:', upstream.status, detail.slice(0, 500));
      res.status(502).json({ error: 'Chat is temporarily unavailable, please try again in a moment.' });
      return;
    }

    const data = await upstream.json();
    const reply = (data.candidates && data.candidates[0] && data.candidates[0].content
      && data.candidates[0].content.parts || [])
      .map((part) => part.text || '')
      .join('')
      .trim()
      .replace(/\s*[—–]\s*/g, ', '); // strip em/en dashes as a safety net

    res.status(200).json({ reply: reply || "That's a good question, I'm not sure about that one. Feel free to email Theresa directly at theresapdesign@gmail.com." });
  } catch (err) {
    console.error('Chat handler error:', err);
    if (err && err.name === 'AbortError') {
      res.status(504).json({ error: 'Chat is taking too long to respond, please try again.' });
      return;
    }
    res.status(500).json({ error: 'Something went wrong.' });
  }
};
