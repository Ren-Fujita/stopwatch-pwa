import { BASE_IMAGE_WIDTH, createLapImagePages, drawLapImagePage } from "./lap-image.js";

// 既存の呼び出し元は、分割処理を引き続きこのモジュールから利用できる。
export { createLapImagePages } from "./lap-image.js";

const IMAGE_WIDTH = 1170;

function abortIfNeeded(signal) {
    if (signal?.aborted) throw new DOMException("画像の作成を中止しました。", "AbortError");
}

async function encodePage(page, document, width, signal) {
    const canvas = document.createElement("canvas");
    try {
        abortIfNeeded(signal);
        drawLapImagePage(canvas, page, width);
        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob(value => value ? resolve(value)
                : reject(new Error("画像を作成できませんでした。")), "image/png");
        });
        abortIfNeeded(signal);
        return blob;
    } finally {
        // PNGの変換が終わってから、大きな描画領域を解放する。
        canvas.width = 1;
        canvas.height = 1;
    }
}

function fileStamp(date) {
    const pad = value => String(value).padStart(2, "0");
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
        + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

async function encodeWithFallback(page, document, signal) {
    try {
        return await encodePage(page, document, IMAGE_WIDTH, signal);
    } catch (error) {
        if (error.name === "AbortError") throw error;
        return encodePage(page, document, BASE_IMAGE_WIDTH, signal);
    }
}

export async function createLapImages(state, { document, FileConstructor = globalThis.File,
    signal, onProgress = () => {}, date = new Date() } = {}) {
    const pages = createLapImagePages(state);
    const files = [];
    const stamp = fileStamp(date);
    for (const [index, page] of pages.entries()) {
        abortIfNeeded(signal);
        const blob = await encodeWithFallback(page, document, signal);
        files.push(new FileConstructor([blob], `stopwatch-laps-${stamp}-${String(index + 1).padStart(2, "0")}.png`,
            { type: "image/png" }));
        onProgress(index + 1, pages.length);
    }
    return files;
}
