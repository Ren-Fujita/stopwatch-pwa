import test from "node:test";
import assert from "node:assert/strict";
import { createStopwatch } from "../stopwatch.js";
import { createStopwatchStorage } from "../storage.js";
import { createStopwatchController } from "../controller.js";

class PageWindow extends EventTarget {
    frames = new Map();
    nextFrame = 1;
    requestAnimationFrame(callback) {
        const id = this.nextFrame++;
        this.frames.set(id, callback);
        return id;
    }
    cancelAnimationFrame(id) { this.frames.delete(id); }
    tick() {
        const pending = [...this.frames.values()];
        this.frames.clear();
        for (const callback of pending) callback();
    }
}

function setup({ savedState, initialTime = 1700000000000, storageBlocked = false } = {}) {
    let time = initialTime;
    const values = new Map();
    const memory = {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: key => values.delete(key)
    };
    const storage = createStopwatchStorage({
        baseUrl: "https://example.github.io/stopwatch-pwa/storage.js",
        getStorage() {
            if (storageBlocked) throw new Error("blocked");
            return memory;
        }
    });
    if (savedState) storage.save(savedState);
    const stopwatch = createStopwatch({ now: () => time, savedState: storage.load() });
    const document = new EventTarget();
    document.hidden = false;
    const window = new PageWindow();
    const view = {
        state: null, controls: null, scroll: null, renders: 0, destroyed: 0,
        render(state) { this.state = structuredClone(state); this.renders++; },
        renderTime(elapsed) { this.state.elapsed = elapsed; },
        bindControls(controls) {
            this.controls = controls;
            return () => { this.controls = null; };
        },
        scrollLapsToEnd() { this.scroll = "end"; },
        scrollLapsToStart() { this.scroll = "start"; },
        destroy() { this.destroyed++; }
    };
    const controller = createStopwatchController({ stopwatch, storage, view, document, window });
    return {
        controller, stopwatch, storage, view, window, document,
        advance(milliseconds) { time += milliseconds; },
        setVisible(visible) {
            document.hidden = !visible;
            document.dispatchEvent(new Event("visibilitychange"));
        }
    };
}

test("button actions update the display, laps, saved state and reset", () => {
    const { view, window, storage, advance } = setup();
    assert.equal(view.state.status, "ready");
    view.controls.toggleRunning();
    advance(1234);
    window.tick();
    assert.equal(view.state.elapsed, 1234);
    view.controls.handleLeftButton();
    assert.deepEqual(view.state.laps, [{ number: 1, total: 1234, duration: 1234 }]);
    assert.equal(view.scroll, "end");
    assert.equal(storage.load().laps.length, 1);
    view.controls.toggleRunning();
    assert.equal(view.state.status, "paused");
    assert.equal(window.frames.size, 0);
    advance(60000);
    view.controls.toggleRunning();
    assert.equal(view.state.elapsed, 1234);
    advance(1000);
    view.controls.toggleRunning();
    assert.equal(view.state.elapsed, 2234);
    view.controls.handleLeftButton();
    assert.deepEqual(view.state, { status: "ready", elapsed: 0, laps: [] });
    assert.equal(view.scroll, "start");
    assert.equal(storage.load(), null);
});

test("backgrounding suspends drawing and restores all elapsed time on return", () => {
    const { view, window, storage, advance, setVisible } = setup();
    view.controls.toggleRunning();
    advance(1000);
    setVisible(false);
    assert.equal(window.frames.size, 0);
    assert.equal(storage.load().status, "running");
    advance(3600000);
    setVisible(true);
    assert.equal(view.state.elapsed, 3601000);
    assert.equal(window.frames.size, 1);
});

test("page restoration and visibility events never duplicate animation loops", () => {
    const { view, window, setVisible } = setup();
    view.controls.toggleRunning();
    for (let index = 0; index < 5; index++) {
        window.dispatchEvent(new Event("pageshow"));
        setVisible(true);
        window.tick();
        assert.equal(window.frames.size, 1);
    }
    window.dispatchEvent(new Event("pagehide"));
    assert.equal(window.frames.size, 0);
    window.dispatchEvent(new Event("pageshow"));
    assert.equal(window.frames.size, 1);
});

test("restoring an existing record draws its laps before the first frame", () => {
    const savedState = {
        version: 1, status: "running", startedAt: 1700000000000, accumulatedTime: 0,
        laps: [{ number: 1, total: 1000, duration: 1000 }]
    };
    const { view, window } = setup({ savedState, initialTime: 1700000005000 });
    assert.equal(view.state.status, "running");
    assert.equal(view.state.elapsed, 5000);
    assert.deepEqual(view.state.laps, savedState.laps);
    assert.equal(window.frames.size, 1);
});

test("blocked browser storage leaves start, lap and stop usable", () => {
    const { view, advance } = setup({ storageBlocked: true });
    view.controls.toggleRunning();
    advance(1000);
    view.controls.handleLeftButton();
    view.controls.toggleRunning();
    assert.equal(view.state.status, "paused");
    assert.equal(view.state.elapsed, 1000);
    assert.equal(view.state.laps.length, 1);
});

test("destroy removes event listeners, drawing callbacks and view observers", () => {
    const { controller, view, window, setVisible } = setup();
    view.controls.toggleRunning();
    controller.destroy();
    controller.destroy();
    const rendersBefore = view.renders;
    window.dispatchEvent(new Event("pageshow"));
    setVisible(false);
    setVisible(true);
    assert.equal(view.renders, rendersBefore);
    assert.equal(window.frames.size, 0);
    assert.equal(view.controls, null);
    assert.equal(view.destroyed, 1);
});

test("callbacks retained after destruction cannot restart or modify the stopwatch", () => {
    const { controller, view, stopwatch, window, storage } = setup();
    const { toggleRunning, handleLeftButton } = view.controls;
    controller.destroy();
    toggleRunning();
    handleLeftButton();
    assert.equal(stopwatch.status, "ready");
    assert.equal(stopwatch.elapsedTime(), 0);
    assert.equal(window.frames.size, 0);
    assert.equal(storage.load(), null);
});
