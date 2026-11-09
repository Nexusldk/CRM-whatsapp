import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../lib/auth';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'No autorizado' });

  if (req.method === 'GET') {
    try {
      const isAdmin = session.user.role === 'admin';
      const userId = session.user.id;

      // Traer contactos según el rol, limitando los mensajes a los últimos 25 para no agotar la cuota
      let query = supabase
        .from('contacts')
        .select(`
          id, name, phone, jid, status, last_message, bot_active, quote_data, assigned_to, updated_at,
          messages (
            id, sender, text, media_path, media_type, media_name, created_at
          )
        `)
        .order('updated_at', { ascending: false })
        .order('created_at', { foreignTable: 'messages', ascending: false })
        .limit(25, { foreignTable: 'messages' });

      if (!isAdmin) {
        query = query.eq('assigned_to', userId);
      }

      const { data: contacts, error } = await query;
      if (error) throw error;

      const formatted = contacts.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        jid: c.jid,
        status: c.status,
        lastMessage: c.last_message,
        botActive: c.bot_active,
        quoteData: c.quote_data || {},
        assignedTo: c.assigned_to,
        time: c.updated_at
          ? new Date(c.updated_at).toLocaleTimeString('es-AR', {
              timeZone: 'America/Argentina/Cordoba',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '',
        // Reordenamos de forma ascendente para mostrar el chat cronológicamente en pantalla
        messages: (c.messages || [])
          .map((m) => ({
            id: m.id,
            sender: m.sender,
            text: m.text,
            mediaId: m.media_path ? m.id : null,
            mediaType: m.media_type || null,
            mediaName: m.media_name || null,
            createdAt: m.created_at,
            time: m.created_at
              ? new Date(m.created_at).toLocaleTimeString('es-AR', {
                  timeZone: 'America/Argentina/Cordoba',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '',
          }))
          .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
      }));

      return res.status(200).json(formatted);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'PATCH') {
    const { id, quoteData, botActive, status, lastMessage, assignedTo, name } = req.body;
    if (!id) return res.status(400).json({ error: 'Falta id' });

    const payload = { updated_at: new Date().toISOString() };
    if (quoteData !== undefined) payload.quote_data = quoteData;
    if (botActive !== undefined) payload.bot_active = botActive;
    if (status !== undefined) payload.status = status;
    if (lastMessage !== undefined) payload.last_message = lastMessage;
    if (assignedTo !== undefined) payload.assigned_to = assignedTo;
    if (name !== undefined) payload.name = name;

    const { error } = await supabase.from('contacts').update(payload).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body;
    await supabase.from('contacts').delete().eq('id', id);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
