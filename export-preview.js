import { createLapImages } from "./lap-export.js";

// 計測モデルから独立した、画像のプレビューと端末への受け渡し。
export function createExportPreview({ document, window, createImages = createLapImages }) {
    const dialog = document.getElementById("exportDialog");
    const status = document.getElementById("exportStatus");
    const images = document.getElementById("exportImages");
    const closeButton = document.getElementById("closeExport");
    const shareButton = document.getElementById("shareExport");
    const exportButton = document.getElementById("exportButton");
    let session = null;
    let disposed = false;

    function isCurrent(current) {
        return !disposed && current !== null && current === session && dialog.open;
    }

    function canShare(files) {
        try {
            return files.length > 0 && typeof window.navigator.share === "function"
                && window.navigator.canShare?.({ files }) === true;
        } catch {
            return false;
        }
    }

    function releaseImages(current) {
        for (const url of current.urls) window.URL.revokeObjectURL(url);
        current.urls = [];
        current.files = [];
        images.replaceChildren();
    }

    function release() {
        const previous = session;
        if (!previous) return;
        // 先に無効化し、古い生成・共有処理からの更新を止めてから解放する。
        session = null;
        previous.cancellation.abort();
        releaseImages(previous);
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

    function appendImage(current, file, index, count) {
        const url = window.URL.createObjectURL(file);
        current.urls.push(url);
        const figure = document.createElement("figure");
        const caption = document.createElement("figcaption");
        caption.textContent = `${index + 1} / ${count}`;
        const image = document.createElement("img");
        image.src = url;
        image.alt = `ラップ一覧の画像 ${index + 1} / ${count}`;
        image.loading = "lazy";
        figure.appendChild(caption);
        figure.appendChild(image);
        images.appendChild(figure);
    }

    function renderFiles(current, files) {
        current.files = files;
        files.forEach((file, index) => appendImage(current, file, index, files.length));
        const supported = canShare(files);
        shareButton.hidden = !supported;
        shareButton.disabled = false;
        shareButton.textContent = files.length === 1 ? "共有・保存" : `共有・保存（${files.length}枚）`;
        status.textContent = supported
            ? `${files.length}枚の画像を用意しました。共有メニューから保存先を選べます。`
            : "この端末では共有メニューを利用できません。画像を長押しすると保存できる場合があります。";
    }

    function renderFailure(current, error) {
        releaseImages(current);
        shareButton.hidden = true;
        if (error.name !== "AbortError") {
            status.textContent = "画像を作成できませんでした。記録はそのまま残っています。閉じてからもう一度お試しください。";
        }
    }

    async function share() {
        const current = session;
        if (!isCurrent(current) || current.sharing || !canShare(current.files)) return;
        current.sharing = true;
        shareButton.disabled = true;
        try {
            // このクリックの中で共有を開始し、ユーザー操作の有効期限を保つ。
            await window.navigator.share({ files: current.files });
        } catch (error) {
            if (isCurrent(current) && error.name !== "AbortError") {
                status.textContent = "共有できませんでした。もう一度「共有・保存」をお試しください。";
            }
        } finally {
            if (isCurrent(current)) {
                current.sharing = false;
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
            // ブラウザーのcloseイベントが届く前に再度開かれた場合も解放する。
            release();
            const current = { files: [], urls: [], cancellation: new AbortController(), sharing: false };
            status.textContent = "画像を作成しています…";
            shareButton.disabled = true;
            shareButton.hidden = false;
            images.replaceChildren();
            dialog.showModal();
            session = current;
            try {
                const generated = await createImages(state, {
                    document, FileConstructor: window.File, signal: current.cancellation.signal,
                    onProgress(done, total) {
                        if (isCurrent(current)) status.textContent = `画像を作成しています… ${done} / ${total}`;
                    }
                });
                if (isCurrent(current)) renderFiles(current, generated);
            } catch (error) {
                if (isCurrent(current)) renderFailure(current, error);
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
