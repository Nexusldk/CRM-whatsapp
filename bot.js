const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const express = require('express');
const pino = require('pino');
const PDFParser = require('pdf2json');

const CRM_WEBHOOK_URL = 'https://crm-dcam-produccion.vercel.app/api/whatsapp-webhook';
const AI_EXTRACT_URL = 'https://crm-dcam-produccion.vercel.app/api/ai-extract';
const GROQ_API_KEY = process.env.GROQ_API_KEY;

let sockInstance = null;

// Recordamos envíos del CRM y de Sol para no guardarlos dos veces
// cuando Baileys emite el evento saliente desde nuestra misma conexión.
const sentByServer = new Map();
const processedOwnIds = new Map();
const OUTGOING_TTL = 120000;
function outgoingKey(jid, text) {
  return `${String(jid || '').replace(/\D/g, '')}|${String(text || '').trim()}`;
}
function markServerOutgoing(jid, text) {
  const key = outgoingKey(jid, text);
  sentByServer.set(key, Date.now() + OUTGOING_TTL);
  return key;
}
function wasServerOutgoing(jid, text) {
  const key = outgoingKey(jid, text);
  const expire = sentByServer.get(key);
  if (!expire) return false;
  if (expire < Date.now()) { sentByServer.delete(key); return false; }
  sentByServer.delete(key);
  return true;
}
function alreadyProcessed(id) {
  if (!id) return false;
  const now = Date.now();
  for (const [key, expires] of processedOwnIds) if (expires <= now) processedOwnIds.delete(key);
  if (processedOwnIds.has(id)) return true;
  processedOwnIds.set(id, now + 600000);
  return false;
}
async function storeOwnMessage(phone, name, text) {
  const response = await fetch(CRM_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({phone, name, text, sender:'me'})
  });
  if (!response.ok) throw new Error(`Webhook CRM rechazó mensaje propio: ${response.status}`);
}

// Extractor con limpieza de caracteres rotos de pdf2json
function extractTextFromPdfBuffer(buffer) {
  return new Promise((resolve) => {
    try {
      const pdfParser = new PDFParser(null, 1);

      pdfParser.on('pdfParser_dataError', (errData) => {
        console.error('⚠️ Error interno parseando PDF:', errData.parserError);
        resolve(null);
      });

      pdfParser.on('pdfParser_dataReady', () => {
        let rawText = pdfParser.getRawTextContent() || '';
        try {
          rawText = decodeURIComponent(rawText);
        } catch (_) {}
        const cleaned = rawText
          .replace(/----------------Page \(\d+\) Break----------------/g, ' ')
          .replace(/\r\n/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        resolve(cleaned || null);
      });

      pdfParser.parseBuffer(buffer);
    } catch (err) {
      console.error('⚠️ Fallo en inicialización de PDFParser:', err.message);
      resolve(null);
    }
  });
}

async function transcribeAudioWithGroq(audioBuffer) {
  try {
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: 'audio/ogg' });
    formData.append('file', blob, 'audio.ogg');
    formData.append('model', 'whisper-large-v3');
    formData.append('language', 'es');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: formData
    });

    const data = await res.json();
    return data.text ? data.text.trim() : null;
  } catch (err) {
    console.error('⚠️ Error al transcribir audio en Groq:', err.message);
    return null;
  }
}

async function askSolAI(conversationHistory, imageBase64 = null) {
  const response = await fetch(AI_EXTRACT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversationHistory: conversationHistory || [],
      imageBase64: imageBase64 || null
    })
  });

  const data = await response.json();

  if (response.ok && data?.replyMessage) {
    return data;
  }

  const errDetail = data?.details ? JSON.stringify(data.details) : (data?.error || 'Error desconocido');
  throw new Error(`Fallo de API: ${errDetail}`);
}

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false
  });

  sockInstance = sock;
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log('\n📲 ESCANEÁ ESTE QR:\n');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') {
      console.log('✅ ¡WHATSAPP CONECTADO CON ÉXITO AL CRM!');
    }
    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log(`⚠️ Conexión cerrada (${statusCode || 'error'}). Reconectando...`);
      if (shouldReconnect) setTimeout(connectToWhatsApp, 5000);
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    try {
      const msg = m.messages[0];
      if (!msg) return;

      const remoteJid = msg.key.remoteJid;
      if (!remoteJid || remoteJid.endsWith('@g.us') || remoteJid.includes('status')) return;

      const cleanPhone = remoteJid.replace(/\D/g, '');
      const clientName = msg.pushName || `+${cleanPhone}`;
      const msgType = Object.keys(msg.message || {})[0];

      let text =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        msg.message?.documentMessage?.caption ||
        '';

      // Los mensajes escritos desde el celular también son fromMe.
      // Los guardamos como propios, pero JAMÁS consultamos a Sol por ellos.
      if (msg.key.fromMe) {
        const ownText = String(text || '').trim();
        if (!ownText) return; // En esta versión sincronizamos mensajes de texto.
        if (wasServerOutgoing(remoteJid, ownText)) return;
        if (alreadyProcessed(msg.key.id)) return;
        await storeOwnMessage(cleanPhone, clientName, ownText);
        console.log(`📱 Mensaje manual sincronizado al CRM: ${cleanPhone}`);
        return;
      }

      let imageBase64 = null;

      // 🎙️ Procesar Audio
      if (msgType === 'audioMessage') {
        console.log(`🎙️ Recibido audio de ${clientName}, transcribiendo...`);
        try {
          const buffer = await downloadMediaMessage(
            msg,
            'buffer',
            {},
            { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
          );
          const transcription = await transcribeAudioWithGroq(buffer);
          if (transcription) {
            console.log(`📝 Transcripción: "${transcription}"`);
            text = `[Audio del cliente]: ${transcription}`;
          } else {
            text = '[El cliente envió una nota de voz inaudible]';
          }
        } catch (mediaErr) {
          text = '[El cliente envió un audio]';
        }
      }

      // 📸 Procesar Imagen con visión multimodal
      if (msgType === 'imageMessage') {
        console.log(`📸 Descargando imagen de ${clientName} para visión multimodal...`);
        try {
          const buffer = await downloadMediaMessage(
            msg,
            'buffer',
            {},
            { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
          );
          imageBase64 = buffer.toString('base64');
          if (!text.trim()) {
            text = '[El cliente adjuntó una imagen/foto]';
          }
        } catch (mediaErr) {
          console.error('Error descargando imagen:', mediaErr.message);
        }
      }

      // 📄 Procesar Documento PDF (Proforma, Packing List, Factura)
      if (msgType === 'documentMessage') {
        const fileName = msg.message?.documentMessage?.fileName || '';
        const mimetype = msg.message?.documentMessage?.mimetype || '';

        if (mimetype.includes('pdf') || fileName.toLowerCase().endsWith('.pdf')) {
          console.log(`📄 Descargando y procesando PDF de ${clientName} (${fileName})...`);
          try {
            const buffer = await downloadMediaMessage(
              msg,
              'buffer',
              {},
              { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
            );

            const rawText = await extractTextFromPdfBuffer(buffer);

            if (rawText && rawText.length > 20) {
              console.log(`📑 Texto extraído con éxito del PDF (${rawText.length} caracteres).`);
              text = `[Documento PDF adjunto: ${fileName}]:\n${rawText.slice(0, 3500)}`;
            } else {
              text = `[El cliente adjuntó el documento PDF "${fileName}", pero no contiene texto seleccionable. Solicitale amablemente los datos principales: producto, valor FOB en USD, peso en kg y volumen].`;
            }
          } catch (docErr) {
            console.error('Error leyendo documento PDF:', docErr.message);
            text = `[El cliente adjuntó el documento PDF "${fileName}"].`;
          }
        }
      }

      if (!text.trim() && !imageBase64) return;

      console.log(`📩 Mensaje de ${clientName} (${cleanPhone}): ${text.slice(0, 120)}...`);

      // 1. Guardar mensaje en el CRM
      const res = await fetch(CRM_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: cleanPhone, name: clientName, text, sender: 'client' })
      });
      const data = await res.json();
      const conv = data?.conversation;

      if (conv && conv.botActive === false) {
        console.log(`⏸️ Sol en pausa para ${clientName}.`);
        return;
      }

      console.log(`🤖 Sol analizando conversación para ${clientName}...`);

      const history = conv?.messages?.length
        ? conv.messages
        : [{ sender: 'client', text }];

      const aiData = await askSolAI(history, imageBase64);

      if (aiData?.replyMessage) {
        // 2. Responder por WhatsApp
        const aiKey = markServerOutgoing(remoteJid, aiData.replyMessage);
        try { await sock.sendMessage(remoteJid, { text: aiData.replyMessage }); }
        catch (sendError) { sentByServer.delete(aiKey); throw sendError; }

        // 3. Registrar respuesta y datos extraídos en el CRM
        await fetch(CRM_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: cleanPhone,
            text: aiData.replyMessage,
            sender: 'me',
            extractedData: aiData.extractedData || null
          })
        });
        console.log(`✅ Sol respondió a ${clientName}`);
      }
    } catch (error) {
      console.error('❌ Error procesando mensaje:', error.message);
    }
  });
}

const app = express();
app.use(express.json());

app.post('/send', async (req, res) => {
  const { phone, message } = req.body;
  try {
    if (!sockInstance) return res.status(503).json({ error: 'WhatsApp no conectado' });
    const cleanPhone = phone.replace(/\D/g, '');
    const target = `${cleanPhone}@s.whatsapp.net`;
    const crmKey = markServerOutgoing(target, message);
    try { await sockInstance.sendMessage(target, { text: message }); }
    catch (sendError) { sentByServer.delete(crmKey); throw sendError; }

    await fetch(CRM_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: cleanPhone, text: message, sender: 'me' })
    }).catch(() => {});

    res.send({ status: 'ok' });
  } catch (err) {
    res.status(500).send({ error: 'Fallo al enviar' });
  }
});

app.listen(3001, () => {
  console.log('🚀 Servidor local activo en puerto 3001');
  connectToWhatsApp();
});
