import test from "node:test";
import assert from "node:assert/strict";
import { createStopwatchStorage } from "../storage.js";
import { createStopwatch } from "../stopwatch.js";

function memoryStorage() {
    const values = new Map();
    return {
        values,
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: key => values.delete(key)
    };
}

const baseUrl = "https://example.github.io/stopwatch-pwa/storage.js";
const legacyKey = "stopwatch-pwa-state-v1:/stopwatch-pwa/";
const pausedState = {
    version: 1, status: "paused", startedAt: 1700000000000, accumulatedTime: 1234,
    laps: [{ number: 1, total: 1234, duration: 1234 }]
};

test("saved records from the previous version keep their key, time and laps", () => {
    const memory = memoryStorage();
    memory.setItem(legacyKey, JSON.stringify(pausedState));
    const storage = createStopwatchStorage({ baseUrl, getStorage: () => memory });
    const watch = createStopwatch({ savedState: storage.load() });
    assert.equal(watch.status, "paused");
    assert.equal(watch.elapsedTime(), 1234);
    assert.deepEqual(watch.laps, pausedState.laps);
    assert.equal(storage.save(watch.snapshot()), true);
    assert.deepEqual(JSON.parse(memory.getItem(legacyKey)), pausedState);
});

test("reset removes this app's record and preserves unrelated site data", () => {
    const memory = memoryStorage();
    memory.setItem("another-app", "keep");
    const storage = createStopwatchStorage({ baseUrl, getStorage: () => memory });
    storage.save(pausedState);
    storage.save(createStopwatch().snapshot());
    assert.equal(storage.load(), null);
    assert.equal(memory.getItem("another-app"), "keep");
});

test("different GitHub Pages project paths use separate records", () => {
    const memory = memoryStorage();
    const first = createStopwatchStorage({ baseUrl, getStorage: () => memory });
    const second = createStopwatchStorage({
        baseUrl: "https://example.github.io/another/storage.js", getStorage: () => memory
    });
    first.save(pausedState);
    assert.deepEqual(first.load(), pausedState);
    assert.equal(second.load(), null);
});

test("corrupt JSON or blocked storage does not prevent startup", () => {
    const memory = memoryStorage();
    memory.setItem(legacyKey, "{broken");
    const corrupt = createStopwatchStorage({ baseUrl, getStorage: () => memory });
    assert.equal(corrupt.load(), null);
    const blocked = createStopwatchStorage({ baseUrl, getStorage() { throw new Error("blocked"); } });
    assert.equal(blocked.load(), null);
    assert.equal(blocked.save(pausedState), false);
});

test("a quota error reports a failed save without throwing", () => {
    const memory = memoryStorage();
    memory.setItem = () => { throw new Error("quota exceeded"); };
    const storage = createStopwatchStorage({ baseUrl, getStorage: () => memory });
    assert.equal(storage.save(pausedState), false);
});
