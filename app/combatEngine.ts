import * as THREE from "three";
import { shipQuaternionForRotation } from "./maneuverEngine.ts";
import { salvosForOrder, type FlightMode } from "./orderRules.ts";
import { BASIC_WEAPON_SYSTEMS, type BasicWeaponKind } from "./shipCatalog.ts";

export type Vec3 = [number, number, number];
export type Team = "player" | "ally" | "enemy";
export type ShieldFace = "fore" | "aft" | "port" | "starboard" | "dorsal" | "ventral";
export type Shields = Record<ShieldFace, number>;
export type EliteWeaponKind = "railgun" | "turret" | "flak";

export type CombatShip = {
  id: string;
  name: string;
  team: Team;
  position: Vec3;
  rotation: Vec3;
  shields: Shields;
  maxShields: Shields;
  hull: number;
  maxHull: number;
  weaponRange: number;
  weaponDamage: number;
  basicWeapon: BasicWeaponKind;
  modelScale: number;
  eliteWeapons: EliteWeaponKind[];
};

export type CombatOrder = {
  targetId: string;
  fire: boolean;
  mode: FlightMode;
};

export type WeaponProfile = {
  kind: "main" | EliteWeaponKind;
  name: string;
  damage: number;
  range: number;
  halfArc: number;
  color: string;
};

export type ShotSolution = {
  distance: number;
  inRange: boolean;
  inArc: boolean;
  valid: boolean;
};

export type CombatShotEvent = {
  id: string;
  sequence: number;
  salvoIndex: number;
  mountIndex: number;
  shooterId: string;
  targetId: string;
  weapon: WeaponProfile;
  origin: Vec3;
  distance: number;
  valid: boolean;
  missReason: "range" | "arc" | null;
  face: ShieldFace | null;
  shieldBefore: number;
  shieldAfter: number;
  hullBefore: number;
  hullAfter: number;
  destroyed: boolean;
};

export type CombatTurnResult<T extends CombatShip> = {
  ships: T[];
  shots: CombatShotEvent[];
  outcomes: string[];
  destroyedIds: string[];
};

export const SHIELD_FACES: ShieldFace[] = ["fore", "aft", "port", "starboard", "dorsal", "ventral"];
export const BASE_WEAPON_HALF_ARC = BASIC_WEAPON_SYSTEMS.cannon.halfArc;
export const SHIELD_REGEN_HIT = 5;
export const SHIELD_REGEN_CLEAR = 10;

const ZERO_DISTANCE_EPSILON = 1e-9;
const degrees = (value: number) => THREE.MathUtils.degToRad(value);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const cloneShip = <T extends CombatShip>(ship: T): T => ({
  ...ship,
  position: [...ship.position] as Vec3,
  rotation: [...ship.rotation] as Vec3,
  shields: { ...ship.shields },
  maxShields: { ...ship.maxShields },
  eliteWeapons: [...ship.eliteWeapons],
}) as T;

export function weaponProfilesFor(ship: CombatShip): WeaponProfile[] {
  const basicWeapon = BASIC_WEAPON_SYSTEMS[ship.basicWeapon];
  const profiles: WeaponProfile[] = [{
    kind: "main",
    name: basicWeapon.name,
    damage: Math.round(ship.weaponDamage * basicWeapon.damageMultiplier),
    range: ship.weaponRange * basicWeapon.rangeMultiplier,
    halfArc: basicWeapon.halfArc,
    color: ship.team === "enemy" ? "#ff5f7b" : "#71ebff",
  }];

  [...new Set(ship.eliteWeapons)].forEach((kind) => {
    if (kind === "railgun") {
      profiles.push({
        kind,
        name: "Rail gun",
        damage: ship.weaponDamage,
        range: ship.weaponRange * 3,
        halfArc: BASE_WEAPON_HALF_ARC * 0.3,
        color: "#d9fbff",
      });
    }
    if (kind === "turret") {
      profiles.push({
        kind,
        name: "Omni turret",
        damage: ship.weaponDamage,
        range: ship.weaponRange * 0.75,
        halfArc: 180,
        color: "#cf9cff",
      });
    }
    if (kind === "flak") {
      profiles.push({
        kind,
        name: "Flak cannon",
        damage: ship.weaponDamage * 5,
        range: ship.weaponRange * 0.3,
        halfArc: BASE_WEAPON_HALF_ARC,
        color: "#ffb36c",
      });
    }
  });

  return profiles;
}

export function weaponLocalOriginFor(ship: CombatShip, weapon: WeaponProfile) {
  return (weapon.kind === "turret"
    ? new THREE.Vector3(0, 0.62, 0)
    : new THREE.Vector3(0, 0, -1.48))
    .multiplyScalar(ship.modelScale);
}

export function weaponOriginFor(ship: CombatShip, weapon: WeaponProfile) {
  return weaponLocalOriginFor(ship, weapon)
    .applyQuaternion(shipQuaternionForRotation(ship.rotation))
    .add(new THREE.Vector3(...ship.position));
}

export function shotSolutionForWeapon(shooter: CombatShip, target: CombatShip, weapon: WeaponProfile): ShotSolution {
  const toTarget = new THREE.Vector3(...target.position).sub(weaponOriginFor(shooter, weapon));
  const distance = toTarget.length();
  const forward = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(shipQuaternionForRotation(shooter.rotation))
    .normalize();
  // A coincident target has no meaningful bearing. Treat it as inside the arc
  // rather than normalising the zero vector and producing a false arc miss.
  const inArc = distance <= ZERO_DISTANCE_EPSILON
    || weapon.halfArc >= 180
    || forward.dot(toTarget.clone().normalize()) >= Math.cos(degrees(weapon.halfArc));
  const inRange = distance <= weapon.range;
  return { distance, inRange, inArc, valid: inRange && inArc };
}

export function shieldFaceForOrigin(target: CombatShip, origin: THREE.Vector3 | Vec3): ShieldFace {
  const worldOrigin = Array.isArray(origin) ? new THREE.Vector3(...origin) : origin.clone();
  const incoming = worldOrigin.sub(new THREE.Vector3(...target.position));
  if (incoming.lengthSq() <= ZERO_DISTANCE_EPSILON * ZERO_DISTANCE_EPSILON) return "fore";

  incoming
    .normalize()
    .applyQuaternion(shipQuaternionForRotation(target.rotation).invert());
  const x = Math.abs(incoming.x);
  const y = Math.abs(incoming.y);
  const z = Math.abs(incoming.z);
  if (y >= x && y >= z) return incoming.y > 0 ? "dorsal" : "ventral";
  if (x >= z) return incoming.x > 0 ? "starboard" : "port";
  return incoming.z < 0 ? "fore" : "aft";
}

export function shieldFaceForHit(
  target: CombatShip,
  attacker: CombatShip,
  weapon: WeaponProfile = weaponProfilesFor(attacker)[0],
): ShieldFace {
  return shieldFaceForOrigin(target, weaponOriginFor(attacker, weapon));
}

export function resolveCombatTurn<T extends CombatShip>(sourceShips: T[], orders: Record<string, CombatOrder>): CombatTurnResult<T> {
  const startingShips = sourceShips.map(cloneShip);
  const results = sourceShips.map(cloneShip);
  const shots: CombatShotEvent[] = [];
  const hitFaces = new Map<string, Set<ShieldFace>>();
  const destroyedByShot = new Set<string>();
  const teamPriority: Record<Team, number> = { player: 0, ally: 1, enemy: 2 };
  const startingById = new Map(startingShips.map((ship) => [ship.id, ship]));
  const resultById = new Map(results.map((ship) => [ship.id, ship]));
  const sourceIndex = new Map(startingShips.map((ship, index) => [ship.id, index]));

  type PendingShot = {
    shooter: T;
    target: T;
    weapon: WeaponProfile;
    salvoIndex: number;
    mountIndex: number;
    origin: THREE.Vector3;
    solution: ShotSolution;
    face: ShieldFace | null;
  };

  type WeaponActivation = {
    shooter: T;
    target: T;
    shots: PendingShot[];
  };

  // Movement has already resolved simultaneously before this function runs.
  // Weapon geometry is therefore frozen at those final positions, while each
  // ship's survival is checked when its ordered activation begins.
  const activations: WeaponActivation[] = startingShips
    .filter((shooter) => shooter.hull > 0 && salvosForOrder(orders[shooter.id]) > 0 && orders[shooter.id]?.targetId)
    .sort((left, right) => {
      const teamDifference = teamPriority[left.team] - teamPriority[right.team];
      if (teamDifference !== 0) return teamDifference;
      const indexDifference = (sourceIndex.get(left.id) ?? 0) - (sourceIndex.get(right.id) ?? 0);
      return indexDifference !== 0 ? indexDifference : left.id.localeCompare(right.id);
    })
    .flatMap((shooter) => {
      const target = startingById.get(orders[shooter.id].targetId);
      if (!target || target.hull <= 0) return [];

      const weapons = weaponProfilesFor(shooter);
      const salvoCount = salvosForOrder(orders[shooter.id]);
      const pendingShots: PendingShot[] = [];
      for (let salvoIndex = 0; salvoIndex < salvoCount; salvoIndex += 1) {
        weapons.forEach((weapon, mountIndex) => {
          const origin = weaponOriginFor(shooter, weapon);
          const solution = shotSolutionForWeapon(shooter, target, weapon);
          pendingShots.push({
            shooter,
            target,
            weapon,
            salvoIndex,
            mountIndex,
            origin,
            solution,
            face: solution.valid ? shieldFaceForOrigin(target, origin) : null,
          });
        });
      }
      return [{ shooter, target, shots: pendingShots }];
    });

  const suppressedActivations: string[] = [];
  activations.forEach((activation) => {
    const liveShooter = resultById.get(activation.shooter.id);
    if (!liveShooter || liveShooter.hull <= 0) {
      suppressedActivations.push(`${activation.shooter.name} destroyed before weapon activation — ordered fire cancelled.`);
      return;
    }
    const liveTarget = resultById.get(activation.target.id);
    if (!liveTarget || liveTarget.hull <= 0) {
      suppressedActivations.push(`${activation.shooter.name} held fire — assigned target already destroyed.`);
      return;
    }

    // Once an activation begins, every installed mount and Focus Fire salvo is
    // committed even if an earlier shot in that same activation destroys the target.
    activation.shots.forEach((pending) => {
      const { shooter, target: targetAtFire, weapon, salvoIndex, mountIndex, origin, solution, face } = pending;
      const target = resultById.get(targetAtFire.id);
      if (!target) return;
      const sequence = shots.length;

      const eventBase = {
        id: `${shooter.id}:${salvoIndex}:${mountIndex}:${weapon.kind}:${target.id}`,
        sequence,
        salvoIndex,
        mountIndex,
        shooterId: shooter.id,
        targetId: target.id,
        weapon,
        origin: [origin.x, origin.y, origin.z] as Vec3,
        distance: solution.distance,
      };
      if (!solution.valid || !face) {
        shots.push({
          ...eventBase,
          valid: false,
          missReason: solution.inRange ? "arc" : "range",
          face: null,
          shieldBefore: 0,
          shieldAfter: 0,
          hullBefore: target.hull,
          hullAfter: target.hull,
          destroyed: false,
        });
        return;
      }

      const shieldBefore = Math.max(0, target.shields[face]);
      const hullBefore = Math.max(0, target.hull);
      const damage = Math.max(0, weapon.damage);
      const absorbed = Math.min(shieldBefore, damage);
      const overflow = damage - absorbed;
      target.shields[face] = Math.max(0, shieldBefore - damage);
      target.hull = Math.max(0, hullBefore - overflow);
      const faces = hitFaces.get(target.id) ?? new Set<ShieldFace>();
      faces.add(face);
      hitFaces.set(target.id, faces);

      const destroyed = !destroyedByShot.has(target.id) && hullBefore > 0 && target.hull <= 0;
      if (destroyed) destroyedByShot.add(target.id);
      shots.push({
        ...eventBase,
        valid: true,
        missReason: null,
        face,
        shieldBefore,
        shieldAfter: target.shields[face],
        hullBefore,
        hullAfter: target.hull,
        destroyed,
      });
    });
  });

  results.forEach((ship) => {
    if (ship.hull <= 0) return;
    const struck = hitFaces.get(ship.id) ?? new Set<ShieldFace>();
    SHIELD_FACES.forEach((face) => {
      const regeneration = struck.has(face) ? SHIELD_REGEN_HIT : SHIELD_REGEN_CLEAR;
      const maximum = Math.max(0, ship.maxShields[face]);
      ship.shields[face] = clamp(ship.shields[face] + regeneration, 0, maximum);
    });
  });

  const destroyedIds = results
    .filter((ship) => ship.hull <= 0 && (startingById.get(ship.id)?.hull ?? 0) > 0)
    .map((ship) => ship.id);
  const outcomes = shots.map((shot) => {
    const shooter = startingShips.find((ship) => ship.id === shot.shooterId);
    const target = startingShips.find((ship) => ship.id === shot.targetId);
    if (!shooter || !target) return "Unknown firing event.";
    const salvoLabel = orders[shot.shooterId]?.mode === "focus-fire" ? ` salvo ${shot.salvoIndex + 1}` : "";
    if (!shot.valid) return `${shooter.name}: ${shot.weapon.name}${salvoLabel} lost — target escaped ${shot.missReason === "range" ? "range" : "firing arc"}.`;
    const hullDamage = shot.hullBefore - shot.hullAfter;
    return `${shooter.name}'s ${shot.weapon.name}${salvoLabel} hit ${target.name} ${shot.face} shield for ${Math.round(shot.weapon.damage)}${hullDamage > 0 ? ` (${Math.round(hullDamage)} hull)` : ""}.`;
  });
  destroyedIds.forEach((id) => {
    const ship = startingShips.find((candidate) => candidate.id === id);
    if (ship) outcomes.unshift(`${ship.name} destroyed — wreck on tactical grid.`);
  });
  outcomes.push(...suppressedActivations);
  outcomes.push(`Shield cycle complete: +${SHIELD_REGEN_HIT} struck facings, +${SHIELD_REGEN_CLEAR} clear facings.`);

  return { ships: results, shots, outcomes, destroyedIds };
}
