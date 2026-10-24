import { createLapImages } from "./lap-export.js";

// 計測モデルから独立した、画像のプレビューと端末への受け渡し。
export function createExportPreview({ document, window, createImages = createLapImages }) {
    const dialog = document.getElementById("exportDialog");
    const status = document.getElementById("exportStatus");
    const images = document.getElementById("exportImages");
    const closeButton = document.getElementById("closeExport");
    const shareButton = document.getElementById("shareExport");
    const exportButton = document.getElementById("exportButton");
    let files = [];
    let urls = [];
    let generation = 0;
    let pending = null;
    let sharing = false;
    let disposed = false;
    let sessionActive = false;

    function isCurrent(job) {
        return !disposed && sessionActive && dialog.open && job === generation;
    }

    function canShare() {
        try {
            return files.length > 0 && typeof window.navigator.share === "function"
                && window.navigator.canShare?.({ files }) === true;
        } catch {
            return false;
        }
    }

    function releaseImages() {
        for (const url of urls) window.URL.revokeObjectURL(url);
        urls = [];
        files = [];
        images.replaceChildren();
    }

    function release() {
        if (!sessionActive) return;
        sessionActive = false;
        generation++;
        pending?.abort();
        pending = null;
        sharing = false;
        releaseImages();
        status.textContent = "";
        if (!disposed) exportButton.focus({ preventScroll: true });
    }

    function close() {
        if (!dialog.open) return;
        dialog.close();
        release();
    }

    function handleClose() {
        // 以前のcloseイベントが、直後に開いた新しいプレビューを消さないようにする。
        if (!dialog.open) release();
    }

    function appendImage(file, index, count) {
        const url = window.URL.createObjectURL(file);
        urls.push(url);
        const figure = document.createElement("figure");
        const caption = document.createElement("figcaption");
        caption.textContent = `${index + 1} / ${count}`;
        const image = document.createElement("img");
        image.src = url;
        image.alt = `ラップ一覧の画像 ${index + 1} / ${count}`;
        image.loading = "lazy";
        const download = document.createElement("a");
        download.href = url;
        download.download = file.name;
        download.textContent = "この画像をダウンロード";
        figure.appendChild(caption);
        figure.appendChild(image);
        figure.appendChild(download);
        images.appendChild(figure);
    }

    function renderFiles(generated) {
        files = generated;
        files.forEach((file, index) => appendImage(file, index, files.length));
        const supported = canShare();
        shareButton.hidden = !supported;
        shareButton.disabled = false;
        shareButton.textContent = files.length === 1 ? "共有・保存" : `共有・保存（${files.length}枚）`;
        status.textContent = supported
            ? `${files.length}枚の画像を用意しました。共有メニューから保存先を選べます。`
            : "各画像のダウンロードから保存できます。iPhoneでは画像の長押しもお試しください。";
    }

    function renderFailure(error) {
        releaseImages();
        shareButton.hidden = true;
        if (error.name !== "AbortError") {
            status.textContent = "画像を作成できませんでした。記録はそのまま残っています。閉じてからもう一度お試しください。";
        }
    }

    async function share() {
        if (disposed || !dialog.open || sharing || !canShare()) return;
        const job = generation;
        sharing = true;
        shareButton.disabled = true;
        try {
            // このクリックの中で共有を開始し、ユーザー操作の有効期限を保つ。
            await window.navigator.share({ files });
        } catch (error) {
            if (isCurrent(job) && error.name !== "AbortError") {
                status.textContent = "共有できませんでした。各画像のダウンロードをご利用ください。";
            }
        } finally {
            if (isCurrent(job)) {
                sharing = false;
                shareButton.disabled = false;
            }
        }
    }

    closeButton.addEventListener("click", close);
    dialog.addEventListener("close", handleClose);
    shareButton.addEventListener("click", share);

    return {
        async open(state) {
            if (disposed || dialog.open) return;
            const job = ++generation;
            const cancellation = new AbortController();
            pending = cancellation;
            status.textContent = "画像を作成しています…";
            shareButton.disabled = true;
            shareButton.hidden = false;
            images.replaceChildren();
            dialog.showModal();
            sessionActive = true;
            try {
                const generated = await createImages(state, {
                    document, FileConstructor: window.File, signal: cancellation.signal,
                    onProgress(done, total) {
                        if (isCurrent(job)) status.textContent = `画像を作成しています… ${done} / ${total}`;
                    }
                });
                if (isCurrent(job)) renderFiles(generated);
            } catch (error) {
                if (isCurrent(job)) renderFailure(error);
            } finally {
                if (job === generation) pending = null;
            }
        },
        destroy() {
            if (disposed) return;
            disposed = true;
            if (dialog.open) dialog.close();
            release();
            closeButton.removeEventListener("click", close);
            dialog.removeEventListener("close", handleClose);
            shareButton.removeEventListener("click", share);
        }
    };
}
