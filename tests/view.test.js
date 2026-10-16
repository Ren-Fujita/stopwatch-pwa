import test from "node:test";
import assert from "node:assert/strict";
import { createStopwatchView } from "../view.js";
import { createViewFixture } from "./helpers/view-fixture.js";

function setup() {
    const fixture = createViewFixture();
    return { ...fixture, view: createStopwatchView(fixture.document) };
}

const lap = (number, total, duration) => Object.freeze({ number, total, duration });
const rowValues = row => row.children.map(cell => cell.textContent);
const renderState = (laps, status = "running") => ({ status, laps, elapsed: laps.at(-1)?.total ?? 0 });

test("view restores lap values, button labels and fastest/slowest colors", () => {
    const { view, nodes } = setup();
    view.render(renderState([], "ready"));
    assert.equal(nodes.display.textContent, "00:00.00");
    assert.equal(nodes.leftButton.disabled, true);
    assert.equal(nodes.rightButton.textContent, "開始");
    assert.equal(nodes.lapHeader.hidden, true);
    view.render(renderState([lap(1, 1000, 1000), lap(2, 1500, 500)], "paused"));
    assert.equal(nodes.leftButton.textContent, "リセット");
    assert.equal(nodes.leftButton.disabled, false);
    assert.equal(nodes.display.textContent, "00:01.50");
    assert.equal(nodes.lapHeader.hidden, false);
    assert.deepEqual(rowValues(nodes.lapList.children[1]), ["2", "00:01.50", "00:00.50"]);
    assert.equal(nodes.lapList.children[0].classList.contains("is-slow"), true);
    assert.equal(nodes.lapList.children[1].classList.contains("is-fast"), true);
});

test("appending a lap preserves existing rows and scroll while moving the highlight", () => {
    const { view, nodes } = setup();
    const firstLaps = [lap(1, 1000, 1000), lap(2, 1500, 500)];
    view.render(renderState(firstLaps));
    const [firstRow, secondRow] = nodes.lapList.children;
    nodes.laps.scrollTop = 36;
    view.render(renderState([...firstLaps, lap(3, 3500, 2000)]));
    assert.equal(nodes.lapList.children[0], firstRow);
    assert.equal(nodes.lapList.children[1], secondRow);
    assert.equal(nodes.laps.scrollTop, 36);
    assert.equal(firstRow.classList.contains("is-slow"), false);
    assert.equal(secondRow.classList.contains("is-fast"), true);
    assert.equal(nodes.lapList.children[2].classList.contains("is-slow"), true);
});

test("replacing records with the same count updates both values and colors", () => {
    const { view, nodes } = setup();
    view.render(renderState([lap(1, 1000, 1000), lap(2, 1500, 500)]));
    view.render(renderState([lap(1, 700, 700), lap(2, 1600, 900)]));
    assert.deepEqual(rowValues(nodes.lapList.children[0]), ["1", "00:00.70", "00:00.70"]);
    assert.deepEqual(rowValues(nodes.lapList.children[1]), ["2", "00:01.60", "00:00.90"]);
    assert.equal(nodes.lapList.children[0].classList.contains("is-fast"), true);
    assert.equal(nodes.lapList.children[1].classList.contains("is-slow"), true);
});

test("shrinking and resetting the list clears stale rows and colors", () => {
    const { view, nodes } = setup();
    view.render(renderState([lap(1, 1000, 1000), lap(2, 1500, 500), lap(3, 3500, 2000)]));
    view.render(renderState([lap(1, 800, 800)]));
    assert.equal(nodes.lapList.children.length, 1);
    assert.deepEqual(rowValues(nodes.lapList.children[0]), ["1", "00:00.80", "00:00.80"]);
    assert.equal(nodes.lapList.children[0].classList.contains("is-fast"), false);
    assert.equal(nodes.lapList.children[0].classList.contains("is-slow"), false);
    view.render(renderState([], "ready"));
    assert.equal(nodes.lapList.children.length, 0);
    assert.equal(nodes.lapHeader.hidden, true);
    view.render(renderState([lap(1, 250, 250)]));
    assert.deepEqual(rowValues(nodes.lapList.children[0]), ["1", "00:00.25", "00:00.25"]);
});

test("actual view controls bind once and stop dispatching after unbinding", () => {
    const { view, nodes } = setup();
    let toggles = 0;
    let leftActions = 0;
    const unbind = view.bindControls({
        toggleRunning() { toggles++; }, handleLeftButton() { leftActions++; }
    });
    nodes.rightButton.dispatchEvent(new Event("click"));
    nodes.leftButton.dispatchEvent(new Event("click"));
    assert.equal(toggles, 1);
    assert.equal(leftActions, 1);
    unbind();
    nodes.rightButton.dispatchEvent(new Event("click"));
    nodes.leftButton.dispatchEvent(new Event("click"));
    assert.equal(toggles, 1);
    assert.equal(leftActions, 1);
});

test("destroyed view ignores late font, resize and render callbacks", async () => {
    const { view, nodes, observers, resolveFonts } = setup();
    view.render(renderState([], "ready"));
    const previousScale = nodes.display.style.getPropertyValue("--time-width-scale");
    view.destroy();
    nodes.timeFace.clientWidth = 100;
    observers[0].callback();
    resolveFonts();
    await Promise.resolve();
    view.renderTime({ elapsed: 1000 });
    view.render(renderState([lap(1, 1000, 1000)]));
    assert.equal(nodes.display.textContent, "00:00.00");
    assert.equal(nodes.display.style.getPropertyValue("--time-width-scale"), previousScale);
    assert.equal(nodes.lapList.children.length, 0);
    assert.equal(observers[0].disconnected, true);
});

test("lap one is visible from zero and resets even with no completed laps", () => {
    const { view, nodes } = setup();
    const completed = Object.freeze([]);
    view.render({ status: "ready", elapsed: 0, laps: completed, currentLap: null });
    view.render({ status: "running", elapsed: 0, laps: completed, currentLap: lap(1, 0, 0) });
    assert.equal(nodes.lapHeader.hidden, false);
    assert.equal(nodes.lapList.children.length, 1);
    const currentRow = nodes.lapList.children[0];
    assert.deepEqual(rowValues(currentRow), ["1", "00:00.00", "00:00.00"]);
    view.renderTime({ elapsed: 1234, currentLap: lap(1, 1234, 1234) });
    assert.equal(nodes.lapList.children[0], currentRow);
    assert.deepEqual(rowValues(currentRow), ["1", "00:01.23", "00:01.23"]);
    view.render({ status: "paused", elapsed: 1234, laps: completed, currentLap: lap(1, 1234, 1234) });
    assert.deepEqual(rowValues(currentRow), ["1", "00:01.23", "00:01.23"]);
    view.render({ status: "ready", elapsed: 0, laps: completed, currentLap: null });
    assert.equal(nodes.lapList.children.length, 0);
    assert.equal(nodes.lapHeader.hidden, true);
});

test("the active row becomes a completed row while only the next row keeps counting", () => {
    const { view, nodes } = setup();
    view.render({ status: "running", elapsed: 1000, laps: [], currentLap: lap(1, 1000, 1000) });
    const firstRow = nodes.lapList.children[0];
    const completed = Object.freeze([lap(1, 1000, 1000)]);
    view.render({ status: "running", elapsed: 1000, laps: completed, currentLap: lap(2, 1000, 0) });
    assert.equal(nodes.lapList.children[0], firstRow);
    assert.equal(nodes.lapList.children.length, 2);
    assert.deepEqual(rowValues(nodes.lapList.children[1]), ["2", "00:01.00", "00:00.00"]);
    view.renderTime({ elapsed: 1250, currentLap: lap(2, 1250, 250) });
    assert.deepEqual(rowValues(firstRow), ["1", "00:01.00", "00:01.00"]);
    assert.deepEqual(rowValues(nodes.lapList.children[1]), ["2", "00:01.25", "00:00.25"]);
    assert.equal(nodes.lapList.children.length, 2);
});

test("current lap values do not participate in fastest and slowest colors", () => {
    const { view, nodes } = setup();
    const completed = Object.freeze([lap(1, 1000, 1000), lap(2, 1500, 500)]);
    view.render({ status: "running", elapsed: 6500, laps: completed, currentLap: lap(3, 6500, 5000) });
    const [first, second, current] = nodes.lapList.children;
    assert.equal(first.classList.contains("is-slow"), true);
    assert.equal(second.classList.contains("is-fast"), true);
    view.renderTime({ elapsed: 10000, currentLap: lap(3, 10000, 8500) });
    assert.equal(current.classList.contains("is-slow"), false);
    assert.equal(current.classList.contains("is-fast"), false);
    view.render({
        status: "running", elapsed: 10000,
        laps: Object.freeze([...completed, lap(3, 10000, 8500)]), currentLap: lap(4, 10000, 0)
    });
    assert.equal(nodes.lapList.children[2], current);
    assert.equal(current.classList.contains("is-slow"), true);
    assert.equal(first.classList.contains("is-slow"), false);
    assert.equal(nodes.lapList.children[3].classList.contains("is-fast"), false);
    assert.equal(nodes.lapList.children[3].classList.contains("is-slow"), false);
});
