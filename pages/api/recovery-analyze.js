import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../lib/auth';
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);
const recentCalls = new Map();
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({error:'Método no permitido'});
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({error:'No autorizado'});
  const id = req.body?.contactId;
  if (!id || !/^[\w-]{1,100}$/.test(String(id))) return res.status(400).json({error:'Contacto inválido'});
  const identity = String(session.user.id || session.user.email);
  const key = identity + ':' + id;
  const now = Date.now();
  if (now - (recentCalls.get(key) || 0) < 20000) return res.status(429).json({error:'Esperá 20 segundos antes de analizar nuevamente'});
  recentCalls.set(key, now);
  try {
    let contactQuery = db.from('contacts').select('id,name,phone,status,assigned_to,quote_data,bot_active,updated_at').eq('id', id);
    if (session.user.role !== 'admin') contactQuery = contactQuery.eq('assigned_to',session.user.id);
    const {data:contact,error:ce} = await contactQuery.maybeSingle();
    if (ce) throw ce;
    if (!contact) return res.status(404).json({error:'Contacto no encontrado o sin acceso'});
    const {data:msgs,error:me} = await db.from('messages').select('sender,text,created_at').eq('contact_id',id).order('created_at',{ascending:false}).limit(60);
    if (me) throw me;
    const history = (msgs || []).reverse();
    if (!history.length) return res.status(400).json({error:'Este contacto no tiene mensajes'});
    const transcript = history.map(m=>`${m.sender==='me'?'Empresa':'Cliente'}: ${String(m.text||'').slice(0,500)}`).join('\n').slice(-13000);
    const system = `Sos un analista de recuperación comercial para DE CHINA AL MUNDO (importaciones). Analizá exclusivamente el historial disponible, sin inventar hechos. Detectá interés, objeciones, datos confirmados, señales de no contacto y próximo paso. No presupongas que se cerró una venta. No prometas tarifas, cupos, plazos, descuentos ni promociones. Si el cliente rechazó el contacto o pidió no recibir más mensajes, marcar no_contactar=true y dejar mensaje_sugerido vacío. Si el cliente está esperando conseguir un dato, proponé un seguimiento amable y no insistente. Una sola pregunta por mensaje. Mensaje natural en español argentino, máximo 450 caracteres. No enviar mensajes: solo borrador para aprobación humana. Responder SOLO JSON con: prioridad (alta|media|baja|no_contactar), resumen, objecion, estrategia, mensaje_sugerido, no_contactar (boolean), fundamentos (array máximo 3). Prioridad es una estimación, no certeza.`;
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',headers:{Authorization:`Bearer ${process.env.GROQ_API_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify({model:'qwen/qwen3.8-27b',temperature:0.15,max_completion_tokens:650,response_format:{type:'json_object'},messages:[
        {role:'system',content:system},
        {role:'user',content:`Contacto: ${JSON.stringify({name:contact.name,status:contact.status,quoteData:contact.quote_data,updatedAt:contact.updated_at})}\nHistorial disponible (hasta 60 mensajes):\n${transcript}`}
      ]})
    });
    if (response.status===429) return res.status(429).json({error:'Groq alcanzó el límite de uso. Probá más tarde.'});
    if (!response.ok) throw new Error(`Groq devolvió ${response.status}`);
    const data = await response.json();
    const result = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    const noContact = !!result.no_contactar || result.prioridad==='no_contactar';
    return res.status(200).json({
      prioridad:noContact?'no_contactar':(['alta','media','baja'].includes(result.prioridad)?result.prioridad:'media'),
      resumen:String(result.resumen||'').slice(0,1200),
      objecion:String(result.objecion||'').slice(0,600),
      estrategia:String(result.estrategia||'').slice(0,1000),
      mensaje_sugerido:noContact?'':String(result.mensaje_sugerido||'').slice(0,500),
      no_contactar:noContact,
      fundamentos:Array.isArray(result.fundamentos)?result.fundamentos.slice(0,3).map(x=>String(x).slice(0,300)):[],
      mensajesAnalizados:history.length
    });
  } catch(e) { console.error('recovery-analyze',e); return res.status(500).json({error:'No se pudo analizar este contacto'}); }
}
