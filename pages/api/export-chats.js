import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../lib/auth';
import { createClient } from '@supabase/supabase-js';
const db=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY);
const safe = v => {const s=String(v??'').replace(/\r?\n/g,' ').replace(/"/g,'""');return `"${/^[\s]*[=+@\-\t\r]/.test(s)?"'"+s:s}"`;};
export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Método no permitido'});
  const session=await getServerSession(req,res,authOptions);
  if(!session) return res.status(401).json({error:'No autorizado'});
  try {
    const contacts=[];
    for(let offset=0;;offset+=500){
      let q=db.from('contacts').select('id,name,phone,status,assigned_to,quote_data').order('id',{ascending:true}).range(offset,offset+499);
      if(session.user.role!=='admin') q=q.eq('assigned_to',session.user.id);
      const {data,error}=await q;if(error)throw error;
      contacts.push(...(data||[])); if(!data||data.length<500)break;
      if(contacts.length>15000) throw new Error('Demasiados contactos para una exportación');
    }
    const header=['Contacto ID','Nombre','Teléfono','Estado','Vendedor ID','Producto','Peso kg','Volumen m3','FOB USD','Fecha','Remitente','Mensaje'];
    const rows=[header.map(safe).join(',')];
    let count=0;
    for(const c of contacts){
      for(let offset=0;;offset+=500){
        const {data,error}=await db.from('messages').select('sender,text,created_at,id').eq('contact_id',c.id).order('id',{ascending:true}).range(offset,offset+499);
        if(error)throw error;
        for(const m of data||[]){
          rows.push([c.id,c.name,c.phone,c.status,c.assigned_to,c.quote_data?.product,c.quote_data?.weightKg,c.quote_data?.cbm,c.quote_data?.goodsValue,m.created_at,m.sender,m.text].map(safe).join(','));
          count++; if(count>100000) throw new Error('Exportación demasiado grande; solicitá exportación por partes');
        }
        if(!data||data.length<500)break;
      }
    }
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition','attachment; filename="crm-dcam-conversaciones.csv"');
    res.setHeader('Cache-Control','no-store');
    return res.status(200).send('\uFEFF'+rows.join('\r\n'));
  }catch(e){console.error('export-chats',e);return res.status(500).json({error:'No se pudo exportar. Si hay muchos mensajes, necesitás una exportación por lotes.'});}
}
