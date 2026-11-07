import { SOL_SYSTEM_PROMPT } from '../lib/sol-prompt.js';

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });

  const { conversationHistory, imageBase64 } = req.body;
  if (!conversationHistory || !Array.isArray(conversationHistory)) {
    return res.status(400).json({ error: "Falta el historial de conversación" });
  }

  // TRUCO ANTI-AMNESIA: Convertimos el historial en un guion de texto claro
  const transcript = conversationHistory.map(msg =>
    `${msg.sender === 'client' || msg.sender === 'user' ? 'Cliente' : 'Sol'}: ${msg.text}`
  ).join('\n');

  // Le inyectamos el guion directo a las reglas del sistema
  const systemWithMemory = `${SOL_SYSTEM_PROMPT}\n\n━━━ HISTORIAL DE CONVERSACIÓN ━━━\n${transcript}\n\nIMPORTANTE: Lee el historial de arriba detalladamente. Extraé el peso, producto y valor FOB de esa charla. NO vuelvas a preguntar lo que el Cliente ya dijo ahí. NO saludes de nuevo si ya hay mensajes previos.`;

  const messages = [{ role: "system", content: systemWithMemory }];

  // Solo le pasamos como "user" el último mensaje
  const lastMsg = conversationHistory[conversationHistory.length - 1];
  const isClient = lastMsg?.sender === "client" || lastMsg?.sender === "user";

  if (imageBase64 && isClient) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: lastMsg.text || "Adjunto imagen." },
        { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
      ]
    });
  } else if (isClient) {
    messages.push({ role: "user", content: lastMsg.text || "" });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "qwen/qwen3.8-27b", // Modelo confirmado por el usuario
        messages: messages,
        temperature: 0.3,
        max_tokens: 1200
      })
    });

    clearTimeout(timeoutId);
    const data = await groqRes.json();

    if (!groqRes.ok && data?.error?.failed_generation) {
      return res.status(200).json({
        intent: "cotizacion",
        suggestedStatus: "Cotizado",
        extractedData: {},
        replyMessage: data.error.failed_generation.replace(/```json/g, "").replace(/```/g, "").trim()
      });
    }

    if (!groqRes.ok) {
      console.error("Fallo de Groq:", data);
      return res.status(500).json({ error: "Fallo Groq", details: data });
    }

    const raw = data?.choices?.[0]?.message?.content?.trim();
    if (!raw) return res.status(502).json({ error: "Respuesta vacía" });

    let parsed;
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("No JSON");
      parsed = JSON.parse(match[0]);
    } catch {
      parsed = { intent: "otro", suggestedStatus: "Faltan Datos", extractedData: {}, replyMessage: raw };
    }

    return res.status(200).json({
      intent: parsed.intent ?? "otro",
      suggestedStatus: parsed.suggestedStatus ?? "Faltan Datos",
      extractedData: parsed.extractedData ?? {},
      replyMessage: parsed.replyMessage ?? raw
    });

  } catch (error) {
    if (error.name === "AbortError") return res.status(504).json({ error: "Timeout del modelo" });
    return res.status(500).json({ error: error.message });
  }
}