import * as THREE from "three";
import {
  shieldFaceForOrigin,
  type CombatShip,
  type ShieldFace,
  type Vec3,
} from "./combatEngine.ts";
import { shipModelProfileFor } from "./shipModels.ts";
import type { ShipSizeClass } from "./shipSize.ts";

export type CollisionShip = CombatShip & {
  sizeClass: ShipSizeClass;
  archetypeId?: string;
};

export type MovementCollisionEvent = {
  id: string;
  shipAId: string;
  shipBId: string;
  kind: "ship" | "wreck";
  closestDistance: number;
  minimumDistance: number;
  damageToA: number;
  damageToB: number;
  shieldDamageToA: number;
  shieldDamageToB: number;
  hullDamageToA: number;
  hullDamageToB: number;
  faceA: ShieldFace | null;
  faceB: ShieldFace | null;
};

export type MovementCollisionResult<T extends CollisionShip> = {
  ships: T[];
  collisions: MovementCollisionEvent[];
  outcomes: string[];
  destroyedIds: string[];
  hitFaces: Partial<Record<string, ShieldFace[]>>;
};

const EPSILON = 1e-8;
const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const cloneShip = <T extends CollisionShip>(ship: T): T => ({
  ...ship,
  position: [...ship.position] as Vec3,
  rotation: [...ship.rotation] as Vec3,
  shields: { ...ship.shields },
  maxShields: { ...ship.maxShields },
  weaponMounts: ship.weaponMounts.map((mount) => ({ ...mount })),
  passiveTraits: ship.passiveTraits?.map((trait) => ({ ...trait })),
}) as T;

export function collisionRadiusFor(ship: Pick<CollisionShip, "modelId" | "modelScale">) {
  const profile = shipModelProfileFor(ship.modelId);
  return Math.max(0.52, profile.targetRadius * ship.modelScale * 0.72);
}

export function collisionMassFor(ship: Pick<CollisionShip, "archetypeId"> & { sizeClass?: ShipSizeClass }) {
  const sizeMass: Record<ShipSizeClass, number> = { shuttle: 1, cruiser: 3, large: 7.5 };
  return sizeMass[ship.sizeClass ?? "cruiser"] * (ship.archetypeId === "hammerhead" ? 1.25 : 1);
}

export function isPersistentWreck(ship: Pick<CollisionShip, "hull" | "spawnedByShipId">) {
  return ship.hull <= 0 && !ship.spawnedByShipId;
}

export function clampCollisionPosition(
  ship: Pick<CollisionShip, "modelId" | "modelScale">,
  position: THREE.Vector3 | Vec3,
  battlefieldLengthHalf: number,
  battlefieldVerticalHalf: number,
  battlefieldWidthHalf = battlefieldLengthHalf,
): Vec3 {
  const point = Array.isArray(position) ? new THREE.Vector3(...position) : position.clone();
  const radius = collisionRadiusFor(ship);
  const lengthLimit = Math.max(0, battlefieldLengthHalf - radius);
  const widthLimit = Math.max(0, battlefieldWidthHalf - radius);
  const verticalLimit = Math.max(0, battlefieldVerticalHalf - Math.min(radius, battlefieldVerticalHalf * 0.72));
  return [
    clamp(point.x, -lengthLimit, lengthLimit),
    clamp(point.y, -verticalLimit, verticalLimit),
    clamp(point.z, -widthLimit, widthLimit),
  ];
}

function closestApproach(
  startA: THREE.Vector3,
  endA: THREE.Vector3,
  startB: THREE.Vector3,
  endB: THREE.Vector3,
) {
  const relativeStart = startA.clone().sub(startB);
  const relativeVelocity = endA.clone().sub(startA).sub(endB.clone().sub(startB));
  const velocityLengthSquared = relativeVelocity.lengthSq();
  const time = velocityLengthSquared <= EPSILON
    ? 0
    : clamp(-relativeStart.dot(relativeVelocity) / velocityLengthSquared, 0, 1);
  const pointA = startA.clone().lerp(endA, time);
  const pointB = startB.clone().lerp(endB, time);
  return { time, pointA, pointB, distance: pointA.distanceTo(pointB) };
}

function fallbackNormal(shipAId: string, shipBId: string) {
  const seed = [...`${shipAId}:${shipBId}`].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const angle = (seed % 360) * Math.PI / 180;
  const lift = ((seed % 7) - 3) * 0.08;
  return new THREE.Vector3(Math.cos(angle), lift, Math.sin(angle)).normalize();
}

function impactNormal(
  closest: ReturnType<typeof closestApproach>,
  endA: THREE.Vector3,
  endB: THREE.Vector3,
  shipAId: string,
  shipBId: string,
) {
  const atImpact = closest.pointA.clone().sub(closest.pointB);
  if (atImpact.lengthSq() > EPSILON) return atImpact.normalize();
  const atEnd = endA.clone().sub(endB);
  return atEnd.lengthSq() > EPSILON ? atEnd.normalize() : fallbackNormal(shipAId, shipBId);
}

function applyImpactDamage<T extends CollisionShip>(
  ship: T,
  damage: number,
  origin: THREE.Vector3,
) {
  const face = shieldFaceForOrigin(ship, origin);
  const roundedDamage = Math.max(0, Math.round(damage));
  const shieldBefore = Math.max(0, ship.shields[face]);
  const absorbed = Math.min(shieldBefore, roundedDamage);
  ship.shields[face] = Math.max(0, shieldBefore - roundedDamage);
  ship.hull = Math.max(0, ship.hull - Math.max(0, roundedDamage - absorbed));
  return { face, damage: roundedDamage, shieldDamage: absorbed, hullDamage: Math.max(0, roundedDamage - absorbed) };
}

function collisionDamage(dealer: CollisionShip, receiver: CollisionShip, relativeSpeed: number) {
  const dealerMass = collisionMassFor(dealer);
  const receiverMass = collisionMassFor(receiver);
  const ramForce = dealer.archetypeId === "hammerhead" ? 1.42 : dealer.sizeClass === "large" ? 1.24 : 1;
  const energy = 5 + relativeSpeed * 1.45;
  return clamp(Math.round(energy * Math.pow(dealerMass / receiverMass, 0.72) * ramForce), 3, 64);
}

function setPosition<T extends CollisionShip>(
  ship: T,
  position: THREE.Vector3,
  battlefieldLengthHalf: number,
  battlefieldVerticalHalf: number,
  battlefieldWidthHalf: number,
) {
  ship.position = clampCollisionPosition(ship, position, battlefieldLengthHalf, battlefieldVerticalHalf, battlefieldWidthHalf);
}

/** Resolves continuous movement paths, impact damage, and final non-overlapping positions. */
export function resolveMovementCollisions<T extends CollisionShip>(
  sourceShips: T[],
  intendedShips: T[],
  battlefieldLengthHalf = 20,
  battlefieldVerticalHalf = 7,
  battlefieldWidthHalf = battlefieldLengthHalf,
): MovementCollisionResult<T> {
  const results = intendedShips.map(cloneShip);
  const startById = new Map(sourceShips.map((ship) => [ship.id, ship]));
  const resultById = new Map(results.map((ship) => [ship.id, ship]));
  const collisions: MovementCollisionEvent[] = [];
  const hitFaceSets = new Map<string, Set<ShieldFace>>();
  const destroyedIds = new Set<string>();

  for (let leftIndex = 0; leftIndex < results.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < results.length; rightIndex += 1) {
      const shipA = resultById.get(results[leftIndex].id)!;
      const shipB = resultById.get(results[rightIndex].id)!;
      const liveA = shipA.hull > 0;
      const liveB = shipB.hull > 0;
      const wreckA = isPersistentWreck(shipA);
      const wreckB = isPersistentWreck(shipB);
      if ((!liveA && !wreckA) || (!liveB && !wreckB) || (wreckA && wreckB)) continue;

      const startA = new THREE.Vector3(...(startById.get(shipA.id)?.position ?? shipA.position));
      const startB = new THREE.Vector3(...(startById.get(shipB.id)?.position ?? shipB.position));
      const endA = new THREE.Vector3(...shipA.position);
      const endB = new THREE.Vector3(...shipB.position);
      const closest = closestApproach(startA, endA, startB, endB);
      const minimumDistance = collisionRadiusFor(shipA) + collisionRadiusFor(shipB);
      if (closest.distance > minimumDistance + 0.001) continue;

      const normal = impactNormal(closest, endA, endB, shipA.id, shipB.id);
      const velocityA = endA.clone().sub(startA);
      const velocityB = endB.clone().sub(startB);
      const relativeSpeed = velocityA.clone().sub(velocityB).length();
      const endDistance = endA.distanceTo(endB);
      const overlap = Math.max(0, minimumDistance - endDistance);
      const deflection = overlap + Math.min(1.15, 0.24 + relativeSpeed * 0.075);
      let damageToA = 0;
      let damageToB = 0;
      let shieldDamageToA = 0;
      let shieldDamageToB = 0;
      let hullDamageToA = 0;
      let hullDamageToB = 0;
      let faceA: ShieldFace | null = null;
      let faceB: ShieldFace | null = null;

      if (liveA && liveB) {
        const massA = collisionMassFor(shipA);
        const massB = collisionMassFor(shipB);
        setPosition(shipA, endA.clone().addScaledVector(normal, deflection * (massB / (massA + massB))), battlefieldLengthHalf, battlefieldVerticalHalf, battlefieldWidthHalf);
        setPosition(shipB, endB.clone().addScaledVector(normal, -deflection * (massA / (massA + massB))), battlefieldLengthHalf, battlefieldVerticalHalf, battlefieldWidthHalf);
        const impactA = applyImpactDamage(shipA, collisionDamage(shipB, shipA, relativeSpeed), closest.pointB);
        const impactB = applyImpactDamage(shipB, collisionDamage(shipA, shipB, relativeSpeed), closest.pointA);
        damageToA = impactA.damage;
        damageToB = impactB.damage;
        shieldDamageToA = impactA.shieldDamage;
        shieldDamageToB = impactB.shieldDamage;
        hullDamageToA = impactA.hullDamage;
        hullDamageToB = impactB.hullDamage;
        faceA = impactA.face;
        faceB = impactB.face;
        (hitFaceSets.get(shipA.id) ?? hitFaceSets.set(shipA.id, new Set()).get(shipA.id)!).add(faceA);
        (hitFaceSets.get(shipB.id) ?? hitFaceSets.set(shipB.id, new Set()).get(shipB.id)!).add(faceB);
      } else {
        const liveShip = liveA ? shipA : shipB;
        const wreck = wreckA ? shipA : shipB;
        const liveIsA = liveA;
        const away = liveIsA ? normal : normal.clone().multiplyScalar(-1);
        const liveEnd = new THREE.Vector3(...liveShip.position);
        const wreckPosition = new THREE.Vector3(...wreck.position);
        const finalOverlap = Math.max(0, minimumDistance - liveEnd.distanceTo(wreckPosition));
        setPosition(liveShip, liveEnd.addScaledVector(away, finalOverlap + Math.min(0.8, 0.22 + relativeSpeed * 0.06)), battlefieldLengthHalf, battlefieldVerticalHalf, battlefieldWidthHalf);
        const impact = applyImpactDamage(liveShip, clamp(3 + relativeSpeed * 0.55, 3, 10), wreckPosition);
        if (liveIsA) {
          damageToA = impact.damage;
          shieldDamageToA = impact.shieldDamage;
          hullDamageToA = impact.hullDamage;
          faceA = impact.face;
        } else {
          damageToB = impact.damage;
          shieldDamageToB = impact.shieldDamage;
          hullDamageToB = impact.hullDamage;
          faceB = impact.face;
        }
        (hitFaceSets.get(liveShip.id) ?? hitFaceSets.set(liveShip.id, new Set()).get(liveShip.id)!).add(impact.face);
      }

      [shipA, shipB].forEach((ship) => {
        const startedAlive = (startById.get(ship.id)?.hull ?? 0) > 0;
        if (startedAlive && ship.hull <= 0) destroyedIds.add(ship.id);
      });
      collisions.push({
        id: `collision:${shipA.id}:${shipB.id}`,
        shipAId: shipA.id,
        shipBId: shipB.id,
        kind: wreckA || wreckB ? "wreck" : "ship",
        closestDistance: closest.distance,
        minimumDistance,
        damageToA,
        damageToB,
        shieldDamageToA,
        shieldDamageToB,
        hullDamageToA,
        hullDamageToB,
        faceA,
        faceB,
      });
    }
  }

  // A few deterministic relaxation passes guarantee that final living ships and
  // persistent wrecks cannot occupy the same volume after chained impacts.
  for (let pass = 0; pass < 6; pass += 1) {
    for (let leftIndex = 0; leftIndex < results.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < results.length; rightIndex += 1) {
        const shipA = results[leftIndex];
        const shipB = results[rightIndex];
        const liveA = shipA.hull > 0;
        const liveB = shipB.hull > 0;
        const solidA = liveA || isPersistentWreck(shipA);
        const solidB = liveB || isPersistentWreck(shipB);
        if (!solidA || !solidB || (!liveA && !liveB)) continue;
        const positionA = new THREE.Vector3(...shipA.position);
        const positionB = new THREE.Vector3(...shipB.position);
        const minimumDistance = collisionRadiusFor(shipA) + collisionRadiusFor(shipB) + 0.02;
        const distance = positionA.distanceTo(positionB);
        if (distance >= minimumDistance) continue;
        const normal = distance > EPSILON
          ? positionA.clone().sub(positionB).normalize()
          : fallbackNormal(shipA.id, shipB.id);
        const correction = minimumDistance - distance;
        if (liveA && liveB) {
          const massA = collisionMassFor(shipA);
          const massB = collisionMassFor(shipB);
          setPosition(shipA, positionA.addScaledVector(normal, correction * (massB / (massA + massB))), battlefieldLengthHalf, battlefieldVerticalHalf, battlefieldWidthHalf);
          setPosition(shipB, positionB.addScaledVector(normal, -correction * (massA / (massA + massB))), battlefieldLengthHalf, battlefieldVerticalHalf, battlefieldWidthHalf);
        } else if (liveA) {
          setPosition(shipA, positionA.addScaledVector(normal, correction), battlefieldLengthHalf, battlefieldVerticalHalf, battlefieldWidthHalf);
        } else if (liveB) {
          setPosition(shipB, positionB.addScaledVector(normal, -correction), battlefieldLengthHalf, battlefieldVerticalHalf, battlefieldWidthHalf);
        }
      }
    }
  }

  const outcomes = collisions.map((collision) => {
    const shipA = resultById.get(collision.shipAId)!;
    const shipB = resultById.get(collision.shipBId)!;
    if (collision.kind === "wreck") {
      const wreck = isPersistentWreck(shipA) ? shipA : shipB;
      const live = wreck.id === shipA.id ? shipB : shipA;
      const damage = wreck.id === shipA.id ? collision.damageToB : collision.damageToA;
      return `${live.name} clipped ${wreck.name}'s wreck — ${damage} impact damage and course deflection.`;
    }
    return `${shipA.name} collided with ${shipB.name} — ${collision.damageToA}/${collision.damageToB} impact damage; lighter hull displaced.`;
  });
  destroyedIds.forEach((id) => {
    const ship = resultById.get(id);
    if (ship) outcomes.unshift(`${ship.name} destroyed by collision.`);
  });

  return {
    ships: results,
    collisions,
    outcomes,
    destroyedIds: [...destroyedIds],
    hitFaces: Object.fromEntries([...hitFaceSets].map(([id, faces]) => [id, [...faces]])),
  };
}
