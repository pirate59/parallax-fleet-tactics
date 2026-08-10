import type { ShieldFace, Vec3 } from "./combatEngine.ts";

export const SHIP_MODEL_VARIANTS = ["classic", "detailed"] as const;
export type ShipModelVariant = typeof SHIP_MODEL_VARIANTS[number];

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

function shieldAnchors(width: number, front: number, rear: number, top: number, bottom: number): Record<ShieldFace, ModelAnchor> {
  return {
    fore: { position: [0, 0.22, -front] },
    aft: { position: [0, 0.18, rear] },
    port: { position: [-width, 0.12, 0.12], rotation: [0, 90, 0] },
    starboard: { position: [width, 0.12, 0.12], rotation: [0, 90, 0] },
    dorsal: { position: [0, top, 0], rotation: [90, 0, 0] },
    ventral: { position: [0, -bottom, 0.08], rotation: [90, 0, 0] },
  };
}

function wreckProfile(width: number, length: number) {
  return {
    hullScale: [width / 1.4, length / 2.8, 1] as Vec3,
    fragments: [
      {
        position: [-width * 0.55, 0.08, length * 0.12] as Vec3,
        rotation: [0.08, -0.24, -0.16] as Vec3,
        size: [width * 0.72, 0.15, length * 0.3] as Vec3,
      },
      {
        position: [width * 0.58, -0.1, length * 0.03] as Vec3,
        rotation: [-0.06, 0.28, 0.18] as Vec3,
        size: [width * 0.68, 0.14, length * 0.27] as Vec3,
      },
    ],
  };
}

export const SHIP_MODEL_PROFILES = {
  hammerhead: {
    id: "hammerhead",
    label: "Hammerhead siege cruiser",
    weaponHardpoints: {
      primary: { position: [0, 0.02, -1.72] },
      dorsal: { position: [0, 0.62, -0.05] },
      "port-forward": { position: [-0.72, 0.12, -1.18] },
      "starboard-forward": { position: [0.72, 0.12, -1.18] },
    },
    shieldAnchors: shieldAnchors(1.32, 1.45, 1.12, 0.64, 0.44),
    engineAnchors: [[-0.48, -0.04, 1], [0.48, -0.04, 1]],
    selectionRadius: 1.82,
    targetRadius: 1.6,
    hudOffsetMultiplier: 1.04,
    wreck: wreckProfile(2.5, 2.9),
  },
  archer: {
    id: "archer",
    label: "Archer strike cruiser",
    weaponHardpoints: {
      primary: { position: [0, 0.02, -2.08] },
      dorsal: { position: [0, 0.48, -0.15] },
      "port-forward": { position: [-0.34, 0.05, -1.72] },
      "starboard-forward": { position: [0.34, 0.05, -1.72] },
    },
    shieldAnchors: shieldAnchors(0.88, 1.72, 1.2, 0.52, 0.38),
    engineAnchors: [[-0.34, -0.04, 1.18], [0.34, -0.04, 1.18]],
    selectionRadius: 1.62,
    targetRadius: 1.42,
    hudOffsetMultiplier: 1,
    wreck: wreckProfile(1.55, 3.4),
  },
  hulk: {
    id: "hulk",
    label: "Hulk brawler cruiser",
    weaponHardpoints: {
      primary: { position: [0, 0.12, -1.28] },
      dorsal: { position: [0, 0.78, -0.08] },
      "port-forward": { position: [-0.78, 0.18, -0.72] },
      "starboard-forward": { position: [0.78, 0.18, -0.72] },
    },
    shieldAnchors: shieldAnchors(1.12, 1.2, 1.02, 0.82, 0.62),
    engineAnchors: [[-0.56, -0.08, 0.98], [0.56, -0.08, 0.98]],
    selectionRadius: 1.72,
    targetRadius: 1.5,
    hudOffsetMultiplier: 1.06,
    wreck: wreckProfile(2.05, 2.45),
  },
  fighter: {
    id: "fighter",
    label: "Fighter interceptor",
    weaponHardpoints: {
      primary: { position: [0, -0.02, -1.62] },
      dorsal: { position: [0, 0.3, -0.12] },
      "port-forward": { position: [-0.42, -0.02, -1.02] },
      "starboard-forward": { position: [0.42, -0.02, -1.02] },
    },
    shieldAnchors: shieldAnchors(1.02, 1.34, 0.92, 0.38, 0.3),
    engineAnchors: [[0, -0.03, 1.02]],
    selectionRadius: 1.38,
    targetRadius: 1.2,
    hudOffsetMultiplier: 0.92,
    wreck: wreckProfile(1.7, 2.5),
  },
  behemoth: {
    id: "behemoth",
    label: "Behemoth dreadnought",
    weaponHardpoints: {
      primary: { position: [0, 0.02, -1.82] },
      dorsal: { position: [0, 0.86, -0.15] },
      "port-forward": { position: [-0.72, 0.2, -1.8] },
      "starboard-forward": { position: [0.78, 0.14, -1.42] },
    },
    shieldAnchors: shieldAnchors(1.38, 1.66, 1.42, 0.9, 0.68),
    engineAnchors: [[-0.76, -0.12, 1.34], [0, -0.12, 1.42], [0.76, -0.12, 1.34]],
    selectionRadius: 2.08,
    targetRadius: 1.84,
    hudOffsetMultiplier: 1.14,
    wreck: wreckProfile(2.6, 3.2),
  },
  carrier: {
    id: "carrier",
    label: "Fleet carrier",
    weaponHardpoints: {
      primary: { position: [0, 0.1, -1.45] },
      dorsal: { position: [0, 0.82, 0.2] },
      "port-forward": { position: [-0.94, 0.12, -1.2] },
      "starboard-forward": { position: [0.94, 0.12, -1.2] },
    },
    shieldAnchors: shieldAnchors(1.44, 1.48, 1.42, 0.82, 0.58),
    engineAnchors: [[-1, -0.1, 1.24], [-0.48, -0.1, 1.38], [0.48, -0.1, 1.38], [1, -0.1, 1.24]],
    selectionRadius: 2.18,
    targetRadius: 1.94,
    hudOffsetMultiplier: 1.14,
    wreck: wreckProfile(2.8, 3.15),
  },
} as const satisfies Record<string, ShipModelProfile>;

export type ShipModelId = keyof typeof SHIP_MODEL_PROFILES;

export function shipModelProfileFor(modelId: ShipModelId): ShipModelProfile {
  return SHIP_MODEL_PROFILES[modelId];
}
