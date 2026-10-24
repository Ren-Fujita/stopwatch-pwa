"use strict";

// ファイルを更新したら、バージョンも変更してアプリ一式を入れ替える。
const APP_SCOPE = new URL(self.registration.scope);
const CACHE_PREFIX = `stopwatch-pwa:${APP_SCOPE.href}:`;
const CACHE_NAME = `${CACHE_PREFIX}v12`;
const ASSETS = [
    "./", "./index.html", "./styles.css", "./app.js", "./stopwatch.js",
    "./controller.js", "./storage.js", "./view.js",
    "./lap-list.js", "./lap-export.js", "./export-preview.js",
    "./manifest.webmanifest", "./icons/apple-touch-icon.png", "./icons/icon-192.png",
    "./icons/icon-512.png", "./icons/icon-maskable-512.png"
];

async function cacheApplication() {
    // 全ファイルがそろった時だけインストール成功とする。
    // 計測中の画面を更新しないため、skipWaitingは呼ばない。
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS);
}

async function activateApplication() {
    const names = await caches.keys();
    const oldCaches = names.filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME);
    await Promise.all(oldCaches.map(name => caches.delete(name)));
    await self.clients.claim();
}

function isApplicationRequest(request, url) {
    return request.method === "GET" && url.origin === APP_SCOPE.origin
        && url.pathname.startsWith(APP_SCOPE.pathname);
}

async function getApplicationResponse(request, url) {
    const cache = await caches.open(CACHE_NAME);
    const isAppPage = request.mode === "navigate"
        && [APP_SCOPE.pathname, `${APP_SCOPE.pathname}index.html`].includes(url.pathname);
    const cached = await cache.match(isAppPage ? "./index.html" : request, { ignoreSearch: true });
    return cached || fetch(request);
}

self.addEventListener("install", event => event.waitUntil(cacheApplication()));
self.addEventListener("activate", event => event.waitUntil(activateApplication()));
self.addEventListener("fetch", event => {
    const url = new URL(event.request.url);
    if (isApplicationRequest(event.request, url)) {
        event.respondWith(getApplicationResponse(event.request, url));
    }
});
