# Lukáš Hála – portfolio (ukázka)

Statický web + malé API na Cloudflare Workers.

- `public/` – web (`index.html`), administrace (`admin/`), fotky (`img/`), sdílený renderer (`site.js`) a výchozí data (`data.js`)
- `src/worker.js` – API: přihlášení, koncept, zveřejnění, historie, nahrávání fotek (KV `KV`)
- `wrangler.jsonc` – konfigurace (KV namespace `lukashala-content`)

Administrace běží na `/admin`. Ukázkové heslo je v `src/worker.js` (`PASSWORD`).

Lokálně: `npm install && npx wrangler dev`
