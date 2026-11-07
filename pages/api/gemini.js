import { askGemini } from '../../lib/gemini';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Falta prompt' });
  }

  try {
    const reply = await askGemini(prompt);
    return res.status(200).json({ reply });
  } catch (err) {
    console.error('Gemini error:', err);
    return res.status(500).json({ error: err.message });
  }
}
