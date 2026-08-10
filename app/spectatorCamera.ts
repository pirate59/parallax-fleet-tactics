import type { Vec3 } from "./combatEngine.ts";

type SpectatorShip = {
  position: Vec3;
  hull: number;
  modelScale: number;
};

export type SpectatorOverview = {
  position: Vec3;
  target: Vec3;
  fov: number;
  distance: number;
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

/** Frames the living fleets from an elevated, asymmetric cinematic angle. */
export function spectatorOverviewFor(
  ships: readonly SpectatorShip[],
  aspect: number,
  viewVariant = 0,
): SpectatorOverview {
  const visibleShips = ships.some((ship) => ship.hull > 0)
    ? ships.filter((ship) => ship.hull > 0)
    : ships;
  if (!visibleShips.length) {
    return { position: [29, 22, 34], target: [0, 0, 0], fov: 52, distance: 49.7 };
  }

  const bounds = visibleShips.reduce((current, ship) => {
    const padding = Math.max(1.4, ship.modelScale * 2.2);
    return {
      minX: Math.min(current.minX, ship.position[0] - padding),
      maxX: Math.max(current.maxX, ship.position[0] + padding),
      minY: Math.min(current.minY, ship.position[1] - padding),
      maxY: Math.max(current.maxY, ship.position[1] + padding),
      minZ: Math.min(current.minZ, ship.position[2] - padding),
      maxZ: Math.max(current.maxZ, ship.position[2] + padding),
    };
  }, {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
  });

  const target: Vec3 = [
    (bounds.minX + bounds.maxX) / 2,
    (bounds.minY + bounds.maxY) / 2,
    (bounds.minZ + bounds.maxZ) / 2,
  ];
  const halfX = (bounds.maxX - bounds.minX) / 2;
  const halfY = (bounds.maxY - bounds.minY) / 2;
  const halfZ = (bounds.maxZ - bounds.minZ) / 2;
  const radius = Math.hypot(halfX, halfY, halfZ);
  const fov = 52;
  const verticalHalfAngle = (fov * Math.PI) / 360;
  const horizontalHalfAngle = Math.atan(Math.tan(verticalHalfAngle) * Math.max(0.65, aspect));
  const limitingHalfAngle = Math.min(verticalHalfAngle, horizontalHalfAngle);
  const distance = clamp((radius / Math.sin(limitingHalfAngle)) * 1.12, 28, 150);

  const angle = 0.72 + (viewVariant % 4) * 0.16;
  const rawDirection = [Math.cos(angle), 0.58, Math.sin(angle)] as Vec3;
  const directionLength = Math.hypot(...rawDirection);
  const direction = rawDirection.map((value) => value / directionLength) as Vec3;
  const position = target.map((value, index) => value + direction[index] * distance) as Vec3;

  return { position, target, fov, distance };
}
