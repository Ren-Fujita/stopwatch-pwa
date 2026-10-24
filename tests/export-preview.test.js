import test from "node:test";
import assert from "node:assert/strict";
import { createExportPreview } from "../export-preview.js";
import { createViewFixture } from "./helpers/view-fixture.js";

const tick = () => new Promise(resolve => setImmediate(resolve));
const files = [1, 2, 3].map(number => new File(["png"], `laps-${number}.png`, { type: "image/png" }));

function setup({ supported = true, shareError, createImages = async () => files } = {}) {
    const fixture = createViewFixture();
    const revoked = [];
    const shared = [];
    let generated = 0;
    const window = {
        File,
        URL: {
            createObjectURL(file) { return `blob:${file.name}`; },
            revokeObjectURL(url) { revoked.push(url); }
        },
        navigator: {
            canShare() { return supported; },
            async share(data) { shared.push(data); if (shareError) throw shareError; }
        }
    };
    const preview = createExportPreview({ document: fixture.document, window,
        createImages(...args) { generated++; return createImages(...args); } });
    return { ...fixture, preview, window, revoked, shared, generated: () => generated };
}

test("preview offers all images together and individual PNG downloads", async () => {
    const { preview, nodes, shared, revoked } = setup();
    await preview.open({});
    assert.equal(nodes.exportDialog.open, true);
    assert.equal(nodes.exportImages.children.length, 3);
    assert.equal(nodes.shareExport.textContent, "共有・保存（3枚）");
    for (const [index, figure] of nodes.exportImages.children.entries()) {
        assert.equal(figure.children[0].textContent, `${index + 1} / 3`);
        assert.equal(figure.children[1].src, `blob:${files[index].name}`);
        assert.equal(figure.children[2].download, files[index].name);
    }
    nodes.shareExport.dispatchEvent(new Event("click"));
    await tick();
    assert.deepEqual(shared, [{ files }]);
    nodes.closeExport.dispatchEvent(new Event("click"));
    assert.equal(nodes.exportDialog.open, false);
    assert.equal(nodes.exportImages.children.length, 0);
    assert.equal(nodes.exportButton.focusCount, 1);
    assert.deepEqual(revoked, files.map(file => `blob:${file.name}`));
});

test("unsupported file sharing leaves each image downloadable", async () => {
    const { preview, nodes } = setup({ supported: false });
    await preview.open({});
    assert.equal(nodes.shareExport.hidden, true);
    assert.match(nodes.exportStatus.textContent, /ダウンロード/);
    assert.equal(nodes.exportImages.children.length, 3);
    preview.destroy();
});

test("share cancellation preserves the preview without an error", async () => {
    const { preview, nodes } = setup({ shareError: new DOMException("cancel", "AbortError") });
    await preview.open({});
    const status = nodes.exportStatus.textContent;
    nodes.shareExport.dispatchEvent(new Event("click"));
    await tick();
    assert.equal(nodes.exportStatus.textContent, status);
    assert.equal(nodes.exportDialog.open, true);
    assert.equal(nodes.shareExport.disabled, false);
    preview.destroy();
});

test("a failed share keeps the PNG download fallback", async () => {
    const { preview, nodes } = setup({ shareError: new Error("failed") });
    await preview.open({});
    nodes.shareExport.dispatchEvent(new Event("click"));
    await tick();
    assert.match(nodes.exportStatus.textContent, /共有できません/);
    assert.equal(nodes.exportImages.children.length, 3);
    preview.destroy();
});

test("repeated opens and share clicks cannot create duplicate work", async () => {
    let complete;
    const { preview, nodes, generated } = setup({ createImages: () => new Promise(resolve => { complete = resolve; }) });
    const result = preview.open({});
    await preview.open({});
    assert.equal(generated(), 1);
    complete(files);
    await result;
    preview.destroy();
    await preview.open({});
    assert.equal(generated(), 1);
    assert.equal(nodes.exportDialog.open, false);
});

test("closing a generating preview cancels it and ignores late image results", async () => {
    let complete;
    let signal;
    const { preview, nodes, revoked } = setup({ createImages: (_, options) => {
        signal = options.signal;
        return new Promise(resolve => { complete = resolve; });
    } });
    const result = preview.open({});
    nodes.closeExport.dispatchEvent(new Event("click"));
    assert.equal(signal.aborted, true);
    complete(files);
    await result;
    assert.equal(nodes.exportImages.children.length, 0);
    assert.equal(nodes.exportDialog.open, false);
    assert.deepEqual(revoked, []);
    preview.destroy();
});

test("an old completion cannot overwrite a newly opened preview", async () => {
    const completions = [];
    const { preview, nodes } = setup({ createImages: () => new Promise(resolve => completions.push(resolve)) });
    const first = preview.open({});
    nodes.closeExport.dispatchEvent(new Event("click"));
    const second = preview.open({});
    completions[0](files);
    await first;
    assert.equal(nodes.exportImages.children.length, 0);
    completions[1]([files[0]]);
    await second;
    assert.equal(nodes.exportImages.children.length, 1);
    preview.destroy();
});

test("generation errors leave the record intact and explain how to retry", async () => {
    const state = { status: "paused", elapsed: 5000, laps: [{ number: 1, duration: 5000, total: 5000 }] };
    const before = structuredClone(state);
    const { preview, nodes } = setup({ createImages: async () => { throw new Error("memory"); } });
    await preview.open(state);
    assert.deepEqual(state, before);
    assert.match(nodes.exportStatus.textContent, /記録はそのまま/);
    assert.equal(nodes.shareExport.hidden, true);
    assert.equal(nodes.exportImages.children.length, 0);
    preview.destroy();
});

test("destroy releases images and removes all preview listeners", async () => {
    const { preview, nodes, revoked } = setup();
    await preview.open({});
    preview.destroy();
    preview.destroy();
    nodes.shareExport.dispatchEvent(new Event("click"));
    assert.equal(nodes.exportButton.focusCount, 0);
    assert.deepEqual(revoked, files.map(file => `blob:${file.name}`));
});

test("partial preview creation failure releases every image URL and permits retry", async () => {
    const { preview, window, nodes, revoked } = setup();
    const createURL = window.URL.createObjectURL;
    window.URL.createObjectURL = file => {
        if (file === files[1]) throw new Error("allocation failed");
        return createURL(file);
    };
    await preview.open({});
    assert.deepEqual(revoked, [`blob:${files[0].name}`]);
    assert.equal(nodes.exportImages.children.length, 0);
    assert.equal(nodes.shareExport.hidden, true);
    assert.match(nodes.exportStatus.textContent, /記録はそのまま/);
    nodes.closeExport.dispatchEvent(new Event("click"));
    window.URL.createObjectURL = createURL;
    await preview.open({});
    assert.equal(nodes.exportImages.children.length, 3);
    preview.destroy();
});

test("progress from a closed generation cannot overwrite a new preview", async () => {
    const jobs = [];
    const { preview, nodes } = setup({ createImages: (_, options) => new Promise(resolve => {
        jobs.push({ ...options, resolve });
    }) });
    const first = preview.open({});
    nodes.closeExport.dispatchEvent(new Event("click"));
    const second = preview.open({});
    const status = nodes.exportStatus.textContent;
    jobs[0].onProgress(9, 10);
    assert.equal(nodes.exportStatus.textContent, status);
    jobs[0].resolve(files);
    jobs[1].resolve(files);
    await Promise.all([first, second]);
    preview.destroy();
});

test("repeated share clicks only open one system share operation", async () => {
    let finish;
    const { preview, window, nodes } = setup();
    let shares = 0;
    window.navigator.share = () => {
        shares++;
        return new Promise(resolve => { finish = resolve; });
    };
    await preview.open({});
    nodes.shareExport.dispatchEvent(new Event("click"));
    nodes.shareExport.dispatchEvent(new Event("click"));
    assert.equal(shares, 1);
    assert.equal(nodes.shareExport.disabled, true);
    finish();
    await tick();
    assert.equal(nodes.shareExport.disabled, false);
    preview.destroy();
});
