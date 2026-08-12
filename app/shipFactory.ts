import * as THREE from "three";
import type { AiDoctrine } from "./aiCommandEngine.ts";
import type { BattlefieldBounds } from "./battlefieldConfig.ts";
import { FLEET_BATTLEFIELD } from "./battlefieldConfig.ts";
import { applyCarrierFighterCombatProfile } from "./carrierEngine.ts";
import type { Team, Vec3 } from "./combatEngine.ts";
import type { ShipController } from "./fleetControl.ts";
import { fleetColorFor } from "./fleetPresentation.ts";
import type { GameShip } from "./gameTypes.ts";
import { shipQuaternionForRotation } from "./maneuverEngine.ts";
import { collisionSafeLaunchPosition } from "./movementAvoidanceEngine.ts";
import {
  CARRIER_FIGHTER_EVASIVE_TRAIT,
  SHIP_ARCHETYPES,
  type ShipArchetype,
  type ShipTurnEndAbility,
} from "./shipCatalog.ts";
import { resolveSizedDurability, resolveSizedModelScale } from "./shipSize.ts";

export type ShipDeployment = {
  id?: string;
  name?: string;
  callsign?: string;
  className?: string;
  color?: string;
  team: Team;
  controller: ShipController;
  aiDoctrine?: AiDoctrine;
  position: Vec3;
  rotation: Vec3;
};

/** Builds a mutable deployed ship from the immutable catalogue record. */
export function createShipFromArchetype(archetype: ShipArchetype, deployment: ShipDeployment): GameShip {
  const durabilityMultiplier = archetype.durabilityMultiplier ?? 1;
  const durability = resolveSizedDurability(
    archetype.baseHull,
    archetype.baseShieldCapacity,
    archetype.sizeClass,
    durabilityMultiplier,
  );
  return {
    id: deployment.id ?? archetype.id,
    name: deployment.name ?? archetype.name,
    callsign: deployment.callsign ?? archetype.callsign,
    className: deployment.className ?? archetype.className,
    color: deployment.color ?? fleetColorFor(deployment.team, archetype.id),
    team: deployment.team,
    controller: deployment.controller,
    ...(deployment.aiDoctrine !== undefined ? { aiDoctrine: deployment.aiDoctrine } : {}),
    position: [...deployment.position] as Vec3,
    rotation: [...deployment.rotation] as Vec3,
    maxMove: archetype.maxMove,
    maxTurn: archetype.maxTurn,
    maxPitch: archetype.maxPitch,
    maxRoll: archetype.maxRoll,
    weaponRange: archetype.weaponRange,
    weaponDamage: archetype.weaponDamage,
    archetypeId: archetype.id,
    modelId: archetype.modelId,
    modelVariants: [...archetype.modelVariants],
    sizeClass: archetype.sizeClass,
    durabilityMultiplier,
    shields: { ...durability.shields },
    maxShields: { ...durability.shields },
    hull: durability.hull,
    maxHull: durability.hull,
    modelScale: resolveSizedModelScale(archetype.baseModelScale, archetype.sizeClass),
    weaponMounts: archetype.weaponMounts.map((mount) => ({ ...mount })),
    aiTactics: { ...archetype.aiTactics },
    ...(archetype.passiveTraits !== undefined
      ? { passiveTraits: archetype.passiveTraits.map((trait) => ({ ...trait })) }
      : {}),
    ...(archetype.turnEndAbility !== undefined
      ? {
          turnEndAbility: {
            ...archetype.turnEndAbility,
            launchOffsets: archetype.turnEndAbility.launchOffsets.map((offset) => [...offset] as Vec3),
          },
          fighterReserveRemaining: archetype.turnEndAbility.fighterReserve,
        }
      : {}),
  };
}

/** Pure carrier launch factory used by local and future server turn advancement. */
export function createLaunchedFighter(
  carrier: GameShip,
  sequence: number,
  ability: ShipTurnEndAbility,
  bounds: BattlefieldBounds = FLEET_BATTLEFIELD,
): GameShip {
  const archetype = SHIP_ARCHETYPES[ability.fighterArchetypeId];
  const localOffset = ability.launchOffsets[(sequence - 1) % ability.launchOffsets.length] ?? [0, -0.5, 1];
  const worldOffset = new THREE.Vector3(...localOffset)
    .multiplyScalar(carrier.modelScale)
    .applyQuaternion(shipQuaternionForRotation(carrier.rotation));
  const launchPosition = new THREE.Vector3(...carrier.position).add(worldOffset);
  const fighter = createShipFromArchetype(archetype, {
    id: `${carrier.id}-fighter-${sequence}`,
    name: `${carrier.name} Wing-${sequence}`,
    callsign: `${carrier.callsign}-F${sequence}`,
    className: `Carrier-launched ${archetype.className.toLowerCase()}`,
    color: carrier.color,
    team: carrier.team,
    controller: "ai",
    aiDoctrine: "aggressive",
    position: [launchPosition.x, launchPosition.y, launchPosition.z],
    rotation: [...carrier.rotation] as Vec3,
  });
  const safeLaunchPosition = collisionSafeLaunchPosition(
    carrier,
    fighter,
    [launchPosition.x, launchPosition.y, launchPosition.z],
    bounds,
  );
  const profiledFighter = applyCarrierFighterCombatProfile(fighter, ability);
  return {
    ...profiledFighter,
    position: safeLaunchPosition,
    spawnedByShipId: carrier.id,
    passiveTraits: [
      ...(fighter.passiveTraits ?? []),
      { ...CARRIER_FIGHTER_EVASIVE_TRAIT },
    ],
    evasiveManeuverAvailable: true,
  };
}
