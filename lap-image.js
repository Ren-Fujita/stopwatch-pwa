import { formatTime, getLapHighlights } from "./stopwatch.js";

const ROWS_PER_IMAGE = 100;
export const BASE_IMAGE_WIDTH = 430;
const LAYOUT = Object.freeze({
    width: BASE_IMAGE_WIDTH, padding: 20, rowHeight: 44, headerHeight: 160,
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

export function drawLapImagePage(canvas, page, width) {
    const height = LAYOUT.headerHeight + LAYOUT.rowHeight * page.rows.length + LAYOUT.bottomPadding;
    const scale = width / LAYOUT.width;
    canvas.width = width;
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("画像を作成できませんでした。");
    // 拡大率が小数でも、丸めた画像の端まで不透明な黒で塗る。
    context.fillStyle = COLORS.background;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.scale(scale, scale);
    context.textBaseline = "middle";
    drawHeader(context, page.elapsed);
    drawRows(context, page.rows);
}

