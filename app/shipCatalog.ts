import type { Shields } from "./combatEngine.ts";
import {
  resolveSizedDurability,
  resolveSizedModelScale,
  type ShipSizeClass,
} from "./shipSize.ts";
import type { ShipModelId } from "./shipModels.ts";

export const BASIC_WEAPON_SYSTEMS = {
  cannon: {
    name: "Forward cannon",
    damageMultiplier: 1,
    rangeMultiplier: 1,
    halfArc: 28,
  },
  pulse: {
    name: "Pulse repeater",
    damageMultiplier: 0.72,
    rangeMultiplier: 0.85,
    halfArc: 48,
  },
  torpedo: {
    name: "Torpedo rack",
    damageMultiplier: 1.6,
    rangeMultiplier: 1.35,
    halfArc: 14,
  },
} as const;

export type BasicWeaponKind = keyof typeof BASIC_WEAPON_SYSTEMS;

export const ELITE_WEAPON_KINDS = ["railgun", "turret", "flak"] as const;
export type EliteWeaponKind = typeof ELITE_WEAPON_KINDS[number];
export type WeaponKind = BasicWeaponKind | EliteWeaponKind;

export function isEliteWeaponKind(weaponKind: WeaponKind): weaponKind is EliteWeaponKind {
  return (ELITE_WEAPON_KINDS as readonly string[]).includes(weaponKind);
}

export type WeaponMount = {
  id: string;
  weaponKind: WeaponKind;
  hardpointId: string;
};

const DEFAULT_HARDPOINTS: Record<WeaponKind, string> = {
  cannon: "primary",
  pulse: "primary",
  torpedo: "primary",
  railgun: "primary",
  turret: "dorsal",
  flak: "primary",
};

export function createWeaponMount(
  weaponKind: WeaponKind,
  existingMounts: readonly WeaponMount[] = [],
  hardpointId = DEFAULT_HARDPOINTS[weaponKind],
): WeaponMount {
  const sequence = existingMounts.filter((mount) => mount.weaponKind === weaponKind).length + 1;
  return {
    id: `${weaponKind}-${sequence}`,
    weaponKind,
    hardpointId,
  };
}

export function createPrimaryWeaponMount(weaponKind: BasicWeaponKind): WeaponMount {
  return { id: "primary-1", weaponKind, hardpointId: "primary" };
}

export type ShipArchetype = {
  id: string;
  name: string;
  callsign: string;
  className: string;
  color: string;
  modelId: ShipModelId;
  sizeClass: ShipSizeClass;
  durabilityMultiplier?: number;
  baseModelScale: number;
  baseShieldCapacity: Shields;
  baseHull: number;
  maxMove: number;
  maxTurn: number;
  maxPitch: number;
  maxRoll: number;
  weaponRange: number;
  weaponDamage: number;
  weaponMounts: WeaponMount[];
};

/**
 * Story hulls live in a catalog so future campaign starts, recruits, and unlocks
 * can swap a complete chassis without branching the battle systems. Only the
 * Hammerhead is active in the campaign today; the other entries validate the
 * supported variation points for later ship-selection work.
 */
export const STORY_SHIP_ARCHETYPES = {
  hammerhead: {
    id: "hammerhead",
    name: "The Hammerhead",
    callsign: "HM-01",
    className: "Commandeered Halcyon siege frigate",
    color: "#68d8ff",
    modelId: "hammerhead",
    sizeClass: "cruiser",
    baseModelScale: 1.12,
    baseShieldCapacity: { fore: 184, aft: 28, port: 78, starboard: 78, dorsal: 64, ventral: 58 },
    baseHull: 120,
    maxMove: 5,
    maxTurn: 55,
    maxPitch: 40,
    maxRoll: 90,
    weaponRange: 17,
    weaponDamage: 34,
    weaponMounts: [createPrimaryWeaponMount("cannon")],
  },
  swiftfin: {
    id: "swiftfin",
    name: "Swiftfin",
    callsign: "SF-03",
    className: "Light pursuit cutter",
    color: "#9af2ff",
    modelId: "swiftfin",
    sizeClass: "shuttle",
    baseModelScale: 1.08,
    baseShieldCapacity: { fore: 54, aft: 42, port: 40, starboard: 40, dorsal: 34, ventral: 32 },
    baseHull: 72,
    maxMove: 9,
    maxTurn: 100,
    maxPitch: 72,
    maxRoll: 180,
    weaponRange: 15,
    weaponDamage: 24,
    weaponMounts: [createPrimaryWeaponMount("pulse")],
  },
  bastion: {
    id: "bastion",
    name: "Bastion",
    callsign: "BS-08",
    className: "Heavy breach cruiser",
    color: "#86c9ff",
    modelId: "bastion",
    sizeClass: "large",
    baseModelScale: 0.95,
    baseShieldCapacity: { fore: 128, aft: 92, port: 112, starboard: 112, dorsal: 96, ventral: 88 },
    baseHull: 168,
    maxMove: 3.75,
    maxTurn: 38,
    maxPitch: 28,
    maxRoll: 60,
    weaponRange: 14,
    weaponDamage: 42,
    weaponMounts: [createPrimaryWeaponMount("torpedo")],
  },
} satisfies Record<string, ShipArchetype>;

export const PROTOTYPE_SHIP_ARCHETYPES = {
  "halcyon-frigate": {
    id: "halcyon-frigate",
    name: "Aegis",
    callsign: "AX-14",
    className: "Halcyon frigate",
    color: "#68d8ff",
    modelId: "halcyon-frigate",
    sizeClass: "cruiser",
    baseModelScale: 1,
    baseShieldCapacity: { fore: 92, aft: 56, port: 78, starboard: 78, dorsal: 64, ventral: 58 },
    baseHull: 120,
    maxMove: 5,
    maxTurn: 55,
    maxPitch: 40,
    maxRoll: 90,
    weaponRange: 17,
    weaponDamage: 34,
    weaponMounts: [createPrimaryWeaponMount("cannon")],
  },
  "lancer-interceptor": {
    id: "lancer-interceptor",
    name: "Rook",
    callsign: "RK-02",
    className: "Lancer interceptor",
    color: "#9af2ff",
    modelId: "lancer-interceptor",
    sizeClass: "shuttle",
    baseModelScale: 1,
    baseShieldCapacity: { fore: 58, aft: 36, port: 44, starboard: 44, dorsal: 40, ventral: 35 },
    baseHull: 82,
    maxMove: 8,
    maxTurn: 90,
    maxPitch: 65,
    maxRoll: 180,
    weaponRange: 14,
    weaponDamage: 24,
    weaponMounts: [createPrimaryWeaponMount("cannon")],
  },
  "allied-escort": {
    id: "allied-escort",
    name: "Sable-3",
    callsign: "NPC-A",
    className: "Allied escort",
    color: "#58f0c2",
    modelId: "allied-escort",
    sizeClass: "cruiser",
    baseModelScale: 1,
    baseShieldCapacity: { fore: 68, aft: 42, port: 55, starboard: 55, dorsal: 46, ventral: 42 },
    baseHull: 88,
    maxMove: 6,
    maxTurn: 70,
    maxPitch: 50,
    maxRoll: 135,
    weaponRange: 15,
    weaponDamage: 22,
    weaponMounts: [createPrimaryWeaponMount("cannon")],
  },
  "corsair-frigate": {
    id: "corsair-frigate",
    name: "Vandal-1",
    callsign: "CR-11",
    className: "Corsair frigate",
    color: "#ff6f70",
    modelId: "corsair-frigate",
    sizeClass: "cruiser",
    baseModelScale: 1,
    baseShieldCapacity: { fore: 84, aft: 48, port: 68, starboard: 52, dorsal: 58, ventral: 50 },
    baseHull: 108,
    maxMove: 5,
    maxTurn: 58,
    maxPitch: 42,
    maxRoll: 90,
    weaponRange: 16,
    weaponDamage: 30,
    weaponMounts: [createPrimaryWeaponMount("cannon")],
  },
  "corsair-raider": {
    id: "corsair-raider",
    name: "Shrike-6",
    callsign: "CR-06",
    className: "Corsair raider",
    color: "#ff9a73",
    modelId: "corsair-raider",
    sizeClass: "shuttle",
    baseModelScale: 1,
    baseShieldCapacity: { fore: 56, aft: 30, port: 42, starboard: 48, dorsal: 36, ventral: 32 },
    baseHull: 76,
    maxMove: 8,
    maxTurn: 90,
    maxPitch: 65,
    maxRoll: 180,
    weaponRange: 14,
    weaponDamage: 23,
    weaponMounts: [createPrimaryWeaponMount("cannon")],
  },
  "corsair-gunship": {
    id: "corsair-gunship",
    name: "Maraud-4",
    callsign: "CR-24",
    className: "Corsair gunship",
    color: "#ff5a88",
    modelId: "corsair-gunship",
    sizeClass: "cruiser",
    baseModelScale: 1,
    baseShieldCapacity: { fore: 72, aft: 38, port: 60, starboard: 60, dorsal: 52, ventral: 46 },
    baseHull: 96,
    maxMove: 6,
    maxTurn: 66,
    maxPitch: 48,
    maxRoll: 120,
    weaponRange: 16,
    weaponDamage: 27,
    weaponMounts: [createPrimaryWeaponMount("cannon")],
  },
} satisfies Record<string, ShipArchetype>;

export const ALL_SHIP_ARCHETYPES = {
  ...STORY_SHIP_ARCHETYPES,
  ...PROTOTYPE_SHIP_ARCHETYPES,
} satisfies Record<string, ShipArchetype>;

export const STORY_STARTER_ARCHETYPE = STORY_SHIP_ARCHETYPES.hammerhead;

export function durabilityForArchetype(archetype: ShipArchetype) {
  return resolveSizedDurability(
    archetype.baseHull,
    archetype.baseShieldCapacity,
    archetype.sizeClass,
    archetype.durabilityMultiplier,
  );
}

export function modelScaleForArchetype(archetype: ShipArchetype) {
  return resolveSizedModelScale(archetype.baseModelScale, archetype.sizeClass);
}
