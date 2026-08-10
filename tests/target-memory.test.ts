import assert from "node:assert/strict";
import test from "node:test";
import { preferredTargetId, rememberOrderedTargets } from "../app/targetMemory.ts";

const ships = [
  { id: "hammerhead", team: "player" as const, hull: 100 },
  { id: "raider-a", team: "enemy" as const, hull: 40 },
  { id: "raider-b", team: "enemy" as const, hull: 55 },
];

test("a ship defaults to its surviving target from the prior turn", () => {
  const remembered = rememberOrderedTargets(ships, {
    hammerhead: { targetId: "raider-b" },
  });
  const hammerhead = remembered.find((ship) => ship.id === "hammerhead")!;

  assert.equal(hammerhead.lastTargetId, "raider-b");
  assert.equal(preferredTargetId(hammerhead, remembered), "raider-b");
});

test("target selection falls back when the remembered ship was destroyed", () => {
  const current = ships.map((ship) => ship.id === "raider-b" ? { ...ship, hull: 0 } : ship);
  const hammerhead = { ...current[0], lastTargetId: "raider-b" };

  assert.equal(preferredTargetId(hammerhead, current), "raider-a");
});

test("enemy target memory can retain friendly or allied targets", () => {
  const battle = [
    { id: "enemy", team: "enemy" as const, hull: 50, lastTargetId: "wingmate" },
    { id: "command", team: "player" as const, hull: 50 },
    { id: "wingmate", team: "ally" as const, hull: 50 },
  ];

  assert.equal(preferredTargetId(battle[0], battle), "wingmate");
});
