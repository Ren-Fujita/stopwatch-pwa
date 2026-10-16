import { formatTime, getLapHighlights } from "./stopwatch.js";

const COLUMNS = [
    { className: "lap-number", text: lap => String(lap.number) },
    { className: "lap-total", text: lap => formatTime(lap.total) },
    { className: "lap-time", text: lap => formatTime(lap.duration) }
];

// 確定行・計測中行・見出しを、この部品の中で一貫して管理する。
export function createLapListView({ document, list, header }) {
    let renderedLaps = null;
    let renderedHighlights = { fastestIndex: -1, slowestIndex: -1 };

    function renderValues(row, lap) {
        for (const [index, column] of COLUMNS.entries()) {
            const text = column.text(lap);
            const cell = row.children[index];
            if (cell.textContent !== text) cell.textContent = text;
        }
    }

    function createRow(lap) {
        const row = document.createElement("div");
        row.className = "lap";
        for (const column of COLUMNS) {
            const cell = document.createElement("span");
            cell.className = column.className;
            row.appendChild(cell);
        }
        renderValues(row, lap);
        return row;
    }

    function trimRows(count) {
        while (list.children.length > count) list.removeChild(list.lastElementChild);
    }

    function updateHeader() {
        const hidden = list.children.length === 0;
        if (header.hidden !== hidden) header.hidden = hidden;
    }

    function renderCurrentLap(lap) {
        // 計測中の行は常に確定済みの行の直後に置く。
        const index = renderedLaps?.length ?? 0;
        if (!lap) trimRows(index);
        else if (list.children[index]) renderValues(list.children[index], lap);
        else list.appendChild(createRow(lap));
        updateHeader();
    }

    function renderHighlights(laps) {
        const highlights = getLapHighlights(laps);
        const affectedRows = new Set([
            renderedHighlights.fastestIndex, renderedHighlights.slowestIndex,
            highlights.fastestIndex, highlights.slowestIndex
        ]);
        for (const index of affectedRows) {
            const row = list.children[index];
            if (!row) continue;
            row.classList.toggle("is-fast", index === highlights.fastestIndex);
            row.classList.toggle("is-slow", index === highlights.slowestIndex);
        }
        renderedHighlights = highlights;
    }

    return {
        render(laps, currentLap = null) {
            if (laps !== renderedLaps) {
                trimRows(laps.length);
                for (let index = 0; index < laps.length; index++) {
                    const row = list.children[index];
                    if (!row) list.appendChild(createRow(laps[index]));
                    else if (laps[index] !== renderedLaps?.[index]) renderValues(row, laps[index]);
                }
                renderHighlights(laps);
                renderedLaps = laps;
            }
            renderCurrentLap(currentLap);
        },
        renderCurrentLap
    };
}
