import { createStopwatch } from "./stopwatch.js";
import { createStopwatchStorage } from "./storage.js";
import { createStopwatchView } from "./view.js";
import { createStopwatchController } from "./controller.js";

const storage = createStopwatchStorage();
const stopwatch = createStopwatch({ savedState: storage.load() });
const view = createStopwatchView(document);

createStopwatchController({ stopwatch, storage, view, document, window });

if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("./sw.js", { scope: "./", updateViaCache: "none" })
        .catch(error => console.warn("オフライン用データを準備できませんでした。", error));
}
