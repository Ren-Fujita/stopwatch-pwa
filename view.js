import { formatTime } from "./stopwatch.js";
import { createLapListView } from "./lap-list.js";

export function createStopwatchView(document) {
    const elements = {
        stopwatch: document.querySelector(".stopwatch"),
        timeFace: document.querySelector(".timer-face"),
        display: document.getElementById("display"),
        leftButton: document.getElementById("leftButton"),
        rightButton: document.getElementById("rightButton"),
        exportButton: document.getElementById("exportButton"),
        laps: document.querySelector(".laps"),
        lapHeader: document.getElementById("lapHeader"),
        lapList: document.getElementById("lapList")
    };
    const lapList = createLapListView({ document, list: elements.lapList, header: elements.lapHeader });
    let displayLength = 0;
    let renderedStatus = null;
    let disposed = false;
    let exportBusy = false;
    let canExport = false;

    function updateExportButton() {
        elements.exportButton.disabled = exportBusy || !canExport;
        elements.exportButton.ariaBusy = String(exportBusy);
    }

    function fitTimeWidth() {
        if (disposed) return;
        const width = Math.max(elements.display.offsetWidth, elements.display.scrollWidth);
        if (!width) return;
        const scale = Math.min(1.3, elements.timeFace.clientWidth * 0.96 / width);
        elements.display.style.setProperty("--time-width-scale", scale);
    }

    function renderClock(milliseconds) {
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

    const resizeObserver = new document.defaultView.ResizeObserver(fitTimeWidth);
    resizeObserver.observe(elements.timeFace);
    if (document.fonts) document.fonts.ready.then(fitTimeWidth);

    return {
        render({ status, elapsed, laps, currentLap = null }) {
            if (disposed) return;
            renderButtons(status);
            renderClock(elapsed);
            lapList.render(laps, currentLap);
            canExport = status === "paused" && (laps.length > 0 || currentLap !== null);
            updateExportButton();
        },
        renderTime({ elapsed, currentLap = null }) {
            if (disposed) return;
            renderClock(elapsed);
            lapList.renderCurrentLap(currentLap);
        },
        scrollLapsToEnd() { elements.laps.scrollTop = elements.laps.scrollHeight; },
        scrollLapsToStart() { elements.laps.scrollTop = 0; },
        setExportBusy(busy) {
            if (disposed) return;
            exportBusy = busy;
            updateExportButton();
        },
        bindControls({ toggleRunning, handleLeftButton, exportLaps }) {
            elements.rightButton.addEventListener("click", toggleRunning);
            elements.leftButton.addEventListener("click", handleLeftButton);
            if (exportLaps) elements.exportButton.addEventListener("click", exportLaps);
            return () => {
                elements.rightButton.removeEventListener("click", toggleRunning);
                elements.leftButton.removeEventListener("click", handleLeftButton);
                if (exportLaps) elements.exportButton.removeEventListener("click", exportLaps);
            };
        },
        destroy() {
            disposed = true;
            resizeObserver.disconnect();
        }
    };
}
