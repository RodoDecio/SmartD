const CACHE_NAME = 'smart-d-root-v1';
// Cacheamos apenas os arquivos vitais para o Login abrir rápido
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/config.js',
  '/js/auth_guard.js',
  '/admin/css/style.css' // Assumindo que o login usa este CSS
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        console.log('Erro ao cachear arquivos da raiz:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // ESTRATÉGIA DE SEGURANÇA: Network First (Rede Primeiro)
  // Tenta buscar na rede sempre. Só usa cache se a rede falhar E se for um arquivo da raiz.
  // Isso impede que ele tente entregar o index.html da raiz quando você quer um arquivo do /app/
  
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});