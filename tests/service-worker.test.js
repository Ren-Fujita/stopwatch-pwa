import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync, existsSync } from "node:fs";

const source = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
function worker(scope) {
    const handlers = {};
    const stores = new Map();
    let online = true;
    let claimed = false;
    const resolve = value => new URL(typeof value === "string" ? value : value.url, scope).href;
    const caches = {
        async open(name) {
            if (!stores.has(name)) stores.set(name, new Map());
            const store = stores.get(name);
            return {
                async addAll(assets) {
                    for (const asset of assets) {
                        if (asset !== "./") assert.ok(existsSync(new URL(`../${asset}`, import.meta.url)), asset);
                        store.set(resolve(asset), `cached:${asset}`);
                    }
                },
                async match(request, options = {}) {
                    const url = new URL(resolve(request));
                    if (options.ignoreSearch) url.search = "";
                    return store.get(url.href);
                }
            };
        },
        async keys() { return [...stores.keys()]; },
        async delete(name) { return stores.delete(name); }
    };
    vm.runInNewContext(source, {
        URL, caches,
        fetch: async () => { if (!online) throw new Error("offline"); return "network"; },
        self: {
            registration: { scope },
            clients: { async claim() { claimed = true; } },
            addEventListener(name, handler) { handlers[name] = handler; }
        }
    });
    return {
        stores, handlers,
        offline() { online = false; },
        claimed: () => claimed,
        async lifecycle(name) {
            let pending;
            handlers[name]({ waitUntil(value) { pending = value; } });
            await pending;
        },
        async request(path, { method = "GET", mode = "cors" } = {}) {
            let response;
            handlers.fetch({ request: { url: resolve(path), method, mode },
                respondWith(value) { response = value; } });
            return response;
        }
    };
}

for (const scope of ["https://example.github.io/", "https://example.github.io/stopwatch-pwa/"]) {
    test(`app shell and module files load offline at ${scope}`, async () => {
        const sw = worker(scope);
        await sw.lifecycle("install");
        sw.offline();
        assert.equal(await sw.request("./?home=1", { mode: "navigate" }), "cached:./index.html");
        assert.equal(await sw.request("./index.html", { mode: "navigate" }), "cached:./index.html");
        for (const asset of ["styles.css", "app.js", "stopwatch.js", "controller.js", "storage.js", "view.js", "lap-list.js", "lap-image.js", "lap-export.js", "export-preview.js", "manifest.webmanifest", "icons/apple-touch-icon.png"]) {
            assert.equal(await sw.request(`./${asset}`), `cached:./${asset}`);
        }
    });
}

test("activation deletes only this app's old caches", async () => {
    const scope = "https://example.github.io/stopwatch-pwa/";
    const sw = worker(scope);
    await sw.lifecycle("install");
    const [currentCache] = sw.stores.keys();
    const oldCaches = [`stopwatch-pwa:${scope}:v0`, `stopwatch-pwa:${scope}:obsolete`];
    for (const name of oldCaches) sw.stores.set(name, new Map());
    sw.stores.set("another-app", new Map());
    sw.stores.set("stopwatch-pwa:https://example.github.io/another/:v1", new Map());
    await sw.lifecycle("activate");
    for (const name of oldCaches) assert.ok(!sw.stores.has(name));
    assert.ok(sw.stores.has(currentCache));
    assert.ok(sw.stores.has("another-app"));
    assert.ok(sw.stores.has("stopwatch-pwa:https://example.github.io/another/:v1"));
    assert.ok(sw.claimed());
});

test("requests outside the app scope and non-GET requests are left alone", async () => {
    const sw = worker("https://example.github.io/stopwatch-pwa/");
    assert.equal(await sw.request("https://elsewhere.example/asset"), undefined);
    assert.equal(await sw.request("https://example.github.io/other/"), undefined);
    assert.equal(await sw.request("./", { method: "POST" }), undefined);
});
