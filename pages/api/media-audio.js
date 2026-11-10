import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../lib/auth';
import { createClient } from '@supabase/supabase-js';
import audioAuth from '../../lib/audio-compat-auth.cjs';

async function openMp3(res, bucket, path) {
  const signed = await bucket.createSignedUrl(path, 300);
  if (signed.error || !signed.data?.signedUrl) return res.status(502).json({ error: 'No se pudo abrir el MP3 compatible' });
  return res.redirect(302, signed.data.signedUrl);
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET') return res.status(405).end();
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'No autorizado' });
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return res.status(503).json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY en el CRM.' });
  const id = req.query.id;
  if (!audioAuth.validId(id)) return res.status(400).json({ error: 'ID inválido' });
  try {
    const db = createClient(process.env.SUPABASE_URL, secret);
    const { data: message, error } = await db.from('messages').select('id,contact_id,media_path,media_type').eq('id', id).maybeSingle();
    if (error || !message?.media_path) return res.status(404).json({ error: 'Audio no encontrado' });
    const { data: contact } = await db.from('contacts').select('id,assigned_to').eq('id', message.contact_id).maybeSingle();
    if (!contact || (session.user.role !== 'admin' && String(contact.assigned_to) !== String(session.user.id))) return res.status(403).json({ error: 'Sin acceso a esta conversación' });
    if (message.media_type !== 'audio' && !String(message.media_type).startsWith('audio/')) return res.status(415).json({ error: 'El mensaje no es un audio' });
    const destination = audioAuth.cachePath(message.media_path), bucket = db.storage.from('chat-media');
    const filename = destination.split('/').pop();
    const cached = await bucket.list('compat-audio/v1', { limit: 1, search: filename });
    if (!cached.error && cached.data?.some(file => file.name === filename)) return await openMp3(res, bucket, destination);
    const renderUrl = new URL(process.env.WHATSAPP_RENDER_URL || 'https://whatsapp-server-qr.onrender.com/send');
    renderUrl.pathname = '/audio-compatible'; renderUrl.search = ''; renderUrl.hash = '';
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 55000);
    let response;
    try {
      response = await fetch(renderUrl.toString(), { method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', ...audioAuth.signedHeaders(secret, id) }, body: JSON.stringify({ messageId: id }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = response.status === 404 ? 'Actualizá el servidor de WhatsApp con el conversor de audio.' : typeof data.error === 'string' ? data.error.slice(0, 250) : 'El servidor de WhatsApp no pudo preparar el audio.';
        return res.status([401, 403].includes(response.status) ? 502 : response.status).json({ error: detail });
      }
      if (data.storagePath !== audioAuth.cachePath(message.media_path) || data.mimeType !== 'audio/mpeg') return res.status(502).json({ error: 'Respuesta de audio inválida' });
      return await openMp3(res, bucket, destination);
    } finally { clearTimeout(timer); }
  } catch (error) {
    return res.status(error.name === 'AbortError' ? 504 : 502).json({ error: error.name === 'AbortError' ? 'El servidor está tardando en preparar el audio. Reintentá en unos segundos.' : 'No se pudo preparar el audio compatible.' });
  }
}
