// Vercel serverless function: POST /api/analyze. Set ANTHROPIC_API_KEY in the project's environment variables.
import { handleAnalyze } from '../server/ai.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED', message: 'Use POST.' });
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
  const ip = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'unknown';
  const r = await handleAnalyze({ rawBody, ip });
  return res.status(r.status).json(r.body);
}
