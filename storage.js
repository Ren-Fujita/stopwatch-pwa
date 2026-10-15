// 保存キーとデータ形式を維持し、公開済みのアプリの記録を引き継ぐ。
export function createStopwatchStorage({
    baseUrl = import.meta.url,
    getStorage = () => globalThis.localStorage
} = {}) {
    const key = `stopwatch-pwa-state-v1:${new URL("./", baseUrl).pathname}`;

    return {
        load() {
            try {
                return JSON.parse(getStorage().getItem(key));
            } catch {
                return null;
            }
        },
        save(snapshot) {
            try {
                const storage = getStorage();
                if (snapshot.status === "ready") storage.removeItem(key);
                else storage.setItem(key, JSON.stringify(snapshot));
                return true;
            } catch {
                // 保存できない環境でも、開いている間の計測は利用できる。
                return false;
            }
        }
    };
}
