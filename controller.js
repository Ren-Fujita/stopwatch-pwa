function listen(target, event, handler) {
    target.addEventListener(event, handler);
    return () => target.removeEventListener(event, handler);
}

// 操作・画面の表示状態・保存の連携を担当する。DOMの描画はviewに任せる。
export function createStopwatchController({ stopwatch, storage, view, document, window, exporter }) {
    let animationFrame = null;
    let disposed = false;
    let exporting = false;

    function save() {
        storage.save(stopwatch.snapshot());
    }

    function shouldAnimate() {
        return !disposed && !document.hidden && stopwatch.status === "running";
    }

    function stopAnimation() {
        if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }

    function updateTime() {
        animationFrame = null;
        if (!shouldAnimate()) return;
        view.renderTime(stopwatch.read());
        animationFrame = window.requestAnimationFrame(updateTime);
    }

    // 起動・操作・画面復帰で同じ描画経路を使い、描画ループの重複を防ぐ。
    function refresh() {
        if (disposed) return;
        stopAnimation();
        view.render(stopwatch.read());
        if (shouldAnimate()) {
            animationFrame = window.requestAnimationFrame(updateTime);
        }
    }

    function applyChange(change, afterRender) {
        if (disposed) return;
        change();
        refresh();
        afterRender?.();
        save();
    }

    function toggleRunning() {
        applyChange(() => {
            if (stopwatch.status === "running") stopwatch.stop();
            else stopwatch.start();
        });
    }

    function handleLeftButton() {
        if (stopwatch.status === "running") {
            applyChange(() => stopwatch.recordLap(), () => view.scrollLapsToEnd());
        } else if (stopwatch.status === "paused") {
            applyChange(() => stopwatch.reset(), () => view.scrollLapsToStart());
        }
    }

    function suspend() {
        if (disposed) return;
        stopAnimation();
        save();
    }

    async function exportLaps() {
        if (disposed || exporting || !exporter || stopwatch.status !== "paused") return;
        exporting = true;
        view.setExportBusy(true);
        try {
            // 画像用の値を一度だけ取得し、ラップの確定や保存処理は行わない。
            await exporter.open(stopwatch.read());
        } finally {
            exporting = false;
            if (!disposed) view.setExportBusy(false);
        }
    }

    function handleVisibilityChange() {
        if (document.hidden) suspend();
        else refresh();
    }

    const unsubscribers = [
        view.bindControls({ toggleRunning, handleLeftButton, exportLaps }),
        listen(document, "visibilitychange", handleVisibilityChange),
        listen(window, "pagehide", suspend),
        listen(window, "pageshow", refresh)
    ];
    refresh();

    return {
        destroy() {
            if (disposed) return;
            disposed = true;
            stopAnimation();
            for (const unsubscribe of unsubscribers) unsubscribe();
            view.destroy();
            exporter?.destroy();
        }
    };
}
