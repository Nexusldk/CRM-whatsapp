import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../lib/auth';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

const MAX = 3 * 1024 * 1024; // Compatible con límites de petición habituales de Vercel
const ALLOWED = new Set(['application/pdf', 'text/plain', 'application/zip', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
export const config = { api: { bodyParser: { sizeLimit: '5mb' } } };
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'No autorizado' });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY' });
  const { contactId, filename, mimeType, data, caption = '' } = req.body || {};
  const type = typeof mimeType === 'string' ? mimeType.toLowerCase() : '';
  if (!(type.startsWith('image/') || type.startsWith('audio/') || type.startsWith('video/') || ALLOWED.has(type)))
    return res.status(400).json({ error: 'Formato de archivo no permitido' });
  if (!filename || typeof data !== 'string' || data.length > 4.2 * 1024 * 1024)
    return res.status(400).json({ error: 'Archivo inválido o demasiado grande' });
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length % 4 === 1) return res.status(400).json({ error: 'Contenido de archivo inválido' });
  const buffer = Buffer.from(data, 'base64');
  if (!buffer.length || buffer.length > MAX) return res.status(400).json({ error: 'Máximo 3 MB' });
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: contact } = await db.from('contacts').select('id,jid,phone,assigned_to').eq('id', contactId).maybeSingle();
  if (!contact || (session.user.role !== 'admin' && String(contact.assigned_to) !== String(session.user.id)))
    return res.status(403).json({ error: 'Sin acceso a este contacto' });
  const mediaType = type.startsWith('image/') ? 'image' : type.startsWith('audio/') ? 'audio' : type.startsWith('video/') ? 'video' : 'document';
  const safeName = String(filename).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'archivo';
  const path = `${contact.id}/${randomUUID()}-${safeName}`;
  const { error: uploadError } = await db.storage.from('chat-media').upload(path, buffer, { contentType: type, upsert: false });
  if (uploadError) return res.status(500).json({ error: `Storage: ${uploadError.message}` });
  const { data: signed, error: signError } = await db.storage.from('chat-media').createSignedUrl(path, 300);
  if (signError || !signed?.signedUrl) {
    await db.storage.from('chat-media').remove([path]);
    return res.status(500).json({ error: 'No se pudo crear enlace temporal' });
  }
  try {
    const response = await fetch(process.env.WHATSAPP_RENDER_URL || 'https://whatsapp-server-qr.onrender.com/send', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.INTERNAL_MEDIA_SECRET ? { 'x-media-secret': process.env.INTERNAL_MEDIA_SECRET } : {}) },
      body: JSON.stringify({ jid: contact.jid, phone: contact.phone, message: String(caption).slice(0, 1000),
        mediaUrl: signed.signedUrl, mediaType, mediaName: safeName, mimeType: type, mediaPath: path, contactId: contact.id })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Render HTTP ${response.status}`);
    return res.status(200).json({ success: true });
  } catch (e) {
    // Si WhatsApp falla, no se crea un mensaje falso en el CRM.
    await db.storage.from('chat-media').remove([path]);
    return res.status(502).json({ error: `WhatsApp: ${e.message}` });
  }
}
