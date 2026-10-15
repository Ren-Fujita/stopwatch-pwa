"use strict";

// ファイルを更新したら、バージョンも変更してアプリ一式を入れ替える。
const CACHE_PREFIX = `stopwatch-pwa:${self.registration.scope}:`;
const CACHE_NAME = `${CACHE_PREFIX}v2`;
const ASSETS = [
    "./", "./index.html", "./styles.css", "./app.js", "./stopwatch.js",
    "./manifest.webmanifest", "./icons/apple-touch-icon.png", "./icons/icon-192.png",
    "./icons/icon-512.png", "./icons/icon-maskable-512.png"
];

self.addEventListener("install", event => {
    // 全ファイルがそろった時だけインストール成功とする。
    // 計測中の画面を更新しないため、skipWaitingは呼ばない。
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
            .map(name => caches.delete(name)));
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", event => {
    const url = new URL(event.request.url);
    const scope = new URL(self.registration.scope);
    if (event.request.method !== "GET" || url.origin !== scope.origin
        || !url.pathname.startsWith(scope.pathname)) return;

    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        const isAppPage = event.request.mode === "navigate"
            && [scope.pathname, `${scope.pathname}index.html`].includes(url.pathname);
        const cached = await cache.match(isAppPage ? "./index.html" : event.request, { ignoreSearch: true });
        return cached || fetch(event.request);
    })());
});
