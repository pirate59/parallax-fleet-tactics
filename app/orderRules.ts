export type FlightMode = "focus-fire" | "normal" | "extra-move";

export type FlightModeRule = {
  label: string;
  shortRule: string;
  description: string;
  movementMultiplier: 0 | 1 | 2;
  salvos: 0 | 1 | 2;
};

export const FLIGHT_MODE_RULES: Record<FlightMode, FlightModeRule> = {
  "focus-fire": {
    label: "Focus Fire",
    shortRule: "0× move · 2× fire",
    description: "Hold position and fire every mounted weapon twice.",
    movementMultiplier: 0,
    salvos: 2,
  },
  normal: {
    label: "Normal",
    shortRule: "1× move · 1× fire",
    description: "Use the ship's standard movement and optional single volley.",
    movementMultiplier: 1,
    salvos: 1,
  },
  "extra-move": {
    label: "Extra Move",
    shortRule: "2× move · 0× fire",
    description: "Double the current movement range and keep all weapons safe.",
    movementMultiplier: 2,
    salvos: 0,
  },
};

export const FLIGHT_MODE_ORDER: FlightMode[] = ["focus-fire", "normal", "extra-move"];

export function movementLimitFor(maxMove: number, mode: FlightMode | undefined) {
  return Math.max(0, maxMove) * FLIGHT_MODE_RULES[mode ?? "normal"].movementMultiplier;
}

export function salvosForOrder(order: { mode?: FlightMode; fire: boolean } | undefined): 0 | 1 | 2 {
  if (!order) return 0;
  const mode = order.mode ?? "normal";
  const salvos = FLIGHT_MODE_RULES[mode].salvos;
  return mode === "normal" && !order.fire ? 0 : salvos;
}

export function fireStateForMode(mode: FlightMode, normalFire = true) {
  return mode === "normal" ? normalFire : FLIGHT_MODE_RULES[mode].salvos > 0;
}
