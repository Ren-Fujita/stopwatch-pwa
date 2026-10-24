import test from "node:test";
import assert from "node:assert/strict";
import { createLapImagePages, createLapImages } from "../lap-export.js";

function stateWithRows(count) {
    const laps = Array.from({ length: count - 1 }, (_, index) => ({
        number: index + 1, total: (index + 1) * 1000, duration: 1000
    }));
    return { status: "paused", elapsed: count * 1000, laps,
        currentLap: { number: count, total: count * 1000, duration: 1000 } };
}

function canvasDocument({ failWidths = [], hold } = {}) {
    const canvases = [];
    return {
        canvases,
        createElement(tag) {
            assert.equal(tag, "canvas");
            const drawn = [];
            const canvas = {
                width: 0, height: 0, drawn,
                getContext() {
                    return {
                        scale() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
                        measureText(text) { return { width: text.length * 12 }; },
                        fillText(text, x, y) { drawn.push({ text, color: this.fillStyle, font: this.font, x, y }); }
                    };
                },
                toBlob(callback, type) {
                    assert.equal(type, "image/png");
                    canvas.encodedWidth = canvas.width;
                    canvas.encodedHeight = canvas.height;
                    const finish = () => callback(failWidths.includes(canvas.width)
                        ? null : new Blob(["png"], { type }));
                    if (hold) hold(finish);
                    else finish();
                }
            };
            canvases.push(canvas);
            return canvas;
        }
    };
}

for (const [count, sizes] of [[1, [1]], [100, [100]], [101, [100, 1]], [230, [100, 100, 30]]]) {
    test(`${count} visible laps export in order without missing or duplicated rows`, () => {
        const state = stateWithRows(count);
        const pages = createLapImagePages(state);
        assert.deepEqual(pages.map(page => page.rows.length), sizes);
        assert.deepEqual(pages.flatMap(page => page.rows.map(row => row.number)),
            Array.from({ length: count }, (_, index) => index + 1));
        assert.ok(pages.every(page => page.elapsed === state.elapsed));
    });
}

test("highlights are global across pages and exclude the unfinished lap", () => {
    const state = stateWithRows(230);
    state.laps[0].duration = 500;
    state.laps[150].duration = 2000;
    state.currentLap.duration = 999999;
    const pages = createLapImagePages(state);
    assert.equal(pages[0].rows[0].color, "#30d158");
    assert.equal(pages[1].rows[50].color, "#ff453a");
    assert.equal(pages[2].rows.at(-1).color, "#ffffff");
    assert.equal(pages.flatMap(page => page.rows).filter(row => row.color !== "#ffffff").length, 2);
});

test("only paused, nonempty records can be exported", () => {
    for (const status of ["ready", "running"]) {
        assert.throws(() => createLapImagePages({ ...stateWithRows(1), status }));
    }
    assert.throws(() => createLapImagePages({ status: "paused", elapsed: 0, laps: [], currentLap: null }));
});

test("PNG pages repeat the elapsed time and columns, then release every canvas", async () => {
    const document = canvasDocument();
    const progress = [];
    const files = await createLapImages(stateWithRows(101), {
        document, onProgress: (...value) => progress.push(value), date: new Date(2026, 9, 24, 12, 34, 56)
    });
    assert.deepEqual(progress, [[1, 2], [2, 2]]);
    assert.deepEqual(files.map(file => file.name), [
        "stopwatch-laps-20261024-123456-01.png", "stopwatch-laps-20261024-123456-02.png"
    ]);
    assert.ok(files.every(file => file.type === "image/png" && file.size > 0));
    assert.deepEqual(document.canvases.map(canvas => [canvas.encodedWidth, canvas.encodedHeight]),
        [[1170, 12451], [1170, 599]]);
    for (const canvas of document.canvases) {
        assert.equal(canvas.width, 1);
        assert.equal(canvas.height, 1);
        assert.deepEqual(canvas.drawn.slice(0, 4).map(item => item.text),
            ["01:41.00", "ラップ", "累積時間", "ラップタイム"]);
        assert.ok(!canvas.drawn.some(item => item.text === "経過時間"));
    }
});

test("failed high resolution encoding retries at 430 pixels without losing rows", async () => {
    const document = canvasDocument({ failWidths: [1170] });
    const files = await createLapImages(stateWithRows(100), { document });
    assert.equal(files.length, 1);
    assert.deepEqual(document.canvases.map(canvas => canvas.encodedWidth), [1170, 430]);
    assert.ok(document.canvases[1].drawn.some(item => item.text === "ラップ100"));
    assert.ok(document.canvases.every(canvas => canvas.width === 1 && canvas.height === 1));
});

test("total encoding failure reports an error, releases memory and preserves the record", async () => {
    const state = stateWithRows(100);
    const before = structuredClone(state);
    const document = canvasDocument({ failWidths: [430, 1170] });
    await assert.rejects(createLapImages(state, { document }));
    assert.deepEqual(state, before);
    assert.ok(document.canvases.every(canvas => canvas.width === 1 && canvas.height === 1));
});

test("all pages use a copy taken before asynchronous encoding begins", async () => {
    let finish;
    let firstPageDone;
    const firstPage = new Promise(resolve => { firstPageDone = resolve; });
    const state = stateWithRows(101);
    const document = canvasDocument({ hold(callback) { finish = callback; } });
    const result = createLapImages(state, {
        document, onProgress(done) { if (done === 1) firstPageDone(); }
    });
    state.laps[99].number = 999;
    state.currentLap.number = 999;
    state.elapsed = 0;
    finish();
    await firstPage;
    finish();
    await result;
    assert.ok(document.canvases[1].drawn.some(item => item.text === "ラップ101"));
    assert.ok(!document.canvases.flatMap(canvas => canvas.drawn).some(item => item.text === "ラップ999"));
    assert.equal(document.canvases[1].drawn[0].text, "01:41.00");
});

test("cancelling encoding never retries or continues to another page", async () => {
    let finish;
    const controller = new AbortController();
    const document = canvasDocument({ hold(callback) { finish = callback; } });
    const result = createLapImages(stateWithRows(230), { document, signal: controller.signal });
    controller.abort();
    finish();
    await assert.rejects(result, { name: "AbortError" });
    assert.equal(document.canvases.length, 1);
    assert.equal(document.canvases[0].width, 1);
});

test("long hours and large lap numbers fit the allocated columns", async () => {
    const document = canvasDocument();
    await createLapImages({ status: "paused", elapsed: 3600000000000, laps: [],
        currentLap: { number: 12345678, total: 3600000000000, duration: 3600000000000 } }, { document });
    const drawn = document.canvases[0].drawn;
    const label = drawn.find(item => item.text === "ラップ12345678");
    assert.ok(Number.parseFloat(label.font.split(" ")[1]) < 17);
    assert.equal(drawn.filter(item => item.text === "1000000:00:00.00").length, 3);
});
