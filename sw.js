// ---------------------------------------------------------------------------
// Service Worker — damit die App auch ohne Netz startet.
//
// Sie braucht das Netz ohnehin nur zum Laden: die Daten liegen im lokalen
// Modus auf dem Gerät, und der Systemzustand wird bei jedem Blick neu
// berechnet. Ohne diese Datei müsste das Handy jedes Mal den Server erreichen.
//
// Bewusst schlicht: eine Version, ein Cache, "erst aus dem Cache, dann im
// Hintergrund erneuern". Kein Precache-Manifest — die Dateinamen tragen einen
// Hash, und ein veraltetes Manifest wäre schlimmer als gar keins.
// ---------------------------------------------------------------------------

// Bei jedem Stand hochzaehlen, der aelter gecachte Dateien ersetzen soll —
// sonst laeuft auf dem Handy die vorige Version weiter.
const CACHE = 'enuvia-together-v2'

// Alles relativ zum Scope: die App kann unter / liegen oder unter einem
// Unterpfad, und derselbe Build funktioniert in beiden Faellen.
const ROOT = new URL('./', self.registration.scope)
const url = (path) => new URL(path, ROOT).toString()
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'].map(url)
const INDEX = url('./index.html')

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Seitenaufrufe: erst das Netz, bei Funkloch die gespeicherte Hülle.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(INDEX, copy))
          return response
        })
        .catch(() => caches.match(INDEX)),
    )
    return
  }

  // Alles andere: sofort aus dem Cache, im Hintergrund erneuern.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(CACHE).then((cache) => cache.put(request, copy))
          }
          return response
        })
        .catch(() => cached)
      return cached ?? network
    }),
  )
})
