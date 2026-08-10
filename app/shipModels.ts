import type { ShieldFace, Vec3 } from "./combatEngine.ts";

export type ModelAnchor = {
  position: Vec3;
  rotation?: Vec3;
};

export type WreckFragmentProfile = {
  position: Vec3;
  rotation: Vec3;
  size: Vec3;
};

export type ShipModelProfile = {
  id: string;
  label: string;
  weaponHardpoints: Record<string, ModelAnchor>;
  shieldAnchors: Record<ShieldFace, ModelAnchor>;
  engineAnchors: Vec3[];
  selectionRadius: number;
  targetRadius: number;
  hudOffsetMultiplier: number;
  wreck: {
    hullScale: Vec3;
    fragments: WreckFragmentProfile[];
  };
};

const STANDARD_WEAPON_HARDPOINTS: Record<string, ModelAnchor> = {
  primary: { position: [0, 0, -1.48] },
  dorsal: { position: [0, 0.62, 0] },
  "port-forward": { position: [-0.28, 0.12, -1.48] },
  "starboard-forward": { position: [0.28, 0.12, -1.48] },
};

const STANDARD_SHIELD_ANCHORS: Record<ShieldFace, ModelAnchor> = {
  fore: { position: [0, 0.28, -1.12] },
  aft: { position: [0, 0.18, 1.06] },
  port: { position: [-1.02, 0.16, 0.34], rotation: [0, 90, 0] },
  starboard: { position: [1.02, 0.16, 0.34], rotation: [0, 90, 0] },
  dorsal: { position: [0, 0.58, 0.02], rotation: [90, 0, 0] },
  ventral: { position: [0, -0.4, 0.06], rotation: [90, 0, 0] },
};

const STANDARD_WRECK = {
  hullScale: [1, 1, 1] as Vec3,
  fragments: [
    {
      position: [-0.72, 0.08, 0.35] as Vec3,
      rotation: [0, -0.18, -0.126] as Vec3,
      size: [1.05, 0.12, 0.55] as Vec3,
    },
    {
      position: [0.8, -0.12, 0.2] as Vec3,
      rotation: [0, 0.24, 0.168] as Vec3,
      size: [1.05, 0.12, 0.55] as Vec3,
    },
  ],
};

function standardProfile(id: string, label: string): ShipModelProfile {
  return {
    id,
    label,
    weaponHardpoints: STANDARD_WEAPON_HARDPOINTS,
    shieldAnchors: STANDARD_SHIELD_ANCHORS,
    engineAnchors: [[-0.48, -0.05, 0.92], [0.48, -0.05, 0.92]],
    selectionRadius: 1.7,
    targetRadius: 1.48,
    hudOffsetMultiplier: 1,
    wreck: STANDARD_WRECK,
  };
}

/**
 * Each hull has its own model identity even while they share today's procedural
 * geometry. Future model builders can replace one profile at a time without
 * changing combat, shield, HUD, or wreck code.
 */
export const SHIP_MODEL_PROFILES = {
  hammerhead: standardProfile("hammerhead", "Hammerhead siege frigate"),
  swiftfin: standardProfile("swiftfin", "Swiftfin pursuit cutter"),
  bastion: standardProfile("bastion", "Bastion breach ship"),
  "halcyon-frigate": standardProfile("halcyon-frigate", "Halcyon frigate"),
  "lancer-interceptor": standardProfile("lancer-interceptor", "Lancer interceptor"),
  "allied-escort": standardProfile("allied-escort", "Allied escort"),
  "corsair-frigate": standardProfile("corsair-frigate", "Corsair frigate"),
  "corsair-raider": standardProfile("corsair-raider", "Corsair raider"),
  "corsair-gunship": standardProfile("corsair-gunship", "Corsair gunship"),
} as const satisfies Record<string, ShipModelProfile>;

export type ShipModelId = keyof typeof SHIP_MODEL_PROFILES;

export function shipModelProfileFor(modelId: ShipModelId): ShipModelProfile {
  return SHIP_MODEL_PROFILES[modelId];
}
