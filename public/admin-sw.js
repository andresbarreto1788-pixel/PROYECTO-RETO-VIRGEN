// Service worker mínimo, solo para cumplir el requisito de instalabilidad de PWA en
// el panel administrativo — no cachea nada, cada request va directo a la red.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
