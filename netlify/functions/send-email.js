// ================================================================
// MadurezIA Colombia — Función de envío de correos
// Usa RESEND_KEY desde variables de entorno (nunca expuesta al navegador)
// ================================================================

const RESEND_KEY = process.env.RESEND_KEY;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Método no permitido' }) };
  }

  try {
    const { to, subject, html, attachments } = JSON.parse(event.body);

    if (!to || !subject || !html) {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Faltan campos requeridos' }) };
    }

    const payload = {
      from: 'MadurezIA Colombia <onboarding@resend.dev>',
      to: [to],
      subject,
      html,
      ...(attachments && { attachments })
    };

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const data = await r.json();

    if (!r.ok) {
      console.error('Resend error:', data);
      return { statusCode: r.status, headers: CORS, body: JSON.stringify({ error: data }) };
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true, id: data.id }) };

  } catch (e) {
    console.error('Function error:', e);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: e.message }) };
  }
};
