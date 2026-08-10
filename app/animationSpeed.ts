export const ANIMATION_SPEED_OPTIONS = [0.25, 0.5, 1, 2, 4] as const;

export type AnimationSpeed = (typeof ANIMATION_SPEED_OPTIONS)[number];

export const DEFAULT_ANIMATION_SPEED: AnimationSpeed = 1;

export function animationSpeedIndex(speed: AnimationSpeed) {
  return Math.max(0, ANIMATION_SPEED_OPTIONS.indexOf(speed));
}

export function animationSpeedAt(index: number): AnimationSpeed {
  const safeIndex = Math.max(0, Math.min(ANIMATION_SPEED_OPTIONS.length - 1, Math.round(index)));
  return ANIMATION_SPEED_OPTIONS[safeIndex];
}

export function scaledAnimationDuration(milliseconds: number, speed: AnimationSpeed) {
  return Math.max(16, milliseconds / speed);
}
