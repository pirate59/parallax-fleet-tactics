import * as THREE from "three";

export type ManeuverVec3 = [number, number, number];

export type ShipRelativeMovement = {
  forward: number;
  right: number;
  up: number;
};

const degrees = (value: number) => THREE.MathUtils.degToRad(value);
const cleanComponent = (value: number) => Math.abs(value) < 1e-9 ? 0 : value;

export const shipQuaternionForRotation = (rotation: ManeuverVec3) =>
  new THREE.Quaternion().setFromEuler(
    // Ship meshes face local -Z. Positive turn rotates the cone nose starboard.
    new THREE.Euler(degrees(rotation[0]), degrees(-rotation[1]), degrees(rotation[2]), "YXZ"),
  );

export function destinationFromShipMovement(
  position: ManeuverVec3,
  rotation: ManeuverVec3,
  movement: ShipRelativeMovement,
): ManeuverVec3 {
  const destination = new THREE.Vector3(movement.right, movement.up, -movement.forward)
    .applyQuaternion(shipQuaternionForRotation(rotation))
    .add(new THREE.Vector3(...position));

  return [
    cleanComponent(destination.x),
    cleanComponent(destination.y),
    cleanComponent(destination.z),
  ];
}

export function shipMovementFromDestination(
  position: ManeuverVec3,
  rotation: ManeuverVec3,
  destination: ManeuverVec3,
): ShipRelativeMovement {
  const local = new THREE.Vector3(...destination)
    .sub(new THREE.Vector3(...position))
    .applyQuaternion(shipQuaternionForRotation(rotation).invert());

  return {
    forward: cleanComponent(-local.z),
    right: cleanComponent(local.x),
    up: cleanComponent(local.y),
  };
}
