// Sanctuary offline support: keeps the app itself (not the church's data) on this computer, so the
// count screen still opens if the internet drops. Data is never cached here: offerings entered while
// offline wait in the page's own queue and are sent when the connection is back.
const CACHE = 'sanctuary-app-v3'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/brand/logo.svg'])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  // The API, member links, videos and uploads always go to the network.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/tutorials/')) return

  if (req.mode === 'navigate') {
    // Pages: try the network first, fall back to the saved app.
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone()
        caches.open(CACHE).then((c) => c.put('/', copy))
        return res
      }).catch(() => caches.match('/')),
    )
    return
  }
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/brand/') || url.pathname.startsWith('/fonts/')) {
    // Built files have a fingerprint in their name, so a saved copy is always the right one.
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) }
        return res
      })),
    )
  }
})
