"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type Vec3 = [number, number, number];
type ArmourFace = "fore" | "aft" | "port" | "starboard" | "dorsal" | "ventral";
type Team = "player" | "ally" | "enemy";
type Phase = "planning" | "executing" | "victory" | "defeat";

type Armour = Record<ArmourFace, number>;

type Ship = {
  id: string;
  name: string;
  callsign: string;
  className: string;
  team: Team;
  color: string;
  position: Vec3;
  rotation: Vec3;
  armour: Armour;
  hull: number;
  maxHull: number;
  maxMove: number;
  maxTurn: number;
  maxPitch: number;
  maxRoll: number;
  weaponRange: number;
  weaponDamage: number;
};

type Order = {
  destination: Vec3;
  turn: number;
  pitch: number;
  roll: number;
  targetId: string;
  fire: boolean;
};

type Resolution = {
  token: number;
  endShips: Ship[];
  orders: Record<string, Order>;
};

type CameraCommand = {
  kind: "focus" | "reset";
  nonce: number;
  shipId?: string;
};

type CombatFocus = {
  shooter: string;
  target: string;
  team: Team;
};

const WEAPON_HALF_ARC = 28;
const BATTLEFIELD_HALF = 20;
const BATTLEFIELD_VERTICAL_HALF = 7;

const ARMOUR_FACES: ArmourFace[] = [
  "fore",
  "aft",
  "port",
  "starboard",
  "dorsal",
  "ventral",
];

const TEAM_LABELS: Record<Team, string> = {
  player: "Your fleet",
  ally: "Allied NPC",
  enemy: "Corsair NPC",
};

const INITIAL_LOG = [
  "Corsair formation detected inside the Kestrel Reach.",
  "Plot a grid endpoint, set final orientation, then stage both command ships.",
];

const INITIAL_SHIPS: Ship[] = [
  {
    id: "aegis",
    name: "Aegis",
    callsign: "AX-14",
    className: "Halcyon frigate",
    team: "player",
    color: "#68d8ff",
    position: [-9, 0, 5],
    rotation: [0, 36, 0],
    armour: { fore: 92, aft: 56, port: 78, starboard: 78, dorsal: 64, ventral: 58 },
    hull: 120,
    maxHull: 120,
    maxMove: 5,
    maxTurn: 55,
    maxPitch: 40,
    maxRoll: 90,
    weaponRange: 17,
    weaponDamage: 34,
  },
  {
    id: "rook",
    name: "Rook",
    callsign: "RK-02",
    className: "Lancer interceptor",
    team: "player",
    color: "#9af2ff",
    position: [-10, -3, -4],
    rotation: [8, 50, -8],
    armour: { fore: 58, aft: 36, port: 44, starboard: 44, dorsal: 40, ventral: 35 },
    hull: 82,
    maxHull: 82,
    maxMove: 8,
    maxTurn: 90,
    maxPitch: 65,
    maxRoll: 180,
    weaponRange: 14,
    weaponDamage: 24,
  },
  {
    id: "sable",
    name: "Sable-3",
    callsign: "NPC-A",
    className: "Allied escort",
    team: "ally",
    color: "#58f0c2",
    position: [-6, 3, 0],
    rotation: [-5, 42, 6],
    armour: { fore: 68, aft: 42, port: 55, starboard: 55, dorsal: 46, ventral: 42 },
    hull: 88,
    maxHull: 88,
    maxMove: 6,
    maxTurn: 70,
    maxPitch: 50,
    maxRoll: 135,
    weaponRange: 15,
    weaponDamage: 22,
  },
  {
    id: "vandal",
    name: "Vandal-1",
    callsign: "CR-11",
    className: "Corsair frigate",
    team: "enemy",
    color: "#ff6f70",
    position: [8, 1, -7],
    rotation: [0, -118, 0],
    armour: { fore: 84, aft: 48, port: 68, starboard: 52, dorsal: 58, ventral: 50 },
    hull: 108,
    maxHull: 108,
    maxMove: 5,
    maxTurn: 58,
    maxPitch: 42,
    maxRoll: 90,
    weaponRange: 16,
    weaponDamage: 30,
  },
  {
    id: "shrike",
    name: "Shrike-6",
    callsign: "CR-06",
    className: "Corsair raider",
    team: "enemy",
    color: "#ff9a73",
    position: [10, -2, 3],
    rotation: [-4, -108, 7],
    armour: { fore: 56, aft: 30, port: 42, starboard: 48, dorsal: 36, ventral: 32 },
    hull: 76,
    maxHull: 76,
    maxMove: 8,
    maxTurn: 90,
    maxPitch: 65,
    maxRoll: 180,
    weaponRange: 14,
    weaponDamage: 23,
  },
  {
    id: "maraud",
    name: "Maraud-4",
    callsign: "CR-24",
    className: "Corsair gunship",
    team: "enemy",
    color: "#ff5a88",
    position: [7, 5, 8],
    rotation: [7, -138, -5],
    armour: { fore: 72, aft: 38, port: 60, starboard: 60, dorsal: 52, ventral: 46 },
    hull: 96,
    maxHull: 96,
    maxMove: 6,
    maxTurn: 66,
    maxPitch: 48,
    maxRoll: 120,
    weaponRange: 16,
    weaponDamage: 27,
  },
];

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const normalizeAngle = (angle: number) => {
  let next = angle % 360;
  if (next > 180) next -= 360;
  if (next < -180) next += 360;
  return next;
};

const degrees = (value: number) => THREE.MathUtils.degToRad(value);

const forwardVector = (rotation: Vec3) => {
  const pitch = degrees(rotation[0]);
  const turnAngle = degrees(rotation[1]);
  return new THREE.Vector3(
    Math.sin(turnAngle) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(turnAngle) * Math.cos(pitch),
  ).normalize();
};

const quaternionFor = (rotation: Vec3) =>
  new THREE.Quaternion().setFromEuler(
    // Ships face local -Z: positive turn rotates the cone nose toward local starboard.
    new THREE.Euler(degrees(rotation[0]), degrees(-rotation[1]), degrees(rotation[2]), "YXZ"),
  );

const distanceBetween = (a: Vec3, b: Vec3) =>
  new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b));

const clampDestination = (ship: Ship, destination: Vec3): Vec3 => {
  const origin = new THREE.Vector3(...ship.position);
  const target = new THREE.Vector3(
    clamp(destination[0], -BATTLEFIELD_HALF, BATTLEFIELD_HALF),
    clamp(destination[1], -BATTLEFIELD_VERTICAL_HALF, BATTLEFIELD_VERTICAL_HALF),
    clamp(destination[2], -BATTLEFIELD_HALF, BATTLEFIELD_HALF),
  );
  const offset = target.sub(origin);
  if (offset.length() > ship.maxMove) offset.setLength(ship.maxMove);
  const result = origin.add(offset);
  return [result.x, result.y, result.z];
};

const isDestinationValid = (ship: Ship, destination: Vec3) =>
  distanceBetween(ship.position, destination) <= ship.maxMove + 0.01 &&
  Math.abs(destination[0]) <= BATTLEFIELD_HALF &&
  Math.abs(destination[1]) <= BATTLEFIELD_VERTICAL_HALF &&
  Math.abs(destination[2]) <= BATTLEFIELD_HALF;

const destinationFromManeuver = (
  ship: Ship,
  distance: number,
  turn: number,
  pitch: number,
  roll: number,
) => {
  const finalRotation: Vec3 = [
    clamp(ship.rotation[0] + clamp(pitch, -ship.maxPitch, ship.maxPitch), -85, 85),
    normalizeAngle(ship.rotation[1] + clamp(turn, -ship.maxTurn, ship.maxTurn)),
    normalizeAngle(ship.rotation[2] + clamp(roll, -ship.maxRoll, ship.maxRoll)),
  ];
  const destination = new THREE.Vector3(...ship.position).addScaledVector(
    forwardVector(finalRotation),
    clamp(distance, 0, ship.maxMove),
  );
  return clampDestination(ship, [destination.x, destination.y, destination.z]);
};

const defaultOrderFor = (ship: Ship, ships: Ship[]): Order => {
  const firstEnemy = ships.find((candidate) => candidate.team === "enemy" && candidate.hull > 0);
  const defaultDistance = Math.min(ship.maxMove, ship.team === "player" ? 3 : ship.maxMove * 0.55);
  return {
    destination: destinationFromManeuver(ship, defaultDistance, 0, 0, 0),
    turn: 0,
    pitch: 0,
    roll: 0,
    targetId: firstEnemy?.id ?? "",
    fire: true,
  };
};

const buildDrafts = (ships: Ship[]) =>
  Object.fromEntries(
    ships
      .filter((ship) => ship.team === "player" && ship.hull > 0)
      .map((ship) => [ship.id, defaultOrderFor(ship, ships)]),
  ) as Record<string, Order>;

const endStateFor = (ship: Ship, order: Order): Ship => {
  const finalRotation: Vec3 = [
    clamp(ship.rotation[0] + clamp(order.pitch, -ship.maxPitch, ship.maxPitch), -85, 85),
    normalizeAngle(ship.rotation[1] + clamp(order.turn, -ship.maxTurn, ship.maxTurn)),
    normalizeAngle(ship.rotation[2] + clamp(order.roll, -ship.maxRoll, ship.maxRoll)),
  ];
  const destination = clampDestination(ship, order.destination);

  return {
    ...ship,
    position: destination,
    rotation: finalRotation,
  };
};

const nosePositionFor = (ship: Ship) =>
  new THREE.Vector3(0, 0, -1.48)
    .applyQuaternion(quaternionFor(ship.rotation))
    .add(new THREE.Vector3(...ship.position));

const shotSolution = (shooter: Ship, target: Ship) => {
  const toTarget = new THREE.Vector3(...target.position).sub(nosePositionFor(shooter));
  const distance = toTarget.length();
  const inArc = forwardVector(shooter.rotation).dot(toTarget.normalize()) >= Math.cos(degrees(WEAPON_HALF_ARC));
  return {
    distance,
    inRange: distance <= shooter.weaponRange,
    inArc,
    valid: distance <= shooter.weaponRange && inArc,
  };
};

const armourFaceForHit = (target: Ship, attacker: Ship): ArmourFace => {
  const incoming = new THREE.Vector3(...attacker.position)
    .sub(new THREE.Vector3(...target.position))
    .normalize()
    .applyQuaternion(quaternionFor(target.rotation).invert());
  const x = Math.abs(incoming.x);
  const y = Math.abs(incoming.y);
  const z = Math.abs(incoming.z);
  if (y >= x && y >= z) return incoming.y > 0 ? "dorsal" : "ventral";
  if (x >= z) return incoming.x > 0 ? "starboard" : "port";
  return incoming.z < 0 ? "fore" : "aft";
};

const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

function copyShips(ships: Ship[]) {
  return ships.map((ship) => ({ ...ship, armour: { ...ship.armour }, position: [...ship.position] as Vec3, rotation: [...ship.rotation] as Vec3 }));
}

function makeLabel(text: string, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 72;
  const context = canvas.getContext("2d");
  if (context) {
    context.fillStyle = "rgba(5, 11, 19, 0.86)";
    context.beginPath();
    context.roundRect(8, 8, 304, 52, 12);
    context.fill();
    context.strokeStyle = color;
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = "#eff9ff";
    context.font = "600 25px ui-monospace, monospace";
    context.textAlign = "center";
    context.fillText(text.toUpperCase(), 160, 43);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }),
  );
  sprite.position.set(0, 2.15, 0);
  sprite.scale.set(4, 0.9, 1);
  sprite.renderOrder = 20;
  return sprite;
}

function armourColor(value: number) {
  if (value <= 0) return new THREE.Color("#ff405d");
  if (value < 38) return new THREE.Color("#ffb44a");
  return new THREE.Color("#67ddff");
}

function createShipGroup(ship: Ship) {
  const root = new THREE.Group();
  root.userData.shipId = ship.id;

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: ship.color,
    roughness: 0.42,
    metalness: 0.62,
    emissive: new THREE.Color(ship.color).multiplyScalar(0.08),
  });
  const darkMaterial = new THREE.MeshStandardMaterial({
    color: "#172534",
    roughness: 0.35,
    metalness: 0.82,
  });
  const glowMaterial = new THREE.MeshBasicMaterial({ color: ship.team === "enemy" ? "#ff536b" : "#70f3ff" });

  const hull = new THREE.Mesh(new THREE.ConeGeometry(0.66, 2.9, 6), bodyMaterial);
  hull.rotation.x = -Math.PI / 2;
  hull.userData.pickable = true;
  root.add(hull);

  const wings = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.12, 0.82), darkMaterial);
  wings.position.z = 0.35;
  wings.userData.pickable = true;
  root.add(wings);

  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.65, 1.45), darkMaterial);
  spine.position.set(0, 0.25, 0.15);
  root.add(spine);

  const cockpit = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), bodyMaterial.clone());
  cockpit.position.set(0, 0.34, -0.58);
  root.add(cockpit);

  const muzzle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.09, 0.28, 10),
    new THREE.MeshBasicMaterial({ color: ship.team === "enemy" ? "#ff8594" : "#bdf7ff" }),
  );
  muzzle.rotation.x = -Math.PI / 2;
  muzzle.position.z = -1.5;
  root.add(muzzle);

  [-0.48, 0.48].forEach((x) => {
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 0.65, 10), darkMaterial);
    engine.rotation.x = Math.PI / 2;
    engine.position.set(x, -0.05, 0.92);
    root.add(engine);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.17, 12), glowMaterial);
    glow.position.set(x, -0.05, 1.26);
    glow.rotation.y = Math.PI;
    root.add(glow);
  });

  const plateGeometry = new THREE.BoxGeometry(0.48, 0.12, 0.24);
  const platePositions: Record<ArmourFace, Vec3> = {
    fore: [0, 0.28, -1.12],
    aft: [0, 0.18, 1.06],
    port: [-1.02, 0.16, 0.34],
    starboard: [1.02, 0.16, 0.34],
    dorsal: [0, 0.58, 0.02],
    ventral: [0, -0.4, 0.06],
  };
  const armourMaterials: Partial<Record<ArmourFace, THREE.MeshStandardMaterial>> = {};
  ARMOUR_FACES.forEach((face) => {
    const material = new THREE.MeshStandardMaterial({
      color: armourColor(ship.armour[face]),
      emissive: armourColor(ship.armour[face]).multiplyScalar(0.24),
      metalness: 0.35,
      roughness: 0.3,
    });
    const plate = new THREE.Mesh(plateGeometry, material);
    plate.position.set(...platePositions[face]);
    if (face === "port" || face === "starboard") plate.rotation.y = Math.PI / 2;
    if (face === "dorsal" || face === "ventral") plate.rotation.x = Math.PI / 2;
    root.add(plate);
    armourMaterials[face] = material;
  });

  const selectionRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.7, 0.035, 8, 64),
    new THREE.MeshBasicMaterial({ color: "#d9f7ff", transparent: true, opacity: 0.9 }),
  );
  selectionRing.rotation.x = Math.PI / 2;
  selectionRing.userData.selectionRing = true;
  selectionRing.visible = false;
  root.add(selectionRing);

  const targetRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.48, 0.055, 8, 6),
    new THREE.MeshBasicMaterial({ color: "#ff6675", transparent: true, opacity: 0.82 }),
  );
  targetRing.rotation.x = Math.PI / 2;
  targetRing.rotation.z = Math.PI / 4;
  targetRing.userData.targetRing = true;
  targetRing.visible = false;
  root.add(targetRing);

  root.add(makeLabel(ship.name, ship.color));
  root.userData.armourMaterials = armourMaterials;
  root.userData.bodyMaterial = bodyMaterial;
  return root;
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Points || child instanceof THREE.Sprite) {
      child.geometry?.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => {
        if (material instanceof THREE.SpriteMaterial) material.map?.dispose();
        material.dispose();
      });
    }
  });
}

function clearGroup(group: THREE.Group) {
  [...group.children].forEach((child) => {
    group.remove(child);
    disposeObject(child);
  });
}

function addWeaponEnvelope(
  parent: THREE.Group,
  ship: Ship,
  end: Ship,
  target: Ship | undefined,
  armed: boolean,
) {
  const solution = target ? shotSolution(end, target) : null;
  const color = !armed ? "#456779" : solution?.valid ? "#62edbd" : "#ffb55f";
  const halfArc = degrees(WEAPON_HALF_ARC);
  const coneHeight = ship.weaponRange * Math.cos(halfArc);
  const coneRadius = ship.weaponRange * Math.sin(halfArc);
  const coneGeometry = new THREE.ConeGeometry(coneRadius, coneHeight, 40, 1, true);
  const cone = new THREE.Mesh(
    coneGeometry,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: armed ? 0.055 : 0.025,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  cone.rotation.x = Math.PI / 2;
  cone.position.z = -1.48 - coneHeight / 2;

  const wire = new THREE.Mesh(
    coneGeometry.clone(),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: armed ? 0.28 : 0.1,
      wireframe: true,
      depthWrite: false,
    }),
  );
  wire.rotation.copy(cone.rotation);
  wire.position.copy(cone.position);

  const rangeCap = new THREE.Mesh(
    new THREE.SphereGeometry(ship.weaponRange, 40, 8, 0, Math.PI * 2, 0, halfArc),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: armed ? 0.2 : 0.07,
      wireframe: true,
      depthWrite: false,
    }),
  );
  rangeCap.rotation.x = -Math.PI / 2;
  rangeCap.position.z = -1.48;

  const centerline = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -1.48),
      new THREE.Vector3(0, 0, -1.48 - ship.weaponRange),
    ]),
    new THREE.LineDashedMaterial({ color, dashSize: 0.42, gapSize: 0.3, transparent: true, opacity: armed ? 0.72 : 0.2 }),
  );
  centerline.computeLineDistances();

  const envelopeRoot = new THREE.Group();
  envelopeRoot.position.set(...end.position);
  envelopeRoot.quaternion.copy(quaternionFor(end.rotation));
  envelopeRoot.add(cone, wire, rangeCap, centerline);
  parent.add(envelopeRoot);
}

function addCinematicBeam(group: THREE.Group, shooter: Ship, target: Ship) {
  const start = nosePositionFor(shooter);
  const end = new THREE.Vector3(...target.position);
  const vector = end.clone().sub(start);
  const length = vector.length();
  const direction = vector.clone().normalize();
  const midpoint = start.clone().addScaledVector(direction, length / 2);
  const beamColor = shooter.team === "enemy" ? "#ff4f75" : "#7df4ff";
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);

  const outer = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.14, 1, 10),
    new THREE.MeshBasicMaterial({ color: beamColor, transparent: true, opacity: 0.2, depthWrite: false }),
  );
  outer.position.copy(start);
  outer.quaternion.copy(rotation);
  outer.scale.y = 0.001;
  group.add(outer);

  const core = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.06, 1, 8),
    new THREE.MeshBasicMaterial({ color: "#f5fdff", transparent: true, opacity: 0.98 }),
  );
  core.position.copy(start);
  core.quaternion.copy(rotation);
  core.scale.y = 0.001;
  group.add(core);

  const muzzleFlash = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.34, 1),
    new THREE.MeshBasicMaterial({ color: beamColor, transparent: true, opacity: 0.92 }),
  );
  muzzleFlash.position.copy(start);
  group.add(muzzleFlash);

  const impact = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.55, 1),
    new THREE.MeshBasicMaterial({ color: "#fff0cf", transparent: true, opacity: 0.94 }),
  );
  impact.position.copy(end);
  impact.visible = false;
  group.add(impact);

  return { outer, core, muzzleFlash, impact, start, midpoint, direction, length };
}

type SceneContext = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  shipGroups: Map<string, THREE.Group>;
  planGroup: THREE.Group;
  laserGroup: THREE.Group;
  frame: number;
};

function TacticalScene({
  ships,
  drafts,
  staged,
  selectedShipId,
  selectedTargetId,
  resolution,
  cameraCommand,
  onSelect,
  onCombatFocus,
  onResolutionComplete,
}: {
  ships: Ship[];
  drafts: Record<string, Order>;
  staged: Set<string>;
  selectedShipId: string;
  selectedTargetId: string;
  resolution: Resolution | null;
  cameraCommand: CameraCommand;
  onSelect: (id: string) => void;
  onCombatFocus: (focus: CombatFocus | null) => void;
  onResolutionComplete: (resolution: Resolution) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const contextRef = useRef<SceneContext | null>(null);
  const selectRef = useRef(onSelect);
  const focusRef = useRef(onCombatFocus);
  const completeRef = useRef(onResolutionComplete);

  useEffect(() => {
    selectRef.current = onSelect;
    focusRef.current = onCombatFocus;
    completeRef.current = onResolutionComplete;
  }, [onSelect, onCombatFocus, onResolutionComplete]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 160);
    camera.position.set(19, 16, 22);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.setSize(mount.clientWidth, mount.clientHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.domElement.setAttribute("aria-label", "Interactive 3D tactical battlefield");
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.minDistance = 8;
    controls.maxDistance = 55;
    controls.maxPolarAngle = Math.PI * 0.92;
    controls.target.set(0, 0, 0);
    controls.update();

    scene.add(new THREE.HemisphereLight("#bfe9ff", "#07101b", 1.65));
    const keyLight = new THREE.DirectionalLight("#d5f2ff", 3.1);
    keyLight.position.set(-9, 15, 8);
    scene.add(keyLight);
    const enemyLight = new THREE.PointLight("#ff466a", 26, 35, 2);
    enemyLight.position.set(12, 4, -4);
    scene.add(enemyLight);

    [-7, 0, 7].forEach((height, index) => {
      const grid = new THREE.GridHelper(40, 20, index === 1 ? "#4a8ba9" : "#25465b", "#183043");
      grid.position.y = height;
      const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
      materials.forEach((material) => {
        material.transparent = true;
        material.opacity = index === 1 ? 0.32 : 0.13;
      });
      scene.add(grid);
    });

    const volume = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(40, 14, 40)),
      new THREE.LineBasicMaterial({ color: "#315971", transparent: true, opacity: 0.38 }),
    );
    scene.add(volume);

    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(900 * 3);
    for (let index = 0; index < 900; index += 1) {
      const radius = 45 + Math.random() * 45;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPositions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
      starPositions[index * 3 + 1] = radius * Math.cos(phi);
      starPositions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
    const stars = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({ color: "#b9dcf2", size: 0.12, transparent: true, opacity: 0.72, sizeAttenuation: true }),
    );
    scene.add(stars);

    const planGroup = new THREE.Group();
    const laserGroup = new THREE.Group();
    scene.add(planGroup, laserGroup);

    const shipGroups = new Map<string, THREE.Group>();
    const context: SceneContext = { scene, camera, renderer, controls, shipGroups, planGroup, laserGroup, frame: 0 };
    contextRef.current = context;

    const pointerStart = new THREE.Vector2();
    const handlePointerDown = (event: PointerEvent) => pointerStart.set(event.clientX, event.clientY);
    const handlePointerUp = (event: PointerEvent) => {
      if (event.button !== 0 || pointerStart.distanceTo(new THREE.Vector2(event.clientX, event.clientY)) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects([...shipGroups.values()], true);
      for (const hit of hits) {
        let current: THREE.Object3D | null = hit.object;
        while (current && !current.userData.shipId) current = current.parent;
        if (current?.userData.shipId) {
          selectRef.current(current.userData.shipId as string);
          break;
        }
      }
    };
    const stopContextMenu = (event: MouseEvent) => event.preventDefault();
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("contextmenu", stopContextMenu);

    const handleKeyboardCamera = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, select, textarea, button")) return;
      const panKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"];
      if (!panKeys.includes(event.key)) return;
      event.preventDefault();
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
      const movement = new THREE.Vector3();
      if (event.key === "ArrowUp" || event.key === "w") movement.add(forward);
      if (event.key === "ArrowDown" || event.key === "s") movement.sub(forward);
      if (event.key === "ArrowRight" || event.key === "d") movement.add(right);
      if (event.key === "ArrowLeft" || event.key === "a") movement.sub(right);
      movement.multiplyScalar(0.75);
      camera.position.add(movement);
      controls.target.add(movement);
      controls.update();
    };
    window.addEventListener("keydown", handleKeyboardCamera);

    let resizeFrame = 0;
    const resizeObserver = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        const width = Math.max(1, mount.clientWidth);
        const height = Math.max(1, mount.clientHeight);
        const pixelRatio = renderer.getPixelRatio();
        if (renderer.domElement.width !== Math.round(width * pixelRatio) || renderer.domElement.height !== Math.round(height * pixelRatio)) {
          renderer.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        }
      });
    });
    resizeObserver.observe(mount);

    const render = () => {
      if (controls.enabled) controls.update();
      renderer.render(scene, camera);
      context.frame = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(context.frame);
      cancelAnimationFrame(resizeFrame);
      resizeObserver.disconnect();
      window.removeEventListener("keydown", handleKeyboardCamera);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("contextmenu", stopContextMenu);
      controls.dispose();
      scene.traverse((object) => disposeObject(object));
      renderer.dispose();
      renderer.domElement.remove();
      contextRef.current = null;
    };
  }, []);

  useEffect(() => {
    const context = contextRef.current;
    if (!context) return;
    const liveIds = new Set(ships.map((ship) => ship.id));
    context.shipGroups.forEach((group, id) => {
      if (!liveIds.has(id)) {
        context.scene.remove(group);
        disposeObject(group);
        context.shipGroups.delete(id);
      }
    });

    ships.forEach((ship) => {
      let group = context.shipGroups.get(ship.id);
      if (!group) {
        group = createShipGroup(ship);
        context.shipGroups.set(ship.id, group);
        context.scene.add(group);
      }
      if (!resolution) {
        group.position.set(...ship.position);
        group.quaternion.copy(quaternionFor(ship.rotation));
      }
      group.visible = ship.hull > 0;
      group.traverse((child) => {
        if (child.userData.selectionRing) child.visible = ship.id === selectedShipId;
        if (child.userData.targetRing) child.visible = ship.id === selectedTargetId;
      });
      const materials = group.userData.armourMaterials as Partial<Record<ArmourFace, THREE.MeshStandardMaterial>>;
      ARMOUR_FACES.forEach((face) => {
        materials[face]?.color.copy(armourColor(ship.armour[face]));
        materials[face]?.emissive.copy(armourColor(ship.armour[face]).multiplyScalar(0.24));
      });
    });

    clearGroup(context.planGroup);
    if (resolution) return;

    ships
      .filter((ship) => ship.team === "player" && ship.hull > 0 && drafts[ship.id])
      .forEach((ship) => {
        const order = drafts[ship.id];
        const end = endStateFor(ship, order);
        const startPoint = new THREE.Vector3(...ship.position);
        const endPoint = new THREE.Vector3(...end.position);
        const midpoint = startPoint.clone().lerp(endPoint, 0.5).add(new THREE.Vector3(0, 0.85, 0));
        const curve = new THREE.QuadraticBezierCurve3(startPoint, midpoint, endPoint);
        const path = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(curve.getPoints(28)),
          new THREE.LineDashedMaterial({
            color: staged.has(ship.id) ? "#65edc0" : "#69cfff",
            dashSize: 0.35,
            gapSize: 0.24,
            transparent: true,
            opacity: ship.id === selectedShipId ? 0.95 : 0.42,
          }),
        );
        path.computeLineDistances();
        context.planGroup.add(path);

        const ghost = new THREE.Mesh(
          new THREE.ConeGeometry(0.48, 1.8, 6),
          new THREE.MeshBasicMaterial({ color: ship.color, wireframe: true, transparent: true, opacity: ship.id === selectedShipId ? 0.82 : 0.34 }),
        );
        ghost.rotation.x = -Math.PI / 2;
        const ghostRoot = new THREE.Group();
        ghostRoot.position.copy(endPoint);
        ghostRoot.quaternion.copy(quaternionFor(end.rotation));
        ghostRoot.add(ghost);
        context.planGroup.add(ghostRoot);

        if (ship.id === selectedShipId) {
          const envelope = new THREE.Mesh(
            new THREE.SphereGeometry(ship.maxMove, 18, 12),
            new THREE.MeshBasicMaterial({ color: "#4b8ba8", transparent: true, opacity: 0.1, wireframe: true, depthWrite: false }),
          );
          envelope.position.copy(startPoint);
          context.planGroup.add(envelope);

          const target = ships.find((candidate) => candidate.id === order.targetId && candidate.hull > 0);
          addWeaponEnvelope(context.planGroup, ship, end, target, order.fire);
          if (target && order.fire) {
            const plannedMuzzle = nosePositionFor(end);
            const lock = new THREE.Line(
              new THREE.BufferGeometry().setFromPoints([plannedMuzzle, new THREE.Vector3(...target.position)]),
              new THREE.LineDashedMaterial({ color: "#ff6e7e", dashSize: 0.22, gapSize: 0.18, transparent: true, opacity: 0.7 }),
            );
            lock.computeLineDistances();
            context.planGroup.add(lock);
          }
        }
      });
  }, [ships, drafts, staged, selectedShipId, selectedTargetId, resolution]);

  useEffect(() => {
    const context = contextRef.current;
    if (!context || !cameraCommand.nonce) return;
    if (cameraCommand.kind === "reset") {
      context.camera.position.set(19, 16, 22);
      context.controls.target.set(0, 0, 0);
    } else {
      const ship = ships.find((candidate) => candidate.id === cameraCommand.shipId);
      if (ship) {
        const target = new THREE.Vector3(...ship.position);
        const offset = context.camera.position.clone().sub(context.controls.target).normalize().multiplyScalar(10);
        context.controls.target.copy(target);
        context.camera.position.copy(target.add(offset));
      }
    }
    context.controls.update();
  }, [cameraCommand, ships]);

  useEffect(() => {
    const context = contextRef.current;
    if (!context || !resolution) return;
    let cancelled = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const tacticalPosition = context.camera.position.clone();
    const tacticalTarget = context.controls.target.clone();
    const tacticalFov = context.camera.fov;
    const started = performance.now();
    const duration = 1550;
    const starts = new Map(
      ships.map((ship) => [
        ship.id,
        {
          position: new THREE.Vector3(...ship.position),
          quaternion: quaternionFor(ship.rotation),
        },
      ]),
    );

    const delay = (milliseconds: number) => new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        resolve();
      }, milliseconds);
      timers.add(timer);
    });

    const tweenCamera = (position: THREE.Vector3, lookAt: THREE.Vector3, milliseconds: number) => {
      const fromPosition = context.camera.position.clone();
      const fromLook = context.controls.target.clone();
      const tweenStarted = performance.now();
      return new Promise<void>((resolve) => {
        const step = (time: number) => {
          if (cancelled) {
            resolve();
            return;
          }
          const raw = clamp((time - tweenStarted) / milliseconds, 0, 1);
          const eased = raw * raw * (3 - 2 * raw);
          context.camera.position.lerpVectors(fromPosition, position, eased);
          const currentLook = fromLook.clone().lerp(lookAt, eased);
          context.camera.lookAt(currentLook);
          context.controls.target.copy(currentLook);
          if (raw < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
    };

    const growBeam = (beam: ReturnType<typeof addCinematicBeam>, milliseconds: number) => {
      const beamStarted = performance.now();
      return new Promise<void>((resolve) => {
        const step = (time: number) => {
          if (cancelled) {
            resolve();
            return;
          }
          const raw = clamp((time - beamStarted) / milliseconds, 0, 1);
          const eased = 1 - Math.pow(1 - raw, 3);
          const currentLength = Math.max(0.001, beam.length * eased);
          const currentMidpoint = beam.start.clone().addScaledVector(beam.direction, currentLength / 2);
          beam.outer.scale.y = currentLength;
          beam.core.scale.y = currentLength;
          beam.outer.position.copy(currentMidpoint);
          beam.core.position.copy(currentMidpoint);
          beam.muzzleFlash.scale.setScalar(1 + Math.sin(raw * Math.PI) * 0.9);
          beam.impact.visible = raw > 0.78;
          if (beam.impact.visible) beam.impact.scale.setScalar(0.7 + (raw - 0.78) * 2.2);
          if (raw < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      });
    };

    const playSalvos = async () => {
      const teamPriority: Record<Team, number> = { player: 0, ally: 1, enemy: 2 };
      const shots = Object.entries(resolution.orders)
        .map(([shipId, order]) => {
          const shooter = resolution.endShips.find((ship) => ship.id === shipId && ship.hull > 0);
          const target = resolution.endShips.find((ship) => ship.id === order.targetId && ship.hull > 0);
          return order.fire && shooter && target && shotSolution(shooter, target).valid ? { shooter, target } : null;
        })
        .filter((shot): shot is { shooter: Ship; target: Ship } => Boolean(shot))
        .sort((a, b) => teamPriority[a.shooter.team] - teamPriority[b.shooter.team]);

      if (!shots.length) {
        await delay(420);
        if (!cancelled) completeRef.current(resolution);
        return;
      }

      context.controls.enabled = false;
      context.camera.fov = 42;
      context.camera.updateProjectionMatrix();

      for (const { shooter, target } of shots) {
        if (cancelled) return;
        const muzzle = nosePositionFor(shooter);
        const targetPoint = new THREE.Vector3(...target.position);
        const direction = targetPoint.clone().sub(muzzle).normalize();
        const upReference = Math.abs(direction.dot(new THREE.Vector3(0, 1, 0))) > 0.92
          ? new THREE.Vector3(0, 0, 1)
          : new THREE.Vector3(0, 1, 0);
        const side = new THREE.Vector3().crossVectors(direction, upReference).normalize();
        const lift = new THREE.Vector3().crossVectors(side, direction).normalize();
        const cameraPosition = muzzle
          .clone()
          .addScaledVector(direction, -4.8)
          .addScaledVector(side, shooter.team === "enemy" ? -2.3 : 2.3)
          .addScaledVector(lift, 1.65);
        const lookAt = muzzle.clone().lerp(targetPoint, 0.48);

        focusRef.current({ shooter: shooter.name, target: target.name, team: shooter.team });
        await tweenCamera(cameraPosition, lookAt, 430);
        if (cancelled) return;
        clearGroup(context.laserGroup);
        const beam = addCinematicBeam(context.laserGroup, shooter, target);
        await growBeam(beam, 240);
        await delay(540);
        clearGroup(context.laserGroup);
        await delay(120);
      }

      if (cancelled) return;
      focusRef.current(null);
      await tweenCamera(tacticalPosition, tacticalTarget, 520);
      context.camera.fov = tacticalFov;
      context.camera.updateProjectionMatrix();
      context.controls.target.copy(tacticalTarget);
      context.controls.enabled = true;
      context.controls.update();
      if (!cancelled) completeRef.current(resolution);
    };

    const animateMovement = (time: number) => {
      if (cancelled) return;
      const raw = clamp((time - started) / duration, 0, 1);
      const eased = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2;
      resolution.endShips.forEach((endShip) => {
        const group = context.shipGroups.get(endShip.id);
        const start = starts.get(endShip.id);
        if (!group || !start) return;
        group.position.lerpVectors(start.position, new THREE.Vector3(...endShip.position), eased);
        group.quaternion.slerpQuaternions(start.quaternion, quaternionFor(endShip.rotation), eased);
      });

      if (raw < 1) {
        requestAnimationFrame(animateMovement);
        return;
      }
      void playSalvos();
    };
    requestAnimationFrame(animateMovement);

    return () => {
      cancelled = true;
      timers.forEach((timer) => clearTimeout(timer));
      focusRef.current(null);
      clearGroup(context.laserGroup);
      context.controls.enabled = true;
      context.camera.position.copy(tacticalPosition);
      context.controls.target.copy(tacticalTarget);
      context.camera.fov = tacticalFov;
      context.camera.updateProjectionMatrix();
      context.controls.update();
    };
  }, [resolution, ships]);

  return <div className="three-mount" ref={mountRef} />;
}

function SliderControl({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
  disabled,
  step = 1,
  decimals = 0,
  axis,
  lowLabel,
  highLabel,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
  disabled: boolean;
  step?: number;
  decimals?: number;
  axis?: string;
  lowLabel?: string;
  highLabel?: string;
}) {
  const formattedValue = decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
  return (
    <label className="slider-control">
      <span>
        <span className="slider-name">{axis && <b>{axis}</b>}{label}</span>
        <output>{value > 0 && min < 0 ? "+" : ""}{formattedValue}{suffix}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {lowLabel && highLabel && <small className="slider-directions"><span>{lowLabel}</span><span>{highLabel}</span></small>}
    </label>
  );
}

export function SpaceGame() {
  const [ships, setShips] = useState<Ship[]>(() => copyShips(INITIAL_SHIPS));
  const [selectedShipId, setSelectedShipId] = useState("aegis");
  const [drafts, setDrafts] = useState<Record<string, Order>>(() => buildDrafts(INITIAL_SHIPS));
  const [staged, setStaged] = useState<Set<string>>(() => new Set());
  const [phase, setPhase] = useState<Phase>("planning");
  const [turn, setTurn] = useState(1);
  const [log, setLog] = useState(INITIAL_LOG);
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [combatFocus, setCombatFocus] = useState<CombatFocus | null>(null);
  const [cameraCommand, setCameraCommand] = useState<CameraCommand>({ kind: "reset", nonce: 0 });
  const [helpOpen, setHelpOpen] = useState(true);

  const selectedShip = ships.find((ship) => ship.id === selectedShipId) ?? ships.find((ship) => ship.team === "player" && ship.hull > 0) ?? ships[0];
  const selectedDraft = selectedShip ? drafts[selectedShip.id] : undefined;
  const enemies = ships.filter((ship) => ship.team === "enemy" && ship.hull > 0);
  const playerShips = ships.filter((ship) => ship.team === "player");
  const livingPlayerShips = playerShips.filter((ship) => ship.hull > 0);
  const alliedNPC = ships.find((ship) => ship.team === "ally");
  const selectedTargetId = selectedDraft?.targetId ?? "";
  const readyCount = livingPlayerShips.filter((ship) => staged.has(ship.id)).length;
  const allDestinationsValid = livingPlayerShips.every((ship) => drafts[ship.id] && isDestinationValid(ship, drafts[ship.id].destination));
  const allReady = livingPlayerShips.length > 0 && readyCount === livingPlayerShips.length && allDestinationsValid;
  const plottedDistance = selectedShip && selectedDraft ? distanceBetween(selectedShip.position, selectedDraft.destination) : 0;
  const destinationValid = selectedShip && selectedDraft ? isDestinationValid(selectedShip, selectedDraft.destination) : false;

  const forecast = useMemo(() => {
    if (!selectedShip || !selectedDraft) return null;
    const target = ships.find((ship) => ship.id === selectedDraft.targetId && ship.hull > 0);
    if (!target || !selectedDraft.fire) return null;
    const predicted = endStateFor(selectedShip, selectedDraft);
    return shotSolution(predicted, target);
  }, [selectedShip, selectedDraft, ships]);

  const updateDraft = useCallback((patch: Partial<Order>) => {
    if (!selectedShip || selectedShip.team !== "player" || phase !== "planning") return;
    setDrafts((current) => ({
      ...current,
      [selectedShip.id]: { ...current[selectedShip.id], ...patch },
    }));
    setStaged((current) => {
      const next = new Set(current);
      next.delete(selectedShip.id);
      return next;
    });
  }, [selectedShip, phase]);

  const updateDestinationAxis = useCallback((axis: 0 | 1 | 2, value: number) => {
    if (!selectedDraft) return;
    const destination = [...selectedDraft.destination] as Vec3;
    destination[axis] = value;
    updateDraft({ destination });
  }, [selectedDraft, updateDraft]);

  const faceTarget = useCallback(() => {
    if (!selectedShip || !selectedDraft) return;
    const target = ships.find((ship) => ship.id === selectedDraft.targetId);
    if (!target) return;
    const delta = new THREE.Vector3(...target.position).sub(new THREE.Vector3(...selectedDraft.destination));
    const flat = Math.hypot(delta.x, delta.z);
    const desiredTurn = THREE.MathUtils.radToDeg(Math.atan2(delta.x, -delta.z));
    const desiredPitch = THREE.MathUtils.radToDeg(Math.atan2(delta.y, flat));
    updateDraft({
      turn: clamp(normalizeAngle(desiredTurn - selectedShip.rotation[1]), -selectedShip.maxTurn, selectedShip.maxTurn),
      pitch: clamp(desiredPitch - selectedShip.rotation[0], -selectedShip.maxPitch, selectedShip.maxPitch),
    });
  }, [selectedShip, selectedDraft, ships, updateDraft]);

  const generateNpcOrders = useCallback((currentShips: Ship[]) => {
    const orders: Record<string, Order> = {};
    currentShips
      .filter((ship) => ship.team !== "player" && ship.hull > 0)
      .forEach((ship) => {
        const targets = currentShips.filter((candidate) =>
          candidate.hull > 0 && (ship.team === "enemy" ? candidate.team !== "enemy" : candidate.team === "enemy"),
        );
        const target = targets.sort((a, b) => distanceBetween(ship.position, a.position) - distanceBetween(ship.position, b.position))[0];
        if (!target) return;
        const delta = new THREE.Vector3(...target.position).sub(new THREE.Vector3(...ship.position));
        const distance = delta.length();
        const moveDistance = distance > ship.weaponRange * 0.72 ? ship.maxMove * 0.68 : ship.maxMove * 0.22;
        const destinationPoint = new THREE.Vector3(...ship.position).addScaledVector(delta.clone().normalize(), moveDistance);
        const destination = clampDestination(ship, [destinationPoint.x, destinationPoint.y, destinationPoint.z]);
        const aimDelta = new THREE.Vector3(...target.position).sub(new THREE.Vector3(...destination));
        const desiredTurn = THREE.MathUtils.radToDeg(Math.atan2(aimDelta.x, -aimDelta.z));
        const desiredPitch = THREE.MathUtils.radToDeg(Math.atan2(aimDelta.y, Math.hypot(aimDelta.x, aimDelta.z)));
        const turn = clamp(normalizeAngle(desiredTurn - ship.rotation[1]), -ship.maxTurn, ship.maxTurn);
        const pitch = clamp(desiredPitch - ship.rotation[0], -ship.maxPitch, ship.maxPitch);
        const roll = ship.team === "enemy"
          ? clamp(turn * -0.38, -ship.maxRoll, ship.maxRoll)
          : clamp(turn * 0.28, -ship.maxRoll, ship.maxRoll);
        orders[ship.id] = {
          destination,
          turn,
          pitch,
          roll,
          targetId: target.id,
          fire: true,
        };
      });
    return orders;
  }, []);

  const executeTurn = () => {
    if (!allReady || !allDestinationsValid || phase !== "planning") return;
    const npcOrders = generateNpcOrders(ships);
    const allOrders: Record<string, Order> = { ...drafts, ...npcOrders };
    const endShips = ships.map((ship) => {
      const order = allOrders[ship.id];
      return ship.hull > 0 && order ? endStateFor(ship, order) : ship;
    });
    setPhase("executing");
    setLog((current) => [`Turn ${turn}: all vectors locked. Resolving simultaneously…`, ...current].slice(0, 8));
    setResolution({ token: Date.now(), endShips, orders: allOrders });
  };

  const resolveCombat = useCallback((finished: Resolution) => {
    const results = copyShips(finished.endShips);
    const outcomes: string[] = [];

    Object.entries(finished.orders).forEach(([shipId, order]) => {
      if (!order.fire || !order.targetId) return;
      const shooter = finished.endShips.find((ship) => ship.id === shipId && ship.hull > 0);
      const targetBeforeDamage = finished.endShips.find((ship) => ship.id === order.targetId && ship.hull > 0);
      const target = results.find((ship) => ship.id === order.targetId);
      if (!shooter || !targetBeforeDamage || !target) return;
      const solution = shotSolution(shooter, targetBeforeDamage);
      if (!solution.valid) {
        outcomes.push(`${shooter.name}: shot lost — target escaped ${!solution.inRange ? "range" : "firing arc"}.`);
        return;
      }
      const face = armourFaceForHit(targetBeforeDamage, shooter);
      const armourBefore = target.armour[face];
      const absorbed = Math.min(armourBefore, shooter.weaponDamage);
      const overflow = shooter.weaponDamage - absorbed;
      target.armour[face] = Math.max(0, armourBefore - shooter.weaponDamage);
      target.hull = Math.max(0, target.hull - overflow);
      outcomes.push(
        `${shooter.name} hit ${target.name} ${face} armour for ${shooter.weaponDamage}${overflow > 0 ? ` (${overflow} hull)` : ""}.`,
      );
    });

    const destroyed = results.filter((ship) => ship.hull <= 0 && finished.endShips.find((before) => before.id === ship.id)?.hull);
    destroyed.forEach((ship) => outcomes.unshift(`${ship.name} destroyed.`));
    setShips(results);
    setResolution(null);
    setLog((current) => [...outcomes.reverse(), ...current].slice(0, 9));

    const enemyAlive = results.some((ship) => ship.team === "enemy" && ship.hull > 0);
    const playerAlive = results.some((ship) => ship.team === "player" && ship.hull > 0);
    if (!enemyAlive) {
      setPhase("victory");
      return;
    }
    if (!playerAlive) {
      setPhase("defeat");
      return;
    }

    setTurn((current) => current + 1);
    setPhase("planning");
    setStaged(new Set());
    setDrafts(buildDrafts(results));
    const nextPlayer = results.find((ship) => ship.team === "player" && ship.hull > 0);
    if (nextPlayer) setSelectedShipId(nextPlayer.id);
  }, []);

  const resetGame = useCallback(() => {
    const resetShips = copyShips(INITIAL_SHIPS);
    setShips(resetShips);
    setDrafts(buildDrafts(resetShips));
    setStaged(new Set());
    setSelectedShipId("aegis");
    setPhase("planning");
    setTurn(1);
    setLog(INITIAL_LOG);
    setResolution(null);
    setCombatFocus(null);
    setCameraCommand({ kind: "reset", nonce: Date.now() });
  }, []);

  const selectShip = useCallback((id: string) => {
    const clicked = ships.find((ship) => ship.id === id);
    if (!clicked) return;
    if (clicked.team === "player" && clicked.hull > 0) {
      setSelectedShipId(id);
      return;
    }
    if (selectedShip?.team === "player" && clicked.team === "enemy" && clicked.hull > 0) {
      updateDraft({ targetId: id });
    }
  }, [ships, selectedShip, updateDraft]);

  useEffect(() => {
    const handleShortcuts = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, select, textarea")) return;
      if (event.key.toLowerCase() === "f") {
        setCameraCommand({ kind: "focus", shipId: selectedShipId, nonce: Date.now() });
      }
      if (event.key === "1") setCameraCommand({ kind: "reset", nonce: Date.now() });
      if (event.key === "Escape" && selectedShip?.team === "player" && phase === "planning") {
        setDrafts((current) => ({ ...current, [selectedShip.id]: defaultOrderFor(selectedShip, ships) }));
        setStaged((current) => {
          const next = new Set(current);
          next.delete(selectedShip.id);
          return next;
        });
      }
    };
    window.addEventListener("keydown", handleShortcuts);
    return () => window.removeEventListener("keydown", handleShortcuts);
  }, [selectedShipId, selectedShip, ships, phase]);

  if (!selectedShip) return null;
  const controlsDisabled = phase !== "planning" || selectedShip.team !== "player" || selectedShip.hull <= 0;
  const hullPercent = (selectedShip.hull / selectedShip.maxHull) * 100;

  return (
    <main className="game-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true"><i /><i /></span>
          <div>
            <strong>PARALLAX</strong>
            <span>Fleet tactics simulator</span>
          </div>
        </div>
        <div className="turn-status" aria-live="polite">
          <span className={`phase-dot ${phase}`} />
          <div>
            <small>TURN {String(turn).padStart(2, "0")}</small>
            <strong>{phase === "executing" ? "SIMULTANEOUS RESOLUTION" : phase.toUpperCase()}</strong>
          </div>
        </div>
        <div className="mission-brief">
          <small>KESTREL REACH · SKIRMISH 04</small>
          <span>Break the Corsair formation</span>
        </div>
        <button className="quiet-button" type="button" onClick={resetGame}>Restart</button>
      </header>

      <section className="battle-layout">
        <div className="viewport-panel">
          <TacticalScene
            ships={ships}
            drafts={drafts}
            staged={staged}
            selectedShipId={selectedShipId}
            selectedTargetId={selectedTargetId}
            resolution={resolution}
            cameraCommand={cameraCommand}
            onSelect={selectShip}
            onCombatFocus={setCombatFocus}
            onResolutionComplete={resolveCombat}
          />

          <div className="viewport-heading">
            <span>TACTICAL VOLUME</span>
            <strong>40 × 14 × 40 KM</strong>
          </div>

          {selectedShip.team === "player" && selectedDraft && phase === "planning" && (
            <div className={`weapon-envelope-readout ${!selectedDraft.fire ? "safe" : forecast?.valid ? "valid" : "warning"}`}>
              <i />
              <span>FORWARD GUN ENVELOPE</span>
              <strong>{selectedShip.weaponRange} KM · {WEAPON_HALF_ARC * 2}° ARC</strong>
            </div>
          )}

          <div className="camera-tools" aria-label="Camera controls">
            <button type="button" onClick={() => setCameraCommand({ kind: "focus", shipId: selectedShipId, nonce: Date.now() })}>Focus <kbd>F</kbd></button>
            <button type="button" onClick={() => setCameraCommand({ kind: "reset", nonce: Date.now() })}>Reset <kbd>1</kbd></button>
            <button type="button" className={helpOpen ? "active" : ""} onClick={() => setHelpOpen((open) => !open)}>Controls</button>
          </div>

          {helpOpen && (
            <div className="help-card">
              <button type="button" aria-label="Close camera help" onClick={() => setHelpOpen(false)}>×</button>
              <strong>CAMERA</strong>
              <span><b>Drag</b> orbit · <b>Right drag</b> pan</span>
              <span><b>Wheel / pinch</b> zoom · <b>WASD</b> pan</span>
              <span><b>Click ship</b> select or target</span>
              <span><b>Cone tip</b> bow and cannon origin</span>
            </div>
          )}

          {phase === "executing" && (
            <div className={`resolution-banner ${combatFocus ? `firing ${combatFocus.team}` : "moving"}`} role="status">
              <span />
              <div>
                <small>{combatFocus ? "WEAPON DISCHARGE" : "ORDERS RELEASED"}</small>
                <strong>{combatFocus ? `${combatFocus.shooter} → ${combatFocus.target}` : "Resolving all vectors"}</strong>
              </div>
            </div>
          )}

          {(phase === "victory" || phase === "defeat") && (
            <div className="end-state">
              <small>SKIRMISH COMPLETE</small>
              <h2>{phase === "victory" ? "Formation broken" : "Command ships lost"}</h2>
              <p>{phase === "victory" ? "The Kestrel Reach is secure." : "Replot the engagement and try a new vector."}</p>
              <button type="button" onClick={resetGame}>Run another skirmish</button>
            </div>
          )}

          <div className="fleet-dock" aria-label="Player fleet orders">
            <div className="dock-title">
              <small>COMMAND WING</small>
              <strong>{readyCount}/{livingPlayerShips.length} VECTORS STAGED</strong>
            </div>
            <div className="ship-tabs">
              {playerShips.map((ship, index) => (
                <button
                  type="button"
                  key={ship.id}
                  className={`${selectedShipId === ship.id ? "selected" : ""} ${ship.hull <= 0 ? "destroyed" : ""}`}
                  onClick={() => ship.hull > 0 && setSelectedShipId(ship.id)}
                >
                  <span className="ship-index">0{index + 1}</span>
                  <span><strong>{ship.name}</strong><small>{ship.hull <= 0 ? "DESTROYED" : staged.has(ship.id) ? "ORDER READY" : "DRAFT VECTOR"}</small></span>
                  <i className={staged.has(ship.id) ? "ready" : ""} />
                </button>
              ))}
            </div>
            <button className="execute-button" type="button" disabled={!allReady || phase !== "planning"} onClick={executeTurn}>
              <span>{phase === "executing" ? "RESOLVING" : allReady ? "EXECUTE TURN" : `${livingPlayerShips.length - readyCount} ORDER${livingPlayerShips.length - readyCount === 1 ? "" : "S"} NEEDED`}</span>
              <b aria-hidden="true">→</b>
            </button>
          </div>
        </div>

        <aside className="command-panel">
          <section className="ship-identity">
            <div>
              <span className="eyebrow">{TEAM_LABELS[selectedShip.team]} · {selectedShip.callsign}</span>
              <h1>{selectedShip.name}</h1>
              <p>{selectedShip.className}</p>
            </div>
            <span className={`team-glyph ${selectedShip.team}`} aria-hidden="true" />
          </section>

          <section className="integrity-block">
            <div className="section-heading"><span>HULL INTEGRITY</span><strong>{Math.round(selectedShip.hull)} / {selectedShip.maxHull}</strong></div>
            <div className="integrity-track"><i style={{ width: `${hullPercent}%` }} /></div>
            <div className="armour-grid">
              {ARMOUR_FACES.map((face) => (
                <div key={face} className={selectedShip.armour[face] <= 0 ? "breached" : selectedShip.armour[face] < 38 ? "damaged" : ""}>
                  <span>{titleCase(face)}</span><strong>{Math.round(selectedShip.armour[face])}</strong>
                  <i><b style={{ width: `${selectedShip.armour[face]}%` }} /></i>
                </div>
              ))}
            </div>
          </section>

          {selectedShip.team === "player" && selectedDraft ? (
            <>
              <section className="orders-block location-block">
                <div className="section-heading stepped"><span><b>01</b>TARGET LOCATION</span><strong>GRID ENDPOINT</strong></div>
                <div className={`plot-status ${destinationValid ? "valid" : "invalid"}`}>
                  <span>VECTOR LENGTH</span>
                  <strong>{plottedDistance.toFixed(1)} / {selectedShip.maxMove} KM</strong>
                  <i><b style={{ width: `${Math.min(100, (plottedDistance / selectedShip.maxMove) * 100)}%` }} /></i>
                </div>
                <SliderControl label="Grid X" axis="X" value={selectedDraft.destination[0]} min={Math.max(-BATTLEFIELD_HALF, selectedShip.position[0] - selectedShip.maxMove)} max={Math.min(BATTLEFIELD_HALF, selectedShip.position[0] + selectedShip.maxMove)} suffix=" km" step={0.5} decimals={1} disabled={controlsDisabled} onChange={(value) => updateDestinationAxis(0, value)} />
                <SliderControl label="Altitude" axis="Y" value={selectedDraft.destination[1]} min={Math.max(-BATTLEFIELD_VERTICAL_HALF, selectedShip.position[1] - selectedShip.maxMove)} max={Math.min(BATTLEFIELD_VERTICAL_HALF, selectedShip.position[1] + selectedShip.maxMove)} suffix=" km" step={0.5} decimals={1} disabled={controlsDisabled} onChange={(value) => updateDestinationAxis(1, value)} />
                <SliderControl label="Grid Z" axis="Z" value={selectedDraft.destination[2]} min={Math.max(-BATTLEFIELD_HALF, selectedShip.position[2] - selectedShip.maxMove)} max={Math.min(BATTLEFIELD_HALF, selectedShip.position[2] + selectedShip.maxMove)} suffix=" km" step={0.5} decimals={1} disabled={controlsDisabled} onChange={(value) => updateDestinationAxis(2, value)} />
                <div className="quick-actions">
                  <button type="button" disabled={controlsDisabled} onClick={() => updateDraft({ destination: [...selectedShip.position] as Vec3 })}>Hold position</button>
                  <button type="button" disabled={controlsDisabled} onClick={() => updateDraft({ destination: destinationFromManeuver(selectedShip, selectedShip.maxMove * 0.6, 0, 0, 0) })}>Forward 60%</button>
                </div>
              </section>

              <section className="orders-block orientation-block">
                <div className="section-heading stepped"><span><b>02</b>FINAL ORIENTATION</span><strong>3-AXIS ATTITUDE</strong></div>
                <SliderControl label="Turn left / right" axis="Y" value={selectedDraft.turn} min={-selectedShip.maxTurn} max={selectedShip.maxTurn} suffix="°" lowLabel="LEFT" highLabel="RIGHT" disabled={controlsDisabled} onChange={(turnValue) => updateDraft({ turn: turnValue })} />
                <SliderControl label="Nose down / up" axis="X" value={selectedDraft.pitch} min={-selectedShip.maxPitch} max={selectedShip.maxPitch} suffix="°" lowLabel="DOWN" highLabel="UP" disabled={controlsDisabled} onChange={(pitch) => updateDraft({ pitch })} />
                <SliderControl label="Roll left / right" axis="Z" value={selectedDraft.roll} min={-selectedShip.maxRoll} max={selectedShip.maxRoll} suffix="°" lowLabel="LEFT" highLabel="RIGHT" disabled={controlsDisabled} onChange={(roll) => updateDraft({ roll })} />
                <div className="quick-actions">
                  <button type="button" disabled={controlsDisabled || !selectedDraft.targetId} onClick={faceTarget}>Face target</button>
                  <button type="button" disabled={controlsDisabled} onClick={() => updateDraft({ turn: 0, pitch: 0, roll: 0 })}>Hold orientation</button>
                </div>
              </section>

              <section className="weapon-block">
                <div className="section-heading stepped"><span><b>03</b>FORWARD CANNON</span><strong>{selectedShip.weaponDamage} DMG · {selectedShip.weaponRange} KM</strong></div>
                <label className="target-select">
                  <span>TARGET LOCK</span>
                  <select value={selectedDraft.targetId} disabled={controlsDisabled} onChange={(event) => updateDraft({ targetId: event.target.value })}>
                    {enemies.map((enemy) => <option value={enemy.id} key={enemy.id}>{enemy.name} · {Math.round(distanceBetween(selectedDraft.destination, enemy.position))} km</option>)}
                  </select>
                </label>
                <button type="button" className={`weapon-toggle ${selectedDraft.fire ? "armed" : ""}`} disabled={controlsDisabled} onClick={() => updateDraft({ fire: !selectedDraft.fire })}>
                  <i /> <span>{selectedDraft.fire ? "CANNON ARMED" : "HOLD FIRE"}</span><b>{selectedDraft.fire ? "LIVE" : "SAFE"}</b>
                </button>
                <div className={`forecast ${forecast?.valid ? "valid" : "warning"}`}>
                  <i />
                  <span>
                    <strong>{!selectedDraft.fire ? "WEAPON SAFE" : forecast?.valid ? "PROJECTED LOCK" : forecast?.inRange === false ? "OUTSIDE RANGE" : "OUTSIDE FIRING ARC"}</strong>
                    <small>{forecast ? `${forecast.distance.toFixed(1)} km if target holds position` : "No firing solution plotted"}</small>
                  </span>
                </div>
              </section>

              <button className={`stage-button ${staged.has(selectedShip.id) ? "staged" : ""}`} type="button" disabled={controlsDisabled || !destinationValid} onClick={() => setStaged((current) => new Set(current).add(selectedShip.id))}>
                <span>{!destinationValid ? "TARGET OUTSIDE MOVE RANGE" : staged.has(selectedShip.id) ? "VECTOR STAGED" : "STAGE SHIP ORDER"}</span><b>{staged.has(selectedShip.id) ? "✓" : "→"}</b>
              </button>
            </>
          ) : (
            <section className="npc-block">
              <span className="eyebrow">AUTONOMOUS COMMAND</span>
              <h2>{selectedShip.team === "enemy" ? "Hostile vector hidden" : "Orders after fleet commit"}</h2>
              <p>{selectedShip.team === "enemy" ? "Predict its maneuver from current facing, range, and exposed armour." : "Sable-3 will choose an enemy after your command vectors are staged."}</p>
            </section>
          )}

          <section className="combat-log">
            <div className="section-heading"><span>TACTICAL FEED</span><strong>LIVE</strong></div>
            <ol>
              {log.slice(0, 4).map((entry, index) => <li key={`${entry}-${index}`}><span>{String(turn).padStart(2, "0")}.{String(index + 1).padStart(2, "0")}</span><p>{entry}</p></li>)}
            </ol>
            {alliedNPC && <div className="ally-status"><i /><span>ALLIED NPC · {alliedNPC.name}</span><strong>{Math.round((alliedNPC.hull / alliedNPC.maxHull) * 100)}%</strong></div>}
          </section>
        </aside>
      </section>
    </main>
  );
}
