import { createStopwatch } from "./stopwatch.js";
import { createStopwatchStorage } from "./storage.js";
import { createStopwatchView } from "./view.js";
import { createStopwatchController } from "./controller.js";
import { createExportPreview } from "./export-preview.js";

const storage = createStopwatchStorage();
const stopwatch = createStopwatch({ savedState: storage.load() });
const view = createStopwatchView(document);
const exporter = createExportPreview({ document, window });

createStopwatchController({ stopwatch, storage, view, document, window, exporter });

if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("./sw.js", { scope: "./", updateViaCache: "none" })
        .catch(error => console.warn("オフライン用データを準備できませんでした。", error));
}
