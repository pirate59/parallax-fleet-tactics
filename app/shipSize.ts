import type { Shields } from "./combatEngine.ts";

export type ShipSizeClass = "shuttle" | "cruiser" | "large";

export type ShipSizeProfile = {
  label: string;
  durabilityMultiplier: number;
  modelScaleMultiplier: number;
  fleetPointCost: number;
};

export const SHIP_SIZE_PROFILES: Record<ShipSizeClass, ShipSizeProfile> = {
  shuttle: {
    label: "Shuttle",
    durabilityMultiplier: 0.5,
    modelScaleMultiplier: 0.72,
    fleetPointCost: 1,
  },
  cruiser: {
    label: "Cruiser",
    durabilityMultiplier: 1,
    modelScaleMultiplier: 1,
    fleetPointCost: 3,
  },
  large: {
    label: "Large",
    durabilityMultiplier: 2,
    modelScaleMultiplier: 1.45,
    fleetPointCost: 6,
  },
};

export function totalDurabilityMultiplier(sizeClass: ShipSizeClass, hullMultiplier = 1) {
  return SHIP_SIZE_PROFILES[sizeClass].durabilityMultiplier * Math.max(0, hullMultiplier);
}

export function resolveSizedDurability(
  baseHull: number,
  baseShields: Shields,
  sizeClass: ShipSizeClass,
  hullMultiplier = 1,
) {
  const multiplier = totalDurabilityMultiplier(sizeClass, hullMultiplier);
  const shields = Object.fromEntries(
    Object.entries(baseShields).map(([face, value]) => [face, Math.max(1, Math.round(value * multiplier))]),
  ) as Shields;

  return {
    hull: Math.max(1, Math.round(baseHull * multiplier)),
    shields,
    multiplier,
  };
}

export function resolveSizedModelScale(baseModelScale: number, sizeClass: ShipSizeClass) {
  return baseModelScale * SHIP_SIZE_PROFILES[sizeClass].modelScaleMultiplier;
}
