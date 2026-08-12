import type { Shields, Vec3 } from "./combatEngine.ts";
import {
  resolveSizedDurability,
  resolveSizedModelScale,
  type ShipSizeClass,
} from "./shipSize.ts";
import { SHIP_MODEL_VARIANTS, type ShipModelId, type ShipModelVariant } from "./shipModels.ts";
import type { AiTacticalProfile } from "./aiTactics.ts";

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

export type AutonomousTurretTrait = {
  kind: "autonomous-turret";
  name: "Turrets";
  weaponKind: "cannon";
  hardpointId: string;
  rangeMultiplier: number;
  damageMultiplier: number;
  targetPriority: "weakest";
};

export type EvasiveManeuverTrait = {
  kind: "evasive-maneuver";
  name: "Evasive manoeuvre";
  uses: 1;
  attackForfeit: true;
};

export type ShipPassiveTrait = AutonomousTurretTrait | EvasiveManeuverTrait;

export const CARRIER_FIGHTER_EVASIVE_TRAIT: EvasiveManeuverTrait = {
  kind: "evasive-maneuver",
  name: "Evasive manoeuvre",
  uses: 1,
  attackForfeit: true,
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

export type ShipTurnEndAbility = {
  kind: "launch-fighter";
  fighterArchetypeId: "fighter";
  maxActive: number;
  fighterReserve: number;
  fighterDamageMultiplier: number;
  fighterDurabilityMultiplier: number;
  launchOffsets: Vec3[];
};

export type ShipArchetype = {
  id: string;
  name: string;
  callsign: string;
  className: string;
  color: string;
  modelId: ShipModelId;
  modelVariants: readonly ShipModelVariant[];
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
  passiveTraits?: ShipPassiveTrait[];
  aiTactics: AiTacticalProfile;
  turnEndAbility?: ShipTurnEndAbility;
};

const behemothPortFlak = createWeaponMount("flak", [], "port-forward");
const behemothStarboardFlak = createWeaponMount("flak", [behemothPortFlak], "starboard-forward");

/** The canonical hull roster used by every game mode. */
export const SHIP_ARCHETYPES = {
  hammerhead: {
    id: "hammerhead",
    name: "The Hammerhead",
    callsign: "HM-01",
    className: "Halcyon siege cruiser",
    color: "#68d8ff",
    modelId: "hammerhead",
    modelVariants: SHIP_MODEL_VARIANTS,
    sizeClass: "cruiser",
    baseModelScale: 1.08,
    baseShieldCapacity: { fore: 184, aft: 28, port: 92, starboard: 92, dorsal: 76, ventral: 70 },
    baseHull: 120,
    maxMove: 5,
    maxTurn: 55,
    maxPitch: 40,
    maxRoll: 90,
    weaponRange: 17,
    weaponDamage: 34,
    weaponMounts: [createPrimaryWeaponMount("cannon")],
    aiTactics: { role: "bow-tank", defaultMission: "assault", preferredRangeRatio: 0.62, facingPriority: "expected-threat", survivalHullRatio: 0.5 },
  },
  archer: {
    id: "archer",
    name: "Archer",
    callsign: "AR-07",
    className: "Long-range strike cruiser",
    color: "#9be8ff",
    modelId: "archer",
    modelVariants: SHIP_MODEL_VARIANTS,
    sizeClass: "cruiser",
    baseModelScale: 1,
    baseShieldCapacity: { fore: 68, aft: 38, port: 48, starboard: 48, dorsal: 42, ventral: 38 },
    baseHull: 96,
    maxMove: 5.5,
    maxTurn: 58,
    maxPitch: 42,
    maxRoll: 95,
    weaponRange: 16,
    weaponDamage: 30,
    weaponMounts: [createWeaponMount("railgun")],
    aiTactics: { role: "standoff", defaultMission: "bombing", preferredRangeRatio: 0.82, facingPriority: "weapon-target", survivalHullRatio: 0.52 },
  },
  hulk: {
    id: "hulk",
    name: "Hulk",
    callsign: "HK-12",
    className: "Shielded brawler cruiser",
    color: "#75e0c2",
    modelId: "hulk",
    modelVariants: SHIP_MODEL_VARIANTS,
    sizeClass: "cruiser",
    baseModelScale: 1.08,
    baseShieldCapacity: { fore: 126, aft: 108, port: 118, starboard: 118, dorsal: 112, ventral: 104 },
    baseHull: 142,
    maxMove: 4,
    maxTurn: 46,
    maxPitch: 34,
    maxRoll: 72,
    weaponRange: 16,
    weaponDamage: 30,
    weaponMounts: [createWeaponMount("flak")],
    aiTactics: { role: "brawler", defaultMission: "defense", preferredRangeRatio: 0.68, facingPriority: "weapon-target", survivalHullRatio: 0.48 },
  },
  fighter: {
    id: "fighter",
    name: "Fighter",
    callsign: "FT-01",
    className: "Long-range interceptor shuttle",
    color: "#b4f4ff",
    modelId: "fighter",
    modelVariants: SHIP_MODEL_VARIANTS,
    sizeClass: "shuttle",
    baseModelScale: 1.08,
    baseShieldCapacity: { fore: 42, aft: 28, port: 32, starboard: 32, dorsal: 26, ventral: 24 },
    baseHull: 68,
    maxMove: 11,
    maxTurn: 115,
    maxPitch: 82,
    maxRoll: 210,
    weaponRange: 26,
    weaponDamage: 22,
    weaponMounts: [createPrimaryWeaponMount("pulse")],
    aiTactics: { role: "interceptor", defaultMission: "interception", preferredRangeRatio: 0.5, facingPriority: "weapon-target", survivalHullRatio: 0 },
  },
  behemoth: {
    id: "behemoth",
    name: "Behemoth",
    callsign: "BH-90",
    className: "Dreadnought weapons platform",
    color: "#88a9ff",
    modelId: "behemoth",
    modelVariants: SHIP_MODEL_VARIANTS,
    sizeClass: "large",
    durabilityMultiplier: 1.5,
    baseModelScale: 1.05,
    baseShieldCapacity: { fore: 142, aft: 118, port: 132, starboard: 132, dorsal: 124, ventral: 116 },
    baseHull: 190,
    maxMove: 2.75,
    maxTurn: 28,
    maxPitch: 20,
    maxRoll: 38,
    weaponRange: 16,
    weaponDamage: 38,
    weaponMounts: [behemothPortFlak, behemothStarboardFlak],
    passiveTraits: [{
      kind: "autonomous-turret",
      name: "Turrets",
      weaponKind: "cannon",
      hardpointId: "dorsal",
      rangeMultiplier: 0.5,
      damageMultiplier: 1,
      targetPriority: "weakest",
    }],
    aiTactics: { role: "heavy-platform", defaultMission: "assault", preferredRangeRatio: 0.72, facingPriority: "expected-threat", survivalHullRatio: 0.55 },
  },
  carrier: {
    id: "carrier",
    name: "Carrier",
    callsign: "CV-41",
    className: "Fleet carrier",
    color: "#77c9ff",
    modelId: "carrier",
    modelVariants: SHIP_MODEL_VARIANTS,
    sizeClass: "large",
    durabilityMultiplier: 0.72,
    baseModelScale: 1,
    baseShieldCapacity: { fore: 118, aft: 110, port: 124, starboard: 124, dorsal: 116, ventral: 108 },
    baseHull: 156,
    maxMove: 5,
    maxTurn: 36,
    maxPitch: 28,
    maxRoll: 52,
    weaponRange: 16,
    weaponDamage: 0,
    weaponMounts: [],
    aiTactics: { role: "carrier", defaultMission: "defense", preferredRangeRatio: 0.9, facingPriority: "expected-threat", survivalHullRatio: 0.62 },
    turnEndAbility: {
      kind: "launch-fighter",
      fighterArchetypeId: "fighter",
      maxActive: 3,
      fighterReserve: 9,
      fighterDamageMultiplier: 1.6,
      fighterDurabilityMultiplier: 0.55,
      launchOffsets: [[-1.15, -0.5, 0.25], [1.15, -0.5, 0.25], [0, -0.65, 1.15]],
    },
  },
} satisfies Record<string, ShipArchetype>;

export type ShipArchetypeId = keyof typeof SHIP_ARCHETYPES;

// Story starts and future unlocks use the same authoritative hull records.
export const STORY_SHIP_ARCHETYPES = SHIP_ARCHETYPES;
export const ALL_SHIP_ARCHETYPES = SHIP_ARCHETYPES;
export const STORY_STARTER_ARCHETYPE = SHIP_ARCHETYPES.hammerhead;

export function shipArchetypeFor(archetypeId: ShipArchetypeId): ShipArchetype {
  return SHIP_ARCHETYPES[archetypeId];
}

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
