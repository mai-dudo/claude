// Счётчик уникальных визитов для Vercel: один IP — один визит.
// Хранилище — Upstash Redis (бесплатный план). Задайте в настройках проекта Vercel переменные
// UPSTASH_REDIS_REST_URL и UPSTASH_REDIS_REST_TOKEN; без них ответ 404, и на сайте показывается «—».
export default async function handler(req, res) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  res.setHeader('Cache-Control', 'no-store');
  if (!url || !token) return res.status(404).json({ error: 'counter is not configured' });

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || 'unknown';
  const key = process.env.VISITS_KEY || 'visits:ips';
  const commands = req.method === 'POST' ? [['SADD', key, ip], ['SCARD', key]] : [['SCARD', key]];

  try {
    const r = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands),
    });
    if (!r.ok) throw new Error(`Upstash HTTP ${r.status}`);
    const data = await r.json();
    const visits = Number(data[data.length - 1]?.result ?? 0);
    return res.status(200).json({ visits });
  } catch (err) {
    return res.status(502).json({ error: String(err.message || err) });
  }
}
