export type BattlefieldBounds = {
  readonly length: number;
  readonly width: number;
  readonly height: number;
  readonly halfLength: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
};

export type MultiplayerMapSize = "close" | "standard" | "wide";

function battlefield(length: number, width: number, height: number): BattlefieldBounds {
  return Object.freeze({
    length,
    width,
    height,
    halfLength: length / 2,
    halfWidth: width / 2,
    halfHeight: height / 2,
  });
}

/** Story encounters retain the original compact tactical volume. */
export const STORY_BATTLEFIELD = battlefield(40, 40, 14);

/** Skirmish and Fishtank use a longer, wider fleet-engagement volume. */
export const FLEET_BATTLEFIELD = battlefield(120, 80, 28);

export const MULTIPLAYER_BATTLEFIELDS: Record<MultiplayerMapSize, BattlefieldBounds> = Object.freeze({
  close: battlefield(90, 60, 22),
  standard: FLEET_BATTLEFIELD,
  wide: battlefield(160, 110, 36),
});

export function multiplayerBattlefieldFor(size: MultiplayerMapSize): BattlefieldBounds {
  return MULTIPLAYER_BATTLEFIELDS[size] ?? FLEET_BATTLEFIELD;
}

/** Opposing deployment centres begin one third of the fleet map length apart. */
export const FLEET_START_SEPARATION = FLEET_BATTLEFIELD.length / 3;
export const FLEET_TEAM_START_X = FLEET_START_SEPARATION / 2;
export const FLEET_STATION_X = FLEET_BATTLEFIELD.halfLength - 9;
