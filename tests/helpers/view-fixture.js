// 描画ロジックのテスト用。レイアウトやブラウザー固有の描画は再現しない。
class Element extends EventTarget {
    children = [];
    dataset = {};
    hidden = false;
    disabled = false;
    scrollTop = 0;
    scrollHeight = 400;
    offsetWidth = 280;
    scrollWidth = 280;
    clientWidth = 358;
    textContent = "";
    open = false;
    focusCount = 0;
    classes = new Set();
    properties = new Map();
    classList = {
        toggle: (name, enabled) => {
            if (enabled) this.classes.add(name);
            else this.classes.delete(name);
        },
        contains: name => this.classes.has(name)
    };
    style = {
        setProperty: (name, value) => this.properties.set(name, value),
        getPropertyValue: name => this.properties.get(name) ?? ""
    };
    set className(value) { this.classes = new Set(value.split(/\s+/).filter(Boolean)); }
    get className() { return [...this.classes].join(" "); }
    get lastElementChild() { return this.children.at(-1) ?? null; }
    appendChild(child) { this.children.push(child); return child; }
    removeChild(child) { this.children.splice(this.children.indexOf(child), 1); return child; }
    replaceChildren(...children) { this.children = children; }
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatchEvent(new Event("close")); }
    focus() { this.focusCount++; }
}

export function createViewFixture() {
    const names = ["stopwatch", "timeFace", "display", "leftButton", "rightButton", "laps", "lapHeader", "lapList",
        "exportButton", "exportDialog", "exportStatus", "exportImages", "closeExport", "shareExport"];
    const nodes = Object.fromEntries(names.map(name => [name, new Element()]));
    const observers = [];
    let resolveFonts;
    const fontsReady = new Promise(resolve => { resolveFonts = resolve; });
    const selectors = {
        ".stopwatch": nodes.stopwatch, ".timer-face": nodes.timeFace, ".laps": nodes.laps
    };
    const document = Object.assign(new EventTarget(), {
        hidden: false,
        querySelector: selector => selectors[selector] ?? null,
        getElementById: id => nodes[id] ?? null,
        createElement: () => new Element(),
        fonts: { ready: fontsReady },
        defaultView: {
            ResizeObserver: class {
                disconnected = false;
                constructor(callback) { this.callback = callback; observers.push(this); }
                observe(target) { this.target = target; }
                disconnect() { this.disconnected = true; }
            }
        }
    });
    return { document, nodes, observers, resolveFonts };
}
