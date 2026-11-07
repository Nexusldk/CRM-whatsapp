const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const SYSTEM_CONTEXT = `Sos un asistente experto en comercio exterior argentino, trabajando para "De China al Mundo" (DCAM), una empresa de importación desde China a Argentina.

Tu rol es ayudar al equipo de ventas con consultas técnicas rápidas:
- Cálculo de CBM (metros cúbicos): largo × ancho × alto / 1.000.000
- Posiciones arancelarias según NCM/VUCE de Argentina
- Cálculo de impuestos de importación (DI, TE, IVA, IVA adicional, Percepciones)
- Redacción de mails a proveedores y clientes
- Consultas generales de comercio exterior

IMPORTANTE:
- Respondé SIEMPRE en español argentino, directo y sin vueltas
- Si no estás 100% seguro de una posición arancelaria, decilo: "esto lo tiene que confirmar el despachante"
- NO inventes datos. Si no sabés, decí "no estoy seguro"
- Sé conciso: máximo 5-6 renglones, salvo que te pidan detalle
- Cuando calcules CBM, mostrá la fórmula y el resultado
- Usá las posiciones NCM de Argentina (no de México ni de otro país)

CONOCIMIENTO DCAM:
- Bodega Guangzhou: 广州市荔湾区南围路12号12-3门, contacto Karen (19502006887)
- Destino: depósito Sarandí (Avellaneda)
- Tránsito marítimo: 45-65 días. Aéreo: 7-15 días hábiles.
`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function askGemini(prompt, maxRetries = 3) {
  if (!GEMINI_API_KEY) {
    throw new Error('Falta GEMINI_API_KEY en .env.local');
  }

  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: SYSTEM_CONTEXT }],
            },
            contents: [
              {
                role: 'user',
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 2000,
            },
          }),
        }
      );

      if (res.status === 503) {
        lastError = new Error('Gemini saturado');
        const waitMs = attempt * 2000;
        console.log(`⏳ Gemini 503, esperando ${waitMs / 1000}s (intento ${attempt}/${maxRetries})...`);
        await sleep(waitMs);
        continue;
      }

      if (res.status === 429) {
        lastError = new Error('Gemini rate limit');
        const waitMs = attempt * 3000;
        await sleep(waitMs);
        continue;
      }

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Gemini error: ${err}`);
      }

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text || text.length < 5) {
        lastError = new Error('Respuesta vacía');
        if (attempt < maxRetries) {
          await sleep(1000 * attempt);
          continue;
        }
      }

      return text || 'Sin respuesta';
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        await sleep(1000 * attempt);
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('Gemini no respondió');
}