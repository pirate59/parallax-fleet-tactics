import assert from "node:assert/strict";
import test from "node:test";
import { spectatorOverviewFor } from "../app/spectatorCamera.ts";

const compactFleet = [
  { position: [-5, 0, -3] as [number, number, number], hull: 100, modelScale: 1 },
  { position: [5, 2, 3] as [number, number, number], hull: 100, modelScale: 1 },
];

test("spectator overview centres the fleet from an elevated oblique angle", () => {
  const view = spectatorOverviewFor(compactFleet, 16 / 9, 0);

  assert.ok(view.position[1] > view.target[1]);
  assert.notEqual(view.position[0], view.target[0]);
  assert.notEqual(view.position[2], view.target[2]);
  assert.equal(view.fov, 52);
});

test("spectator overview pulls back for a wider battle", () => {
  const wideFleet = compactFleet.map((ship, index) => ({
    ...ship,
    position: [index ? 19 : -19, ship.position[1], index ? 18 : -18] as [number, number, number],
  }));

  assert.ok(spectatorOverviewFor(wideFleet, 16 / 9).distance > spectatorOverviewFor(compactFleet, 16 / 9).distance);
});

test("successive overview variants use distinct cinematic sides while preserving framing distance", () => {
  const views = Array.from({ length: 6 }, (_, index) => spectatorOverviewFor(compactFleet, 16 / 9, index));
  const positions = new Set(views.map((view) => view.position.map((value) => value.toFixed(3)).join(",")));

  assert.equal(positions.size, 6);
  views.forEach((view) => {
    assert.ok(view.position[1] > view.target[1]);
    assert.equal(view.distance, views[0].distance);
  });
});
