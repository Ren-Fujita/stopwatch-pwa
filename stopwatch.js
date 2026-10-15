// iOSのスリープ中は描画が止まるため、開始した実時刻との差から経過時間を求める。
export function createStopwatch({ now = Date.now, savedState = null } = {}) {
    let status = "ready";
    let startedAt = 0;
    let accumulatedTime = 0;
    const recordedLaps = [];

    const validTime = value => Number.isFinite(value) && value >= 0;
    function canRestore(state) {
        if (!state || state.version !== 1 || !["running", "paused"].includes(state.status)
            || !validTime(state.startedAt) || !validTime(state.accumulatedTime)
            || !Array.isArray(state.laps)) return false;
        let previousTotal = 0;
        for (let index = 0; index < state.laps.length; index++) {
            const lap = state.laps[index];
            if (!lap || lap.number !== index + 1 || !validTime(lap.total)
                || !validTime(lap.duration) || lap.total < previousTotal
                || Math.abs(lap.duration - (lap.total - previousTotal)) > 0.001) return false;
            previousTotal = lap.total;
        }
        return state.status !== "paused" || state.accumulatedTime >= previousTotal;
    }

    if (canRestore(savedState)) {
        status = savedState.status;
        startedAt = savedState.startedAt;
        accumulatedTime = savedState.accumulatedTime;
        for (const lap of savedState.laps) recordedLaps.push({ ...lap });
    }

    function elapsedTime() {
        const elapsed = accumulatedTime + (status === "running" ? Math.max(0, now() - startedAt) : 0);
        const lastLap = recordedLaps[recordedLaps.length - 1];
        return Math.max(elapsed, lastLap ? lastLap.total : 0);
    }

    return {
        get status() { return status; },
        get laps() { return recordedLaps; },
        elapsedTime,
        start() {
            if (status === "running") return;
            startedAt = now();
            status = "running";
        },
        stop() {
            if (status !== "running") return;
            accumulatedTime = elapsedTime();
            status = "paused";
        },
        recordLap() {
            if (status !== "running") return null;
            const total = elapsedTime();
            const previous = recordedLaps[recordedLaps.length - 1];
            const lap = {
                number: recordedLaps.length + 1,
                total,
                duration: total - (previous ? previous.total : 0)
            };
            recordedLaps.push(lap);
            return lap;
        },
        reset() {
            status = "ready";
            startedAt = 0;
            accumulatedTime = 0;
            recordedLaps.length = 0;
        },
        snapshot() {
            return {
                version: 1, status, startedAt, accumulatedTime,
                laps: recordedLaps.map(lap => ({ ...lap }))
            };
        }
    };
}

// 1時間未満は MM:SS.hh、1時間以上は HH:MM:SS.hh。
export function formatTime(milliseconds) {
    const pad = value => String(value).padStart(2, "0");
    const hundredths = Math.floor(Math.max(0, milliseconds) / 10);
    const seconds = Math.floor(hundredths / 100);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const time = `${pad(minutes % 60)}:${pad(seconds % 60)}.${pad(hundredths % 100)}`;
    return hours === 0 ? time : `${pad(hours)}:${time}`;
}
