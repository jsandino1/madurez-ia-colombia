const SB_URL = process.env.SUPABASE_URL;
const SB_SERVICE = process.env.SUPABASE_SERVICE_KEY;
const RESEND_KEY = process.env.RESEND_KEY;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

const ok  = (d) => ({ statusCode:200, headers:CORS, body:JSON.stringify(d) });
const err = (m,c=400) => ({ statusCode:c, headers:CORS, body:JSON.stringify({error:m}) });

// Llamada a Supabase con service key (privilegiada, solo en servidor)
async function sb(method, path, body=null) {
  const h = {
    'Content-Type':'application/json',
    'apikey': SB_SERVICE,
    'Authorization': `Bearer ${SB_SERVICE}`,
    'Prefer': 'return=representation'
  };
  const opts = { method, headers:h };
  if(body) opts.body = JSON.stringify(body);
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, opts);
  const text = await r.text();
  if(!r.ok) throw new Error(text);
  return text ? JSON.parse(text) : null;
}

// Verificar token JWT de Supabase sin llamada externa
// Decodificamos el payload del JWT para obtener el user_id
function decodeJWT(token) {
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
    // Verificar que no haya expirado
    if(decoded.exp && decoded.exp < Math.floor(Date.now()/1000)) {
      throw new Error('Token expirado');
    }
    // Verificar que sea del proyecto correcto
    if(!decoded.sub) throw new Error('Token inválido');
    return { id: decoded.sub, email: decoded.email, role: decoded.role };
  } catch(e) {
    throw new Error('Token inválido: ' + e.message);
  }
}

exports.handler = async (event) => {
  if(event.httpMethod === 'OPTIONS') return { statusCode:204, headers:CORS, body:'' };
  if(event.httpMethod !== 'POST') return err('Método no permitido', 405);

  let body;
  try { body = JSON.parse(event.body); }
  catch { return err('Body inválido'); }

  const { accion, token } = body;

  try {
    // ── ACCIONES PÚBLICAS ────────────────────────────────────────
    if(accion === 'buscar_sesion') {
      const { codigo } = body;
      if(!codigo) return err('Código requerido');
      const data = await sb('GET', `sesiones?codigo=eq.${codigo.toUpperCase()}&activa=eq.true&select=id,codigo,nombre,descripcion,fecha,hora`);
      if(!data || data.length===0) return err('Sesión no encontrada o inactiva', 404);
      return ok(data[0]);
    }

    if(accion === 'guardar_respuesta') {
      const { sesion_codigo, participante, resultados, respuestas_raw } = body;
      if(!sesion_codigo || !participante) return err('Datos incompletos');
      const sesion = await sb('GET', `sesiones?codigo=eq.${sesion_codigo}&activa=eq.true&select=id`);
      if(!sesion || sesion.length===0) return err('Sesión inactiva', 404);
      const data = await sb('POST', 'respuestas', {
        sesion_codigo,
        nombre: participante.nombre, cargo: participante.cargo,
        empresa: participante.empresa, sector: participante.sector||null,
        correo: participante.correo, tamano: participante.tamano||null,
        departamento: participante.departamento||null, municipio: participante.municipio||null,
        imp: resultados.IMP, nivel: resultados.nivel.nom,
        dim_restrictiva: resultados.DR.nombre, puntaje_dr: resultados.DR.promedio,
        brecha: resultados.brecha,
        dim1: resultados.porDim[0].promedio, dim2: resultados.porDim[1].promedio,
        dim3: resultados.porDim[2].promedio, dim4: resultados.porDim[3].promedio,
        dim5: resultados.porDim[4].promedio,
        respuestas_raw: JSON.stringify(respuestas_raw)
      });
      return ok({ success:true, id:data[0]?.id });
    }

    // ── ACCIONES PROTEGIDAS ──────────────────────────────────────
    let usuario;
    try {
      if(!token) throw new Error('Token requerido');
      usuario = decodeJWT(token);
    } catch(e) {
      return err('No autorizado: ' + e.message, 401);
    }

    if(accion === 'crear_sesion') {
      const { nombre, descripcion, fecha, hora } = body;
      if(!nombre) return err('Nombre requerido');
      const codigo = Math.random().toString(36).substring(2,8).toUpperCase();
      const data = await sb('POST', 'sesiones', {
        codigo, nombre,
        descripcion: descripcion||null,
        fecha: fecha||new Date().toISOString().split('T')[0],
        hora: hora||null,
        instructor_id: usuario.id,
        activa: true
      });
      return ok(data[0]);
    }

    if(accion === 'listar_sesiones') {
      const data = await sb('GET', `sesiones?instructor_id=eq.${usuario.id}&order=creada_en.desc`);
      return ok(data||[]);
    }

    if(accion === 'listar_respuestas') {
      const { sesion_codigo } = body;
      if(!sesion_codigo) return err('Código requerido');
      const sesion = await sb('GET', `sesiones?codigo=eq.${sesion_codigo}&instructor_id=eq.${usuario.id}&select=id`);
      if(!sesion || sesion.length===0) return err('Sin permiso', 403);
      const data = await sb('GET', `respuestas?sesion_codigo=eq.${sesion_codigo}&order=fecha.desc`);
      const sanitizados = (data||[]).map(r=>({
        ...r,
        correo: r.correo ? r.correo.replace(/(.{2}).*(@.*)/, '$1***$2') : null
      }));
      return ok(sanitizados);
    }

    if(accion === 'desactivar_sesion') {
      const { sesion_codigo } = body;
      const sesion = await sb('GET', `sesiones?codigo=eq.${sesion_codigo}&instructor_id=eq.${usuario.id}&select=id`);
      if(!sesion || sesion.length===0) return err('Sin permiso', 403);
      await sb('PATCH', `sesiones?codigo=eq.${sesion_codigo}`, { activa:false });
      return ok({ success:true });
    }

    return err('Acción no reconocida');

  } catch(e) {
    console.error('API error:', e.message);
    return err('Error interno: ' + e.message, 500);
  }
};
