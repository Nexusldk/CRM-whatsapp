import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../lib/auth';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'No autorizado' });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(503).json({ error: 'Falta SUPABASE_SERVICE_ROLE_KEY' });
  
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  
  // CORRECCIÓN: Leer el ID como texto (UUID), no como número entero.
  const id = req.query.id;
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'ID inválido' });
  
  const { data: message, error } = await db.from('messages').select('id,contact_id,media_path,media_name').eq('id', id).maybeSingle();
  if (error || !message?.media_path) return res.status(404).json({ error: 'Archivo no encontrado' });
  
  const { data: contact } = await db.from('contacts').select('id,assigned_to').eq('id', message.contact_id).maybeSingle();
  if (!contact || (session.user.role !== 'admin' && String(contact.assigned_to) !== String(session.user.id))) {
    return res.status(403).json({ error: 'Sin acceso a esta conversación' });
  }
  
  const download = req.query.download === '1';
  const { data, error: signingError } = await db.storage.from('chat-media').createSignedUrl(
    message.media_path, 90, download ? { download: message.media_name || true } : undefined
  );
  
  if (signingError || !data?.signedUrl) return res.status(404).json({ error: 'El archivo no está disponible' });
  
  res.setHeader('Cache-Control', 'private, no-store');
  return res.redirect(302, data.signedUrl);
}
