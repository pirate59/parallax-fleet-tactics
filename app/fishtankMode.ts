import type { AiDoctrine } from "./aiCommandEngine.ts";
import type { Team, Vec3 } from "./combatEngine.ts";
import type { ShipPassiveTrait, WeaponMount } from "./shipCatalog.ts";
import { fleetColorFor } from "./fleetPresentation.ts";
import { FLEET_TEAM_START_X } from "./battlefieldConfig.ts";

export const FISHTANK_FLEET_SIZE = 5;
export const FISHTANK_PLANNING_DELAY_MS = 1800;
export const FISHTANK_RESTART_DELAY_MS = 5200;
export const FISHTANK_CINEMATIC_TIMINGS = {
  movement: 2600,
  cameraApproach: 720,
  beam: 360,
  impactHold: 880,
  destroyedHold: 1450,
  betweenShots: 210,
  cameraReturn: 820,
  quietTurnHold: 760,
} as const;

type FishtankTemplate = {
  id: string;
  name: string;
  callsign: string;
  className: string;
  team: Team;
  controller: "player" | "ai";
  aiDoctrine?: AiDoctrine;
  color: string;
  position: Vec3;
  rotation: Vec3;
  shields: Record<string, number>;
  maxShields: Record<string, number>;
  hull: number;
  maxHull: number;
  weaponMounts: WeaponMount[];
  passiveTraits?: ShipPassiveTrait[];
};

export type FishtankShip<T extends FishtankTemplate> = Omit<
  T,
  "team" | "controller" | "aiDoctrine" | "position" | "rotation" | "shields" | "hull" | "weaponMounts"
> & {
  team: "ally" | "enemy";
  controller: "ai";
  aiDoctrine: AiDoctrine;
  position: Vec3;
  rotation: Vec3;
  shields: T["shields"];
  hull: number;
  weaponMounts: WeaponMount[];
};

const TEMPLATE_ORDER = [0, 1, 2, 3, 4, 5] as const;
const DOCTRINES: AiDoctrine[] = ["aggressive", "standard", "defensive", "standard", "aggressive"];

const LEFT_SLOTS: Vec3[] = [
  [-FLEET_TEAM_START_X, -5, -12],
  [-FLEET_TEAM_START_X, 2, -6],
  [-FLEET_TEAM_START_X, 6, 0],
  [-FLEET_TEAM_START_X, -3, 7],
  [-FLEET_TEAM_START_X, 4, 13],
];

const RIGHT_SLOTS: Vec3[] = LEFT_SLOTS.map(([x, y, z]) => [-x, -y, -z]);

const FLEET_NAMES = {
  ally: ["Halcyon", "Mistral", "Longbow", "Kite", "Resolute"],
  enemy: ["Vandal", "Shrike", "Maraud", "Razor", "Warden"],
} as const;

/**
 * Builds mirrored five-ship AI fleets from the six canonical hulls. Each match
 * rotates the omitted hull and doctrines so unattended simulations vary.
 */
export function createFishtankFleet<T extends FishtankTemplate>(templates: readonly T[], matchNumber: number): FishtankShip<T>[] {
  if (templates.length < 6) throw new Error("Fishtank mode requires six prototype ship templates.");

  const buildSide = (team: "ally" | "enemy", slots: Vec3[]) =>
    Array.from({ length: FISHTANK_FLEET_SIZE }, (_, index) => {
      const templateOffset = team === "ally" ? matchNumber - 1 : matchNumber + 1;
      const templateIndex = TEMPLATE_ORDER[(index + templateOffset) % TEMPLATE_ORDER.length];
      const template = templates[templateIndex];
      const doctrineOffset = team === "ally" ? matchNumber - 1 : matchNumber + 2;
      const doctrine = DOCTRINES[(index + doctrineOffset) % DOCTRINES.length];
      const sideCode = team === "ally" ? "AZ" : "CR";

      return {
        ...template,
        id: `fishtank-${matchNumber}-${team}-${index + 1}`,
        name: `${FLEET_NAMES[team][index]}-${String(matchNumber).padStart(2, "0")}`,
        callsign: `${sideCode}-${String(index + 1).padStart(2, "0")}`,
        className: `${team === "ally" ? "Azure" : "Crimson"} ${template.className.toLowerCase()}`,
        team,
        controller: "ai",
        aiDoctrine: doctrine,
        color: fleetColorFor(team, `${template.id}-${index}`),
        position: [...slots[index]] as Vec3,
        rotation: [index % 2 ? 4 : -3, team === "ally" ? 90 : -90, index % 2 ? -5 : 5] as Vec3,
        shields: { ...template.maxShields },
        maxShields: { ...template.maxShields },
        hull: template.maxHull,
        maxHull: template.maxHull,
        weaponMounts: template.weaponMounts.map((mount) => ({ ...mount })),
        passiveTraits: template.passiveTraits?.map((trait) => ({ ...trait })),
      } as FishtankShip<T>;
    });

  return [...buildSide("ally", LEFT_SLOTS), ...buildSide("enemy", RIGHT_SLOTS)];
}

export function fishtankActivationOrder(turn: number): Team[] {
  return turn % 2 === 1
    ? ["ally", "enemy", "player"]
    : ["enemy", "ally", "player"];
}

type FishtankStatusShip = {
  id: string;
  hull: number;
  maxHull: number;
  spawnedByShipId?: string;
};

const healthPercentageFor = (ship: FishtankStatusShip) =>
  Math.max(0, Math.min(100, (ship.hull / Math.max(1, ship.maxHull)) * 100));

/** Builds stable core-ship rows with only active carrier fighters attached. */
export function createFishtankStatusRows<T extends FishtankStatusShip>(ships: readonly T[]) {
  return ships
    .filter((ship) => !ship.spawnedByShipId)
    .map((ship) => ({
      ship,
      healthPercentage: healthPercentageFor(ship),
      fighters: ships
        .filter((fighter) => fighter.spawnedByShipId === ship.id && fighter.hull > 0)
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((fighter) => ({ fighter, healthPercentage: healthPercentageFor(fighter) })),
    }));
}
