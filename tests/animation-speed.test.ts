import assert from "node:assert/strict";
import test from "node:test";
import {
  ANIMATION_SPEED_OPTIONS,
  advanceAnimationElapsed,
  animationSpeedAt,
  animationSpeedIndex,
  scaledAnimationDuration,
} from "../app/animationSpeed.ts";

test("animation speed control exposes the requested five discrete settings", () => {
  assert.deepEqual(ANIMATION_SPEED_OPTIONS, [0.25, 0.5, 1, 2, 4]);
  ANIMATION_SPEED_OPTIONS.forEach((speed, index) => {
    assert.equal(animationSpeedAt(index), speed);
    assert.equal(animationSpeedIndex(speed), index);
  });
});

test("animation durations scale inversely and retain a safe frame floor", () => {
  assert.equal(scaledAnimationDuration(1000, 0.25), 4000);
  assert.equal(scaledAnimationDuration(1000, 4), 250);
  assert.equal(scaledAnimationDuration(10, 4), 16);
});

test("an in-progress animation immediately uses the latest selected speed", () => {
  const afterSlowFrame = advanceAnimationElapsed(0, 100, 0.25);
  const afterFastFrame = advanceAnimationElapsed(afterSlowFrame, 100, 4);

  assert.equal(afterSlowFrame, 25);
  assert.equal(afterFastFrame, 425);
});
