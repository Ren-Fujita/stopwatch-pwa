import { createStopwatch, formatTime } from "./stopwatch.js";

(() => {
    "use strict";

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

    const STORAGE_KEY = `stopwatch-pwa-state-v1:${new URL("./", import.meta.url).pathname}`;

    function readSavedState() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY));
        } catch {
            return null;
        }
    }

    const stopwatch = createStopwatch({ savedState: readSavedState() });

    function saveState() {
        try {
            if (stopwatch.status === "ready") localStorage.removeItem(STORAGE_KEY);
            else localStorage.setItem(STORAGE_KEY, JSON.stringify(stopwatch.snapshot()));
        } catch {
            // 保存できない環境でも、開いている間の計測は利用できる。
        }
    }
    let animationFrame = null;
    let displayLength = 0;

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
        elements.display.style.setProperty("--time-font-size", size + "cqw");
        fitTimeWidth();
    }

    function renderButtons() {
        const { status } = stopwatch;
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

    function renderLapAppearance() {
        const { laps } = stopwatch;
        elements.lapHeader.hidden = laps.length === 0;
        let minimum = Infinity;
        let maximum = -Infinity;
        let fastest = -1;
        let slowest = -1;

        // 色分けは表示と同じ1/100秒単位。同タイムなら先の記録を優先する。
        laps.forEach((lap, index) => {
            const time = Math.floor(lap.duration / 10);
            if (time < minimum) { minimum = time; fastest = index; }
            if (time > maximum) { maximum = time; slowest = index; }
        });
        const useColors = laps.length > 1 && minimum !== maximum;
        Array.from(elements.lapList.children).forEach((row, index) => {
            row.classList.toggle("is-fast", useColors && index === fastest);
            row.classList.toggle("is-slow", useColors && index === slowest);
        });
    }

    function updateDisplay() {
        if (stopwatch.status !== "running") return;
        renderTime(stopwatch.elapsedTime());
        animationFrame = requestAnimationFrame(updateDisplay);
    }

    function cancelDisplayUpdate() {
        if (animationFrame !== null) cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }

    function toggleRunning() {
        if (stopwatch.status === "running") {
            stopwatch.stop();
            cancelDisplayUpdate();
            renderTime(stopwatch.elapsedTime());
        } else {
            stopwatch.start();
            updateDisplay();
        }
        renderButtons();
        saveState();
    }

    function handleLeftButton() {
        if (stopwatch.status === "running") {
            const lap = stopwatch.recordLap();
            elements.lapList.appendChild(createLapRow(lap));
            renderLapAppearance();
            renderTime(lap.total);
            elements.laps.scrollTop = elements.laps.scrollHeight;
        } else {
            cancelDisplayUpdate();
            stopwatch.reset();
            elements.lapList.replaceChildren();
            renderLapAppearance();
            renderTime(0);
            renderButtons();
            elements.laps.scrollTop = 0;
        }
        saveState();
    }

    document.addEventListener("visibilitychange", () => {
        cancelDisplayUpdate();
        if (document.hidden) saveState();
        else {
            renderTime(stopwatch.elapsedTime());
            if (stopwatch.status === "running") updateDisplay();
        }
    });
    window.addEventListener("pagehide", saveState);
    window.addEventListener("pageshow", () => {
        cancelDisplayUpdate();
        renderTime(stopwatch.elapsedTime());
        if (!document.hidden && stopwatch.status === "running") updateDisplay();
    });

    for (const lap of stopwatch.laps) elements.lapList.appendChild(createLapRow(lap));
    elements.leftButton.addEventListener("click", handleLeftButton);
    elements.rightButton.addEventListener("click", toggleRunning);
    new ResizeObserver(fitTimeWidth).observe(elements.timeFace);
    if (document.fonts) document.fonts.ready.then(fitTimeWidth);
    renderButtons();
    renderTime(stopwatch.elapsedTime());
    renderLapAppearance();
    if (!document.hidden && stopwatch.status === "running") updateDisplay();
})();

if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("./sw.js", { scope: "./", updateViaCache: "none" })
        .catch(error => console.warn("オフライン用データを準備できませんでした。", error));
}
