const SB_URL = process.env.SUPABASE_URL;
const SB_ANON = process.env.SUPABASE_ANON_KEY;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  try {
    const { accion, email, password } = JSON.parse(event.body);

    if (accion === 'login') {
      const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SB_ANON },
        body: JSON.stringify({ email, password })
      });
      const d = await r.json();
      if (!r.ok) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: d.msg || d.error_description || 'Credenciales inválidas' }) };
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ token: d.access_token, user: d.user }) };
    }

    if (accion === 'registro') {
      const r = await fetch(`${SB_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SB_ANON },
        body: JSON.stringify({ email, password })
      });
      const d = await r.json();
      if (!r.ok) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: d.msg || 'Error al registrarse' }) };
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Acción no reconocida' }) };

  } catch (e) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
