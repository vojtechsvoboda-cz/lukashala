/* Lukáš Hála portfolio: static site + small content API.
   KV keys: pub (published site JSON), draft (admin draft), hist (list of {t,msgs,key}), hist:<ts> (snapshot),
   img:<id> (uploaded WebP, metadata {w,h,type}), secret (random HMAC key, created on first use). */

const PASSWORD = 'lukashala';          // demo password for /admin
const SESSION_DAYS = 30;

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra } });

async function secret(env) {
  let s = await env.KV.get('secret');
  if (!s) { s = [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join(''); await env.KV.put('secret', s); }
  return s;
}
async function sign(env, msg) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(await secret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, c => ({ '+': '-', '/': '_', '=': '' }[c]));
}
function cookie(req, name) {
  const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
async function authed(req, env) {
  const c = cookie(req, 'lh_session'); if (!c) return false;
  const [exp, sig] = c.split('.'); if (!exp || !sig || Date.now() > +exp) return false;
  return sig === await sign(env, 'admin:' + exp);
}
async function session(env) {
  const exp = Date.now() + SESSION_DAYS * 864e5;
  return `lh_session=${exp}.${await sign(env, 'admin:' + exp)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`;
}
async function readJSON(env, key, fallback = null) {
  const v = await env.KV.get(key, 'json'); return v == null ? fallback : v;
}

async function api(req, env, url) {
  const p = url.pathname, m = req.method;
  if (!env.KV) return json({ error: 'Úložiště není připojené.' }, 503);

  if (p === '/api/site' && m === 'GET') {
    const pub = await env.KV.get('pub');
    return pub ? new Response(pub, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }) : json(null, 200);
  }
  if (p === '/api/login' && m === 'POST') {
    const b = await req.json().catch(() => ({}));
    if (String(b.password || '').trim().toLowerCase() !== PASSWORD) return json({ error: 'Nesprávné heslo.' }, 401);
    return json({ ok: true }, 200, { 'set-cookie': await session(env) });
  }
  if (p === '/api/logout' && m === 'POST') return json({ ok: true }, 200, { 'set-cookie': 'lh_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' });
  if (p === '/api/me') return json({ ok: await authed(req, env) });

  if (!(await authed(req, env))) return json({ error: 'Přihlášení vypršelo.' }, 401);

  if (p === '/api/state' && m === 'GET') {
    const [draft, pub, hist] = await Promise.all([readJSON(env, 'draft'), readJSON(env, 'pub'), readJSON(env, 'hist', [])]);
    return json({ draft, pub, hist });
  }
  if (p === '/api/draft' && m === 'PUT') {
    const body = await req.text(); if (body.length > 2e6) return json({ error: 'Koncept je příliš velký.' }, 413);
    await env.KV.put('draft', body); return json({ ok: true });
  }
  if (p === '/api/publish' && m === 'POST') {
    const b = await req.json();
    const t = Date.now(), snap = JSON.stringify(b.site);
    await env.KV.put('pub', snap); await env.KV.put('draft', snap); await env.KV.put('hist:' + t, snap);
    let hist = await readJSON(env, 'hist', []);
    hist.unshift({ t, msgs: (b.msgs || []).slice(0, 20), key: 'hist:' + t });
    const drop = hist.slice(16); hist = hist.slice(0, 16);
    await env.KV.put('hist', JSON.stringify(hist));
    await Promise.all(drop.map(h => env.KV.delete(h.key)));
    return json({ ok: true, hist });
  }
  if (p === '/api/restore' && m === 'POST') {
    const b = await req.json(); const snap = await env.KV.get(String(b.key || ''));
    if (!snap) return json({ error: 'Verze už není k dispozici.' }, 404);
    await env.KV.put('draft', snap); return json({ ok: true, draft: JSON.parse(snap) });
  }
  if (p === '/api/upload' && m === 'POST') {
    const buf = await req.arrayBuffer(); if (buf.byteLength > 4e6) return json({ error: 'Fotka je po zmenšení pořád moc velká.' }, 413);
    const id = 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const w = +url.searchParams.get('w') || 0, h = +url.searchParams.get('h') || 0, type = req.headers.get('content-type') || 'image/webp';
    await env.KV.put('img:' + id, buf, { metadata: { w, h, type } });
    return json({ id, src: '/u/' + id, w, h, bytes: buf.byteLength });
  }
  if (p === '/api/reset' && m === 'POST') {
    const hist = await readJSON(env, 'hist', []);
    await Promise.all(['pub', 'draft', 'hist', ...hist.map(h => h.key)].map(k => env.KV.delete(k)));
    let cursor; do { const l = await env.KV.list({ prefix: 'img:', cursor }); await Promise.all(l.keys.map(k => env.KV.delete(k.name))); cursor = l.list_complete ? null : l.cursor; } while (cursor);
    return json({ ok: true });
  }
  return json({ error: 'Not found' }, 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith('/api/')) return await api(req, env, url);
      if (url.pathname.startsWith('/u/')) {
        if (!env.KV) return new Response('Not found', { status: 404 });
        const { value, metadata } = await env.KV.getWithMetadata('img:' + url.pathname.slice(3), 'arrayBuffer');
        if (!value) return new Response('Not found', { status: 404 });
        return new Response(value, { headers: { 'content-type': (metadata && metadata.type) || 'image/webp', 'cache-control': 'public, max-age=31536000, immutable' } });
      }
      if (url.pathname === '/admin') return Response.redirect(url.origin + '/admin/', 301);
      return env.ASSETS.fetch(req);
    } catch (e) {
      return json({ error: 'Chyba serveru: ' + (e && e.message || e) }, 500);
    }
  }
};
