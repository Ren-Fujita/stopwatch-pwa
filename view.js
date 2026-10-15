import { formatTime, getLapHighlights } from "./stopwatch.js";

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
    let disposed = false;

    function fitTimeWidth() {
        const width = Math.max(elements.display.offsetWidth, elements.display.scrollWidth);
        if (!width) return;
        const scale = Math.min(1.3, elements.timeFace.clientWidth * 0.96 / width);
        elements.display.style.setProperty("--time-width-scale", scale);
    }

    function renderTime(milliseconds) {
        const text = formatTime(milliseconds);
        if (elements.display.textContent !== text) elements.display.textContent = text;
        if (text.length === displayLength) return;
        displayLength = text.length;
        const size = Math.min(24, 192 / Math.max(8, displayLength));
        elements.display.style.setProperty("--time-font-size", `${size}cqw`);
        fitTimeWidth();
    }

    function renderButtons(status) {
        elements.stopwatch.dataset.state = status;
        elements.leftButton.disabled = status === "ready";
        elements.leftButton.textContent = status === "paused" ? "リセット" : "ラップ";
        elements.rightButton.textContent = status === "running" ? "停止" : "開始";
    }

    function createLapRow(lap) {
        const row = document.createElement("div");
        row.className = "lap";
        const values = [
            ["lap-number", String(lap.number)],
            ["lap-total", formatTime(lap.total)],
            ["lap-time", formatTime(lap.duration)]
        ];
        for (const [className, text] of values) {
            const cell = document.createElement("span");
            cell.className = className;
            cell.textContent = text;
            row.appendChild(cell);
        }
        return row;
    }

    function renderLaps(laps) {
        elements.lapHeader.hidden = laps.length === 0;
        if (elements.lapList.children.length > laps.length) elements.lapList.replaceChildren();
        // 既存の行を残し、停止・再開時のスクロール位置を維持する。
        for (let index = elements.lapList.children.length; index < laps.length; index++) {
            elements.lapList.appendChild(createLapRow(laps[index]));
        }
        const { fastestIndex, slowestIndex } = getLapHighlights(laps);
        Array.from(elements.lapList.children).forEach((row, index) => {
            row.classList.toggle("is-fast", index === fastestIndex);
            row.classList.toggle("is-slow", index === slowestIndex);
        });
    }

    const resizeObserver = new document.defaultView.ResizeObserver(fitTimeWidth);
    resizeObserver.observe(elements.timeFace);
    if (document.fonts) {
        document.fonts.ready.then(() => { if (!disposed) fitTimeWidth(); });
    }

    return {
        render({ status, elapsed, laps }) {
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
