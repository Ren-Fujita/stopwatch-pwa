import { formatTime, getLapHighlights } from "./stopwatch.js";

const ROWS_PER_IMAGE = 100;
const LAYOUT = Object.freeze({
    width: 430, padding: 20, rowHeight: 44, headerHeight: 160,
    bottomPadding: 16, elapsedY: 76, headerLineY: 120, columnTitleY: 140
});
const FONT = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "Yu Gothic", sans-serif';
const NUMBER_FONT = '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "Segoe UI", sans-serif';
const COLORS = Object.freeze({
    text: "#ffffff", muted: "#8e8e93", total: "#aaaaaa",
    fastest: "#30d158", slowest: "#ff453a", background: "#000000"
});
const COLUMNS = [
    { title: "ラップ", x: 20, width: 98, align: "left", value: lap => `ラップ${lap.number}` },
    { title: "累積時間", x: 196.5, width: 135, align: "center", numeric: true,
        color: COLORS.total, value: lap => formatTime(lap.total) },
    { title: "ラップタイム", x: 410, width: 135, align: "right", numeric: true,
        value: lap => formatTime(lap.duration) }
];

function copyImageRows(laps, currentLap) {
    const { fastestIndex, slowestIndex } = getLapHighlights(laps);
    const rows = laps.map((lap, index) => ({
        ...lap,
        color: index === fastestIndex ? COLORS.fastest
            : index === slowestIndex ? COLORS.slowest : COLORS.text
    }));
    if (currentLap) rows.push({ ...currentLap, color: COLORS.text });
    return rows;
}

// 表示中のDOMやスクロール位置を使わず、押した時点の記録をコピーする。
export function createLapImagePages({ status, elapsed, laps, currentLap }) {
    if (status !== "paused") throw new Error("停止してから画像を保存してください。");
    const rows = copyImageRows(laps, currentLap);
    if (!rows.length) throw new Error("保存できるラップがありません。");
    const pages = [];
    for (let start = 0; start < rows.length; start += ROWS_PER_IMAGE) {
        pages.push({ elapsed, rows: rows.slice(start, start + ROWS_PER_IMAGE) });
    }
    return pages;
}

function drawText(context, text, x, y, { width, size = 17, color = COLORS.text,
    align = "left", numeric = false, weight = 400 } = {}) {
    const family = numeric ? NUMBER_FONT : FONT;
    context.font = `${weight} ${size}px ${family}`;
    const measured = context.measureText(text).width;
    if (width && measured > width) context.font = `${weight} ${size * width / measured}px ${family}`;
    context.textAlign = align;
    context.fillStyle = color;
    context.fillText(text, x, y);
}

function drawLine(context, y, color) {
    context.strokeStyle = color;
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(LAYOUT.padding, y);
    context.lineTo(LAYOUT.width - LAYOUT.padding, y);
    context.stroke();
}

function drawHeader(context, elapsed) {
    drawText(context, formatTime(elapsed), LAYOUT.width / 2, LAYOUT.elapsedY,
        { size: 48, width: LAYOUT.width - LAYOUT.padding * 2, align: "center", numeric: true, weight: 200 });
    drawLine(context, LAYOUT.headerLineY, "#1c1c1e");
    for (const column of COLUMNS) {
        drawText(context, column.title, column.x, LAYOUT.columnTitleY,
            { size: 12, color: COLORS.muted, align: column.align });
    }
    drawLine(context, LAYOUT.headerHeight, "#333333");
}

function drawRows(context, rows) {
    rows.forEach((lap, index) => {
        const y = LAYOUT.headerHeight + LAYOUT.rowHeight * (index + 0.5);
        for (const column of COLUMNS) {
            drawText(context, column.value(lap), column.x, y, {
                width: column.width, align: column.align, numeric: column.numeric,
                color: column.color ?? lap.color
            });
        }
        drawLine(context, LAYOUT.headerHeight + LAYOUT.rowHeight * (index + 1), "#222222");
    });
}

function drawPage(canvas, page, scale) {
    const height = LAYOUT.headerHeight + LAYOUT.rowHeight * page.rows.length + LAYOUT.bottomPadding;
    canvas.width = LAYOUT.width * scale;
    canvas.height = height * scale;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("画像を作成できませんでした。");
    context.scale(scale, scale);
    context.fillStyle = COLORS.background;
    context.fillRect(0, 0, LAYOUT.width, height);
    context.textBaseline = "middle";
    drawHeader(context, page.elapsed);
    drawRows(context, page.rows);
}

function abortIfNeeded(signal) {
    if (signal?.aborted) throw new DOMException("画像の作成を中止しました。", "AbortError");
}

async function encodePage(page, document, scale, signal) {
    const canvas = document.createElement("canvas");
    try {
        abortIfNeeded(signal);
        drawPage(canvas, page, scale);
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
        return await encodePage(page, document, 2, signal);
    } catch (error) {
        if (error.name === "AbortError") throw error;
        return encodePage(page, document, 1, signal);
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
