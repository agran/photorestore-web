/* coi-serviceworker v0.1.7 - https://github.com/gzuidhof/coi-serviceworker */
/* SPDX-License-Identifier: MIT */
/*
 * This service worker sets the Cross-Origin-Opener-Policy and
 * Cross-Origin-Embedder-Policy headers needed for SharedArrayBuffer
 * (required for WASM multi-threading).
 */
self.addEventListener("install", function() { self.skipWaiting(); });
self.addEventListener("activate", function(event) {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", function(event) {
  if (event.request.cache === "only-if-cached" && event.request.mode !== "same-origin") return;
  event.respondWith(
    fetch(event.request).then(function(response) {
      if (response.status === 0) return response;
      const newHeaders = new Headers(response.headers);
      newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
      newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");
      newHeaders.set("Cross-Origin-Resource-Policy", "cross-origin");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    })
  );
});
