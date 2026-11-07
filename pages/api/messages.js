import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://jcnsepbalxyscxrsyade.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'sb_publishable_kVLvltX-K4yGF2VRPaGDaA_KBkmT78W';
const supabase = createClient(supabaseUrl, supabaseKey);

const RENDER_SEND_URL = 'https://whatsapp-server-qr.onrender.com/send-message';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { phone, message, contactId } = req.body;

  if (!phone || !message) {
    return res.status(400).json({ error: 'Faltan parámetros' });
  }

  try {
    // 1. Enviar el mensaje a través de Render
    const response = await fetch(RENDER_SEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, message })
    });

    if (!response.ok) {
      console.warn('Fallo el envio en Render, intentando registrar en Supabase...');
    }

    // 2. Guardar en tabla messages de Supabase
    if (contactId) {
      await supabase.from('messages').insert([{
        contact_id: contactId,
        sender: 'me',
        text: message
      }]);

      await supabase.from('contacts').update({
        last_message: message,
        updated_at: new Date().toISOString()
      }).eq('id', contactId);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error enviando mensaje:', error.message);
    return res.status(500).json({ error: error.message });
  }
}