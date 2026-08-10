import type { AiDoctrine } from "./aiCommandEngine.ts";
import type { Team, Vec3 } from "./combatEngine.ts";

export const FISHTANK_FLEET_SIZE = 5;
export const FISHTANK_PLANNING_DELAY_MS = 650;
export const FISHTANK_RESTART_DELAY_MS = 3200;

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
  eliteWeapons: string[];
};

const TEMPLATE_ORDER = [0, 1, 5, 4, 3] as const;
const DOCTRINES: AiDoctrine[] = ["aggressive", "standard", "defensive", "standard", "aggressive"];

const LEFT_SLOTS: Vec3[] = [
  [-13, -3, -8],
  [-12, 1, -4],
  [-13, 4, 0],
  [-12, -2, 5],
  [-13, 2, 9],
];

const RIGHT_SLOTS: Vec3[] = LEFT_SLOTS.map(([x, y, z]) => [-x, -y, -z]);

const FLEET_NAMES = {
  ally: ["Halcyon", "Mistral", "Longbow", "Kite", "Resolute"],
  enemy: ["Vandal", "Shrike", "Maraud", "Razor", "Warden"],
} as const;

const FLEET_COLORS = {
  ally: ["#68d8ff", "#9af2ff", "#58f0c2", "#86c9ff", "#6ea8ff"],
  enemy: ["#ff6f70", "#ff9a73", "#ff5a88", "#e767a6", "#ff785e"],
} as const;

/**
 * Builds mirrored five-ship AI fleets from the existing prototype hulls. The
 * match number rotates hulls and doctrines so unattended simulations do not
 * repeat the exact same opening on every restart.
 */
export function createFishtankFleet<T extends FishtankTemplate>(templates: readonly T[], matchNumber: number): T[] {
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
        color: FLEET_COLORS[team][index],
        position: [...slots[index]] as Vec3,
        rotation: [index % 2 ? 4 : -3, team === "ally" ? -90 : 90, index % 2 ? -5 : 5] as Vec3,
        shields: { ...template.maxShields },
        maxShields: { ...template.maxShields },
        hull: template.maxHull,
        maxHull: template.maxHull,
        eliteWeapons: [...template.eliteWeapons],
      } as T;
    });

  return [...buildSide("ally", LEFT_SLOTS), ...buildSide("enemy", RIGHT_SLOTS)];
}

export function fishtankActivationOrder(turn: number): Team[] {
  return turn % 2 === 1
    ? ["ally", "enemy", "player"]
    : ["enemy", "ally", "player"];
}
