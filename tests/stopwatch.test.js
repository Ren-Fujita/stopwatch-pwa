import test from "node:test";
import assert from "node:assert/strict";
import { createStopwatch, formatTime, getLapHighlights } from "../stopwatch.js";

function setup(savedState) {
    let time = 1700000000000;
    return {
        watch: createStopwatch({ now: () => time, savedState }),
        advance: milliseconds => { time += milliseconds; },
        now: () => time
    };
}

test("start, laps, pause, resume and reset preserve elapsed and lap durations", () => {
    const { watch, advance } = setup();
    assert.equal(watch.recordLap(), null);
    watch.start();
    advance(1234);
    assert.deepEqual(watch.recordLap(), { number: 1, total: 1234, duration: 1234 });
    advance(2345);
    watch.stop();
    advance(60000);
    assert.equal(watch.elapsedTime(), 3579);
    watch.start();
    advance(456);
    assert.deepEqual(watch.recordLap(), { number: 2, total: 4035, duration: 2801 });
    watch.reset();
    assert.equal(watch.status, "ready");
    assert.equal(watch.elapsedTime(), 0);
    assert.deepEqual(watch.laps, []);
});

test("running stopwatch restores the time spent asleep or closed", () => {
    const { watch, advance, now } = setup();
    watch.start();
    advance(2000);
    watch.recordLap();
    const savedState = JSON.parse(JSON.stringify(watch.snapshot()));
    advance(3600000);
    const restored = createStopwatch({ now, savedState });
    assert.equal(restored.status, "running");
    assert.equal(restored.elapsedTime(), 3602000);
    assert.deepEqual(restored.recordLap(), { number: 2, total: 3602000, duration: 3600000 });
});

test("paused stopwatch restores without counting time while closed", () => {
    const { watch, advance, now } = setup();
    watch.start();
    advance(9999);
    watch.recordLap();
    watch.stop();
    const savedState = watch.snapshot();
    advance(86400000);
    const restored = createStopwatch({ now, savedState });
    assert.equal(restored.status, "paused");
    assert.equal(restored.elapsedTime(), 9999);
    assert.equal(restored.laps.length, 1);
    restored.start();
    advance(1);
    assert.equal(restored.elapsedTime(), 10000);
});

test("corrupt or incompatible saved data falls back to a new stopwatch", () => {
    const badStates = [null, {}, { version: 2 },
        { version: 1, status: "paused", startedAt: 0, accumulatedTime: -1, laps: [] },
        { version: 1, status: "paused", startedAt: 0, accumulatedTime: 2,
          laps: [{ number: 1, total: 100, duration: 100 }] },
        { version: 1, status: "running", startedAt: 1, accumulatedTime: 0, laps: [null] },
        { version: 1, status: "running", startedAt: 1, accumulatedTime: 0,
          laps: [{ number: 1, total: 100, duration: 9 }] }
    ];
    for (const savedState of badStates) {
        const { watch } = setup(savedState);
        assert.equal(watch.status, "ready");
        assert.equal(watch.elapsedTime(), 0);
    }
});

test("time formatting handles minute and hour boundaries", () => {
    assert.equal(formatTime(0), "00:00.00");
    assert.equal(formatTime(59999), "00:59.99");
    assert.equal(formatTime(60000), "01:00.00");
    assert.equal(formatTime(3599999), "59:59.99");
    assert.equal(formatTime(3600000), "01:00:00.00");
    assert.equal(formatTime(360000000), "100:00:00.00");
});

test("duplicate start and stop calls do not change the measured time", () => {
    const { watch, advance } = setup();
    watch.start();
    advance(1000);
    watch.start();
    advance(1000);
    watch.stop();
    advance(1000);
    watch.stop();
    assert.equal(watch.elapsedTime(), 2000);
});

test("lap highlights use the displayed hundredths and prefer the first tied lap", () => {
    const laps = [120, 129, 240, 249].map(duration => ({ duration }));
    assert.deepEqual(getLapHighlights(laps), { fastestIndex: 0, slowestIndex: 2 });
});

test("empty, single and equal displayed laps are not highlighted", () => {
    for (const durations of [[], [100], [100, 109, 101]]) {
        assert.deepEqual(getLapHighlights(durations.map(duration => ({ duration }))), {
            fastestIndex: -1, slowestIndex: -1
        });
    }
});
