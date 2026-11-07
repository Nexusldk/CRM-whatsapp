// pages/api/whatsapp.js
export default function handler(req, res) {
  if (req.method === 'GET') {
    // Verificación de Meta
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Verificación fallida');
  }

  if (req.method === 'POST') {
    const body = req.body;
    
    if (body.entry) {
      body.entry.forEach(entry => {
        entry.changes.forEach(change => {
          if (change.field === 'messages' && change.value.messages) {
            change.value.messages.forEach(async (message) => {
              const phone = message.from;
              const text = message.text?.body || '';
              
              console.log(`📩 Mensaje de ${phone}: ${text}`);
              
              // Aquí puedes guardar el mensaje en tu BD
              // Llamar a tu API interna para guardar
            });
          }
        });
      });
    }
    
    return res.status(200).send('EVENT_RECEIVED');
  }

  return res.status(405).json({ error: 'Método no permitido' });
}
