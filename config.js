// Endpoint público que devuelve solo las credenciales del lado cliente
// La Service Key NUNCA se expone aquí
exports.handler = async () => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600'
    },
    body: JSON.stringify({
      sb_url: process.env.SUPABASE_URL,
      sb_key: process.env.SUPABASE_PUBLISHABLE_KEY
    })
  };
};
