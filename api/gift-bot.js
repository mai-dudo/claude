// Бот «КД подарка» для Vercel: в личку присылают ссылку t.me/nft/…, бот отвечает, сколько ждать до передачи.
// Telegram отдаёт дату КД только владельцу подарка, поэтому владелец подключает бота к своему аккаунту
// (Настройки → Telegram для бизнеса → Чат-боты, нужен Telegram Premium) и разрешает просмотр подарков.
// По чужой ссылке бот показывает только публичные данные со страницы t.me/nft/….
// Переменные: GIFT_BOT_TOKEN, GIFT_BOT_SECRET (секрет вебхука), UPSTASH_REDIS_REST_URL и UPSTASH_REDIS_REST_TOKEN
// (какой пользователь к какому бизнес-подключению относится), GIFT_BOT_TZ (часовой пояс, по умолчанию Europe/Moscow).
// Вебхук ставится скриптом scripts/set-gift-bot-webhook.mjs.

const MAX_LINKS = 5;
const MAX_GIFT_PAGES = 10;
const SLUG = String.raw`[\w-]+-\d+`;
const LINK_RE = new RegExp(String.raw`(?:(?:https?://)?(?:t\.me|telegram\.me|telegram\.dog)/nft/|tg://nft\?slug=)(${SLUG})`, 'gi');
const BARE_SLUG_RE = new RegExp(`^(${SLUG})$`);

const HELP = [
  'Пришлите ссылку на подарок вида t.me/nft/PlushPepe-1, можно несколько в одном сообщении.',
  '',
  'Telegram показывает КД только владельцу подарка. Чтобы бот видел КД ваших подарков, подключите его:',
  'Настройки → Telegram для бизнеса → Чат-боты → этот бот, и разрешите ему просмотр подарков и звёзд.',
  'Для этого нужен Telegram Premium.',
].join('\n');
const CONNECT_HINT = 'Чтобы видеть КД своих подарков, подключите бота: Настройки → Telegram для бизнеса → Чат-боты '
  + '(нужен Telegram Premium), и разрешите ему просмотр подарков и звёзд.';
const RIGHTS_HINT = 'Бот подключён, но у него нет права на просмотр подарков. Включите его: Настройки → '
  + 'Telegram для бизнеса → Чат-боты → этот бот.';

export function extractSlugs(message) {
  const text = message.text || message.caption || '';
  const sources = [text];
  for (const e of message.entities || message.caption_entities || []) {
    if (e.type === 'text_link') sources.push(e.url);
  }
  const found = sources.flatMap((s) => [...s.matchAll(LINK_RE)].map((m) => m[1]));
  const bare = text.trim().match(BARE_SLUG_RE);
  if (!found.length && bare) found.push(bare[1]);

  const seen = new Set();
  return found.filter((slug) => {
    const key = slug.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, MAX_LINKS);
}

export function formatLeft(seconds) {
  if (seconds < 60) return 'меньше минуты';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [d && `${d} д`, h && `${h} ч`, m && `${m} мин`].filter(Boolean).join(' ');
}

const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const decodeHtml = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

export function createBot({
  token,
  redisUrl,
  redisToken,
  timeZone = 'Europe/Moscow',
  keyPrefix = 'giftbot',
  fetch = globalThis.fetch,
  now = () => Date.now(),
}) {
  const dateFormat = new Intl.DateTimeFormat('ru-RU', {
    timeZone, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });
  const connectionKey = (userId) => `${keyPrefix}:bc:${userId}`;

  async function tg(method, params) {
    const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await r.json();
    if (!data.ok) throw new Error(`${method}: ${data.description || `HTTP ${r.status}`}`);
    return data.result;
  }

  async function redis(command) {
    const r = await fetch(redisUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command),
    });
    if (!r.ok) throw new Error(`Upstash HTTP ${r.status}`);
    return (await r.json()).result;
  }

  const reply = (chatId, text) => tg('sendMessage', {
    chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true },
  });

  async function onConnection(bc) {
    if (bc.is_enabled) await redis(['SET', connectionKey(bc.user.id), bc.id]);
    else await redis(['DEL', connectionKey(bc.user.id)]);

    const text = !bc.is_enabled ? 'Бот отключён от аккаунта. КД ваших подарков он больше не видит.'
      : bc.rights?.can_view_gifts_and_stars ? 'Бот подключён. Присылайте ссылку на подарок — покажу КД.'
      : RIGHTS_HINT;
    await reply(bc.user_chat_id, text);
  }

  // Подключение берётся из Redis, но проверяется у Telegram: запись могла устареть.
  async function userConnection(userId) {
    const id = await redis(['GET', connectionKey(userId)]);
    if (!id) return null;
    try {
      const bc = await tg('getBusinessConnection', { business_connection_id: id });
      return bc.is_enabled && bc.user.id === userId ? bc : null;
    } catch {
      return null;
    }
  }

  async function ownedUniqueGifts(connectionId) {
    const gifts = new Map();
    let offset = '';
    for (let page = 0; page < MAX_GIFT_PAGES; page++) {
      const res = await tg('getBusinessAccountGifts', {
        business_connection_id: connectionId,
        exclude_unlimited: true,
        exclude_limited_upgradable: true,
        exclude_limited_non_upgradable: true,
        limit: 100,
        offset,
      });
      for (const owned of res.gifts) {
        if (owned.type === 'unique') gifts.set(owned.gift.name.toLowerCase(), owned);
      }
      if (!res.next_offset) break;
      offset = res.next_offset;
    }
    return gifts;
  }

  // Публичная страница подарка: null, если такого подарка нет (t.me отвечает редиректом).
  async function publicGift(slug) {
    const r = await fetch(`https://t.me/nft/${encodeURIComponent(slug)}`, { redirect: 'manual' });
    if (r.status !== 200) return null;
    const html = await r.text();
    if (!html.includes('tgme_gift_table')) return null;
    const title = html.match(/<meta property="og:title" content="([^"]*)"/)?.[1];
    const owner = html.match(/<tr><th>Owner<\/th><td>([\s\S]*?)<\/td><\/tr>/)?.[1];
    return {
      title: title ? decodeHtml(title) : slug,
      owner: owner ? decodeHtml(owner.replace(/<[^>]+>/g, '')).trim() : null,
    };
  }

  function describeOwned(owned) {
    const g = owned.gift;
    const lines = [`🎁 <b>${escapeHtml(`${g.base_name} #${g.number}`)}</b> — ваш подарок`];
    if (g.is_from_blockchain) {
      lines.push('⛓ Подарок привязан из блокчейна TON: в Telegram его нельзя передать или продать, только через Fragment.');
      return lines.join('\n');
    }
    const left = (owned.next_transfer_date || 0) - Math.floor(now() / 1000);
    if (left > 0) {
      lines.push(`⏳ КД на передачу: ещё ${formatLeft(left)}`);
      lines.push(`Передать можно будет ${dateFormat.format(new Date(owned.next_transfer_date * 1000))}`);
    } else {
      lines.push('✅ КД на передачу нет — подарок можно передать сейчас.');
    }
    if (owned.transfer_star_count) lines.push(`Передача стоит ${owned.transfer_star_count} ⭐`);
    return lines.join('\n');
  }

  async function describe(slug, owned) {
    if (owned) return describeOwned(owned);
    const gift = await publicGift(slug);
    if (!gift) return `❓ Подарок ${escapeHtml(slug)} не найден. Проверьте ссылку.`;
    const lines = [`🎁 <b>${escapeHtml(gift.title)}</b>`];
    if (gift.owner) lines.push(`Владелец: ${escapeHtml(gift.owner)}`);
    lines.push('КД этого подарка видит только его владелец, по ссылке его узнать нельзя.');
    return lines.join('\n');
  }

  async function onMessage(msg) {
    const slugs = extractSlugs(msg);
    if (!slugs.length) return reply(msg.chat.id, HELP);

    const bc = await userConnection(msg.from.id);
    const canView = Boolean(bc?.rights?.can_view_gifts_and_stars);
    const owned = canView ? await ownedUniqueGifts(bc.id) : new Map();

    const parts = [];
    for (const slug of slugs) parts.push(await describe(slug, owned.get(slug.toLowerCase())));
    if (!bc) parts.push(CONNECT_HINT);
    else if (!canView) parts.push(RIGHTS_HINT);
    return reply(msg.chat.id, parts.join('\n\n'));
  }

  async function handleUpdate(update) {
    if (update.business_connection) return onConnection(update.business_connection);
    const msg = update.message;
    if (!msg?.from || msg.chat.type !== 'private') return;
    try {
      await onMessage(msg);
    } catch (err) {
      await reply(msg.chat.id, `Не получилось проверить подарок: ${escapeHtml(err.message || err)}`);
      throw err;
    }
  }

  return { handleUpdate };
}

export default async function handler(req, res) {
  const { GIFT_BOT_TOKEN, GIFT_BOT_SECRET, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, GIFT_BOT_TZ } = process.env;
  if (!GIFT_BOT_TOKEN || !GIFT_BOT_SECRET || !UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
    return res.status(404).json({ error: 'bot is not configured' });
  }
  if (req.method !== 'POST') return res.status(405).end();
  if (req.headers['x-telegram-bot-api-secret-token'] !== GIFT_BOT_SECRET) return res.status(401).end();

  const bot = createBot({
    token: GIFT_BOT_TOKEN,
    redisUrl: UPSTASH_REDIS_REST_URL,
    redisToken: UPSTASH_REDIS_REST_TOKEN,
    timeZone: GIFT_BOT_TZ || undefined,
  });
  try {
    await bot.handleUpdate(req.body || {});
  } catch (err) {
    console.error(err);
  }
  // Всегда 200, иначе Telegram будет повторять то же обновление.
  return res.status(200).json({ ok: true });
}
