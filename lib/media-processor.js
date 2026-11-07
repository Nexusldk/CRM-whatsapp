// ============================================================
// PROCESADOR DE MEDIA - Audio, Imagen, PDF, Links
// ============================================================
// Convierte cualquier tipo de mensaje a texto + imagen base64
// para que Sol pueda procesarlo.
// ============================================================

// ------------------------------------------------------------
// AUDIO → TEXTO (Whisper vía API de Groq)
// ------------------------------------------------------------
export async function transcribeAudio(audioBuffer) {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      console.error('Falta GROQ_API_KEY en .env.local');
      return '';
    }

    // Construir FormData para enviar el audio
    const formData = new FormData();
    const blob = new Blob([audioBuffer], { type: 'audio/ogg' });
    formData.append('file', blob, 'audio.ogg');
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('language', 'es');
    formData.append('response_format', 'json');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Error de Whisper:', err);
      return '';
    }

    const data = await res.json();
    return data.text || '';
  } catch (error) {
    console.error('Error transcribiendo audio:', error.message);
    return '';
  }
}

// ------------------------------------------------------------
// IMAGEN → BASE64 (para modelo de visión)
// ------------------------------------------------------------
export function imageToBase64(imageBuffer) {
  return imageBuffer.toString('base64');
}

// ------------------------------------------------------------
// PDF → TEXTO (con pdf-parse)
// ------------------------------------------------------------
export async function extractTextFromPdf(pdfBuffer) {
  try {
    const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default;
    const data = await pdfParse(pdfBuffer);
    return data.text || '';
  } catch (error) {
    console.error('Error extrayendo texto de PDF:', error.message);
    return '';
  }
}

// ------------------------------------------------------------
// LINK → TEXTO (scraping básico)
// ------------------------------------------------------------
export async function extractFromLink(url) {
  try {
    if (!url.includes('alibaba') && !url.includes('1688')) {
      return { text: '', title: '', price: '' };
    }

    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      },
    });

    if (!res.ok) return { text: '', title: '', price: '' };

    const html = await res.text();

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';

    const priceMatch =
      html.match(/US\s*\$\s*([\d,.]+)/i) || html.match(/\$\s*([\d,.]+)/i);
    const price = priceMatch ? priceMatch[1] : '';

    const descMatch = html.match(
      /<meta[^>]*name="description"[^>]*content="([^"]+)"/i
    );
    const description = descMatch ? descMatch[1] : '';

    const text = [
      title ? `Título: ${title}` : '',
      price ? `Precio: USD ${price}` : '',
      description ? `Descripción: ${description}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return { text, title, price };
  } catch (error) {
    console.error('Error extrayendo link:', error.message);
    return { text: '', title: '', price: '' };
  }
}