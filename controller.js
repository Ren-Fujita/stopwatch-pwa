// 操作・画面の表示状態・保存の連携を担当する。DOMの描画はviewに任せる。
export function createStopwatchController({ stopwatch, storage, view, document, window }) {
    let animationFrame = null;
    let disposed = false;

    function save() {
        storage.save(stopwatch.snapshot());
    }

    function stopAnimation() {
        if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
        animationFrame = null;
    }

    function updateTime() {
        animationFrame = null;
        if (disposed || document.hidden || stopwatch.status !== "running") return;
        view.renderTime(stopwatch.elapsedTime());
        animationFrame = window.requestAnimationFrame(updateTime);
    }

    // 起動・操作・画面復帰で同じ描画経路を使い、描画ループの重複を防ぐ。
    function refresh() {
        stopAnimation();
        view.render({
            status: stopwatch.status,
            elapsed: stopwatch.elapsedTime(),
            laps: stopwatch.laps
        });
        if (!document.hidden && stopwatch.status === "running") {
            animationFrame = window.requestAnimationFrame(updateTime);
        }
    }

    function toggleRunning() {
        if (stopwatch.status === "running") stopwatch.stop();
        else stopwatch.start();
        refresh();
        save();
    }

    function handleLeftButton() {
        if (stopwatch.status === "running") {
            stopwatch.recordLap();
            refresh();
            view.scrollLapsToEnd();
        } else if (stopwatch.status === "paused") {
            stopwatch.reset();
            refresh();
            view.scrollLapsToStart();
        } else {
            return;
        }
        save();
    }

    function handleVisibilityChange() {
        if (document.hidden) {
            stopAnimation();
            save();
        } else {
            refresh();
        }
    }

    function handlePageHide() {
        stopAnimation();
        save();
    }

    const unbindControls = view.bindControls({ toggleRunning, handleLeftButton });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", refresh);
    refresh();

    return {
        destroy() {
            if (disposed) return;
            disposed = true;
            stopAnimation();
            unbindControls();
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("pagehide", handlePageHide);
            window.removeEventListener("pageshow", refresh);
            view.destroy();
        }
    };
}
