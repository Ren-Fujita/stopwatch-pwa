import { formatTime, getLapHighlights } from "./stopwatch.js";

const LAP_COLUMNS = [
    { className: "lap-number", text: lap => String(lap.number) },
    { className: "lap-total", text: lap => formatTime(lap.total) },
    { className: "lap-time", text: lap => formatTime(lap.duration) }
];

export function createStopwatchView(document) {
    const elements = {
        stopwatch: document.querySelector(".stopwatch"),
        timeFace: document.querySelector(".timer-face"),
        display: document.getElementById("display"),
        leftButton: document.getElementById("leftButton"),
        rightButton: document.getElementById("rightButton"),
        laps: document.querySelector(".laps"),
        lapHeader: document.getElementById("lapHeader"),
        lapList: document.getElementById("lapList")
    };
    let displayLength = 0;
    let renderedStatus = null;
    let renderedLaps = null;
    let renderedHighlights = { fastestIndex: -1, slowestIndex: -1 };
    let disposed = false;

    function fitTimeWidth() {
        if (disposed) return;
        const width = Math.max(elements.display.offsetWidth, elements.display.scrollWidth);
        if (!width) return;
        const scale = Math.min(1.3, elements.timeFace.clientWidth * 0.96 / width);
        elements.display.style.setProperty("--time-width-scale", scale);
    }

    function renderTime(milliseconds) {
        if (disposed) return;
        const text = formatTime(milliseconds);
        if (elements.display.textContent !== text) elements.display.textContent = text;
        if (text.length === displayLength) return;
        displayLength = text.length;
        const size = Math.min(24, 192 / Math.max(8, displayLength));
        elements.display.style.setProperty("--time-font-size", `${size}cqw`);
        fitTimeWidth();
    }

    function renderButtons(status) {
        if (status === renderedStatus) return;
        elements.stopwatch.dataset.state = status;
        elements.leftButton.disabled = status === "ready";
        elements.leftButton.textContent = status === "paused" ? "リセット" : "ラップ";
        elements.rightButton.textContent = status === "running" ? "停止" : "開始";
        renderedStatus = status;
    }

    function renderLapValues(row, lap) {
        for (const [index, column] of LAP_COLUMNS.entries()) {
            const text = column.text(lap);
            const cell = row.children[index];
            if (cell.textContent !== text) cell.textContent = text;
        }
    }

    function createLapRow(lap) {
        const row = document.createElement("div");
        row.className = "lap";
        for (const column of LAP_COLUMNS) {
            const cell = document.createElement("span");
            cell.className = column.className;
            row.appendChild(cell);
        }
        renderLapValues(row, lap);
        return row;
    }

    function renderLapHighlights(laps) {
        const highlights = getLapHighlights(laps);
        // 以前と今回の最速・最遅の行だけを更新する。
        const affectedRows = new Set([
            renderedHighlights.fastestIndex, renderedHighlights.slowestIndex,
            highlights.fastestIndex, highlights.slowestIndex
        ]);
        for (const index of affectedRows) {
            const row = elements.lapList.children[index];
            if (!row) continue;
            row.classList.toggle("is-fast", index === highlights.fastestIndex);
            row.classList.toggle("is-slow", index === highlights.slowestIndex);
        }
        renderedHighlights = highlights;
    }

    function renderLaps(laps) {
        // モデルの一覧は変更不可。参照が同じなら行と色分けの更新は不要。
        if (laps === renderedLaps) return;
        elements.lapHeader.hidden = laps.length === 0;
        while (elements.lapList.children.length > laps.length) {
            elements.lapList.removeChild(elements.lapList.lastElementChild);
        }
        // 既存の行を残し、停止・再開時のスクロール位置を維持する。
        for (let index = 0; index < laps.length; index++) {
            const row = elements.lapList.children[index];
            if (!row) elements.lapList.appendChild(createLapRow(laps[index]));
            else if (laps[index] !== renderedLaps?.[index]) renderLapValues(row, laps[index]);
        }
        renderLapHighlights(laps);
        renderedLaps = laps;
    }

    const resizeObserver = new document.defaultView.ResizeObserver(fitTimeWidth);
    resizeObserver.observe(elements.timeFace);
    if (document.fonts) {
        document.fonts.ready.then(fitTimeWidth);
    }

    return {
        render({ status, elapsed, laps }) {
            if (disposed) return;
            renderButtons(status);
            renderTime(elapsed);
            renderLaps(laps);
        },
        renderTime,
        scrollLapsToEnd() { elements.laps.scrollTop = elements.laps.scrollHeight; },
        scrollLapsToStart() { elements.laps.scrollTop = 0; },
        bindControls({ toggleRunning, handleLeftButton }) {
            elements.rightButton.addEventListener("click", toggleRunning);
            elements.leftButton.addEventListener("click", handleLeftButton);
            return () => {
                elements.rightButton.removeEventListener("click", toggleRunning);
                elements.leftButton.removeEventListener("click", handleLeftButton);
            };
        },
        destroy() {
            disposed = true;
            resizeObserver.disconnect();
        }
    };
}
