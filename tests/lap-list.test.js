import test from "node:test";
import assert from "node:assert/strict";
import { createLapListView } from "../lap-list.js";
import { createViewFixture } from "./helpers/view-fixture.js";

test("current-row updates keep the header and confirmed rows in sync", () => {
    const { document, nodes } = createViewFixture();
    const view = createLapListView({ document, list: nodes.lapList, header: nodes.lapHeader });
    const completed = [];
    view.render(completed, { number: 1, total: 0, duration: 0 });
    assert.equal(nodes.lapList.children.length, 1);
    assert.equal(nodes.lapHeader.hidden, false);
    view.renderCurrentLap(null);
    assert.equal(nodes.lapList.children.length, 0);
    assert.equal(nodes.lapHeader.hidden, true);
    view.renderCurrentLap({ number: 1, total: 1000, duration: 1000 });
    assert.equal(nodes.lapList.children.length, 1);
    assert.equal(nodes.lapHeader.hidden, false);
    view.render([{ number: 1, total: 1000, duration: 1000 }], {
        number: 2, total: 1250, duration: 250
    });
    const confirmedRow = nodes.lapList.children[0];
    view.renderCurrentLap(null);
    assert.equal(nodes.lapList.children.length, 1);
    assert.equal(nodes.lapList.children[0], confirmedRow);
    assert.equal(nodes.lapHeader.hidden, false);
    assert.deepEqual(confirmedRow.children.map(cell => cell.textContent), ["1", "00:01.00", "00:01.00"]);
});
