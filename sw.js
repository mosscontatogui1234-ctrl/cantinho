// Guarda o app no celular pra abrir mesmo sem internet.
const VERSAO = 'cantinho-v1';
const ARQUIVOS = [
  './', 'index.html', 'estilo.css', 'app.js', 'frases.js', 'manifest.json',
  'fontes/fell.woff2', 'fontes/fell-italico.woff2', 'fontes/fell-sc.woff2', 'fontes/nunito.woff2',
  'icones/icone-192.png', 'icones/icone-512.png', 'icones/icone-mascara.png', 'icones/icone-180.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(nomes => Promise.all(nomes.filter(n => n !== VERSAO).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Tenta a internet primeiro (pra pegar versão nova); se demorar ou estiver sem internet, usa a cópia guardada.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSAO);
    const daRede = fetch(req).then(r => {
      if (r && r.ok) cache.put(req, r.clone());
      return r;
    });
    const guardado = await cache.match(req, { ignoreSearch: true });
    if (!guardado) return daRede.catch(() => cache.match('index.html'));
    const demora = new Promise(res => setTimeout(() => res(guardado), 4000));
    return Promise.race([daRede.catch(() => guardado), demora]);
  })());
});
