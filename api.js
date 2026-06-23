// ================================================================
// MadurezIA Colombia — API Function segura
// Todas las operaciones de BD pasan por aquí con Service Role Key
// Las claves secretas NUNCA llegan al navegador
// ================================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_KEY = process.env.RESEND_KEY;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

// Helper: respuesta JSON
const ok = (data) => ({ statusCode: 200, headers: CORS, body: JSON.stringify(data) });
const err = (msg, code = 400) => ({ statusCode: code, headers: CORS, body: JSON.stringify({ error: msg }) });

// Helper: llamada a Supabase con Service Role Key (privilegiada)
async function sb(method, path, body = null, token = null) {
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_SERVICE_KEY,
    // Si hay token de usuario, lo usamos para respetar RLS; si no, usamos service key
    'Authorization': token ? `Bearer ${token}` : `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Prefer': 'return=representation'
  };
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, opts);
  const text = await r.text();
  if (!r.ok) throw new Error(text);
  return text ? JSON.parse(text) : null;
}

// Helper: verificar token de usuario con Supabase Auth
async function verificarToken(token) {
  if (!token) throw new Error('Token requerido');
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'apikey': SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${token}` }
  });
  if (!r.ok) throw new Error('Token inválido o expirado');
  return r.json();
}

exports.handler = async (event) => {
  // Preflight CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return err('Método no permitido', 405);
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return err('Body inválido');
  }

  const { accion, token } = body;

  try {
    // ── ACCIONES PÚBLICAS (no requieren auth) ────────────────────
    
    // Buscar sesión por código (participante ingresa su código)
    if (accion === 'buscar_sesion') {
      const { codigo } = body;
      if (!codigo) return err('Código requerido');
      const data = await sb('GET', `sesiones?codigo=eq.${codigo.toUpperCase()}&activa=eq.true&select=id,codigo,nombre,descripcion,fecha,hora`);
      if (!data || data.length === 0) return err('Sesión no encontrada o inactiva', 404);
      return ok(data[0]);
    }

    // Guardar respuesta de participante
    if (accion === 'guardar_respuesta') {
      const { sesion_codigo, participante, resultados, respuestas_raw } = body;
      if (!sesion_codigo || !participante) return err('Datos incompletos');

      // Verificar que la sesión existe y está activa
      const sesion = await sb('GET', `sesiones?codigo=eq.${sesion_codigo}&activa=eq.true&select=id`);
      if (!sesion || sesion.length === 0) return err('Sesión inactiva o no existe', 404);

      const data = await sb('POST', 'respuestas', {
        sesion_codigo,
        nombre: participante.nombre,
        cargo: participante.cargo,
        empresa: participante.empresa,
        sector: participante.sector || null,
        correo: participante.correo,
        tamano: participante.tamano || null,
        departamento: participante.departamento || null,
        municipio: participante.municipio || null,
        imp: resultados.IMP,
        nivel: resultados.nivel.nom,
        dim_restrictiva: resultados.DR.nombre,
        puntaje_dr: resultados.DR.promedio,
        brecha: resultados.brecha,
        dim1: resultados.porDim[0].promedio,
        dim2: resultados.porDim[1].promedio,
        dim3: resultados.porDim[2].promedio,
        dim4: resultados.porDim[3].promedio,
        dim5: resultados.porDim[4].promedio,
        respuestas_raw: JSON.stringify(respuestas_raw)
      });
      return ok({ success: true, id: data[0]?.id });
    }

    // ── ACCIONES PROTEGIDAS (requieren token de instructor) ──────

    // Verificar identidad del instructor para todas las acciones siguientes
    let usuario;
    try {
      usuario = await verificarToken(token);
    } catch (e) {
      return err('No autorizado. Inicie sesión nuevamente.', 401);
    }

    // Crear sesión
    if (accion === 'crear_sesion') {
      const { nombre, descripcion, fecha, hora } = body;
      if (!nombre) return err('Nombre requerido');

      // Generar código único
      const codigo = Math.random().toString(36).substring(2, 8).toUpperCase();

      const data = await sb('POST', 'sesiones', {
        codigo,
        nombre,
        descripcion: descripcion || null,
        fecha: fecha || new Date().toISOString().split('T')[0],
        hora: hora || null,
        instructor_id: usuario.id,
        activa: true
      });
      return ok(data[0]);
    }

    // Listar sesiones del instructor
    if (accion === 'listar_sesiones') {
      const data = await sb('GET', `sesiones?instructor_id=eq.${usuario.id}&order=creada_en.desc`);
      return ok(data || []);
    }

    // Obtener respuestas de una sesión (solo si es del instructor)
    if (accion === 'listar_respuestas') {
      const { sesion_codigo } = body;
      if (!sesion_codigo) return err('Código de sesión requerido');

      // Verificar que la sesión pertenece al instructor
      const sesion = await sb('GET', `sesiones?codigo=eq.${sesion_codigo}&instructor_id=eq.${usuario.id}&select=id`);
      if (!sesion || sesion.length === 0) return err('Sesión no encontrada o sin permiso', 403);

      const data = await sb('GET', `respuestas?sesion_codigo=eq.${sesion_codigo}&order=fecha.desc`);
      // Omitir correos en la respuesta para mayor privacidad (el instructor ve los datos pero no los correos completos)
      const sanitizados = (data || []).map(r => ({
        ...r,
        correo: r.correo ? r.correo.replace(/(.{2}).*(@.*)/, '$1***$2') : null
      }));
      return ok(sanitizados);
    }

    // Desactivar sesión
    if (accion === 'desactivar_sesion') {
      const { sesion_codigo } = body;
      // Verificar propiedad
      const sesion = await sb('GET', `sesiones?codigo=eq.${sesion_codigo}&instructor_id=eq.${usuario.id}&select=id`);
      if (!sesion || sesion.length === 0) return err('Sin permiso', 403);
      await sb('PATCH', `sesiones?codigo=eq.${sesion_codigo}`, { activa: false });
      return ok({ success: true });
    }

    return err('Acción no reconocida');

  } catch (e) {
    console.error('API error:', e.message);
    return err(`Error interno: ${e.message}`, 500);
  }
};
