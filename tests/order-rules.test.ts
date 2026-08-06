import assert from "node:assert/strict";
import test from "node:test";
import { fireStateForMode, movementLimitFor, salvosForOrder } from "../app/orderRules.ts";

test("flight modes derive movement from the ship's current upgraded range", () => {
  assert.equal(movementLimitFor(6.5, "focus-fire"), 0);
  assert.equal(movementLimitFor(6.5, "normal"), 6.5);
  assert.equal(movementLimitFor(6.5, "extra-move"), 13);
  assert.equal(movementLimitFor(9.5, "extra-move"), 19);
});

test("flight modes enforce their firing trade-offs", () => {
  assert.equal(salvosForOrder({ mode: "focus-fire", fire: false }), 2);
  assert.equal(salvosForOrder({ mode: "normal", fire: true }), 1);
  assert.equal(salvosForOrder({ mode: "normal", fire: false }), 0);
  assert.equal(salvosForOrder({ mode: "extra-move", fire: true }), 0);
  assert.equal(fireStateForMode("focus-fire", false), true);
  assert.equal(fireStateForMode("extra-move", true), false);
});
