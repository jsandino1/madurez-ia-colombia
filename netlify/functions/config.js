exports.handler = async () => {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    },
    body: JSON.stringify({
      sb_url: process.env.SUPABASE_URL,
      sb_key: process.env.SUPABASE_ANON_KEY
    })
  };
};
