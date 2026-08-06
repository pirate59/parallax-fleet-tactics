import type { Shields } from "./combatEngine.ts";

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

export type ShipArchetype = {
  id: string;
  name: string;
  callsign: string;
  className: string;
  color: string;
  modelScale: number;
  shieldCapacity: Shields;
  hull: number;
  maxMove: number;
  maxTurn: number;
  maxPitch: number;
  maxRoll: number;
  weaponRange: number;
  weaponDamage: number;
  basicWeapon: BasicWeaponKind;
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
    modelScale: 1.12,
    shieldCapacity: { fore: 184, aft: 28, port: 78, starboard: 78, dorsal: 64, ventral: 58 },
    hull: 120,
    maxMove: 5,
    maxTurn: 55,
    maxPitch: 40,
    maxRoll: 90,
    weaponRange: 17,
    weaponDamage: 34,
    basicWeapon: "cannon",
  },
  swiftfin: {
    id: "swiftfin",
    name: "Swiftfin",
    callsign: "SF-03",
    className: "Light pursuit cutter",
    color: "#9af2ff",
    modelScale: 0.78,
    shieldCapacity: { fore: 54, aft: 42, port: 40, starboard: 40, dorsal: 34, ventral: 32 },
    hull: 72,
    maxMove: 9,
    maxTurn: 100,
    maxPitch: 72,
    maxRoll: 180,
    weaponRange: 15,
    weaponDamage: 24,
    basicWeapon: "pulse",
  },
  bastion: {
    id: "bastion",
    name: "Bastion",
    callsign: "BS-08",
    className: "Heavy breach cruiser",
    color: "#86c9ff",
    modelScale: 1.38,
    shieldCapacity: { fore: 128, aft: 92, port: 112, starboard: 112, dorsal: 96, ventral: 88 },
    hull: 168,
    maxMove: 3.75,
    maxTurn: 38,
    maxPitch: 28,
    maxRoll: 60,
    weaponRange: 14,
    weaponDamage: 42,
    basicWeapon: "torpedo",
  },
} satisfies Record<string, ShipArchetype>;

export const STORY_STARTER_ARCHETYPE = STORY_SHIP_ARCHETYPES.hammerhead;
