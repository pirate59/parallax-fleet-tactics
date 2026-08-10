import type { Team } from "./combatEngine.ts";

export const FLEET_COLOR_PALETTES = {
  friendly: ["#52d8d0", "#67cfee", "#58e0b8", "#78d9ff", "#45c9a9", "#75bfe8"],
  enemy: ["#ff654f", "#ff8548", "#ef4f43", "#ff9b52", "#e95f35", "#ff7358"],
} as const;

function stablePaletteIndex(identity: string, paletteLength: number) {
  let hash = 0;
  for (let index = 0; index < identity.length; index += 1) {
    hash = (hash * 31 + identity.charCodeAt(index)) >>> 0;
  }
  return hash % paletteLength;
}

export function fleetColorFor(team: Team, identity: string) {
  const palette = team === "enemy" ? FLEET_COLOR_PALETTES.enemy : FLEET_COLOR_PALETTES.friendly;
  return palette[stablePaletteIndex(identity, palette.length)];
}
