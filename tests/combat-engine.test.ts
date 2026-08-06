import assert from "node:assert/strict";
import test from "node:test";
import {
  BASE_WEAPON_HALF_ARC,
  SHIELD_FACES,
  resolveCombatTurn,
  shieldFaceForHit,
  shieldFaceForOrigin,
  shotSolutionForWeapon,
  weaponLocalOriginFor,
  weaponOriginFor,
  weaponProfilesFor,
  type CombatOrder,
  type CombatShip,
  type Shields,
} from "../app/combatEngine.ts";

const shieldsAt = (value: number): Shields => ({
  fore: value,
  aft: value,
  port: value,
  starboard: value,
  dorsal: value,
  ventral: value,
});

const makeShip = (id: string, overrides: Partial<CombatShip> = {}): CombatShip => ({
  id,
  name: id,
  team: "player",
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  shields: shieldsAt(0),
  maxShields: shieldsAt(0),
  hull: 100,
  maxHull: 100,
  weaponRange: 20,
  weaponDamage: 10,
  basicWeapon: "cannon",
  modelScale: 1,
  eliteWeapons: [],
  ...overrides,
});

const ordersFor = (entries: Array<[string, string]>): Record<string, CombatOrder> =>
  Object.fromEntries(entries.map(([shooterId, targetId]) => [shooterId, { targetId, fire: true, mode: "normal" }]));

const findShip = (ships: CombatShip[], id: string) => {
  const ship = ships.find((candidate) => candidate.id === id);
  assert.ok(ship, `expected ship ${id}`);
  return ship;
};

test("weapon mounts preserve the designed damage, range, and arc ratios", () => {
  const ship = makeShip("arsenal", {
    team: "enemy",
    weaponDamage: 12,
    weaponRange: 40,
    eliteWeapons: ["railgun", "turret", "flak", "railgun"],
  });
  const profiles = weaponProfilesFor(ship);

  assert.deepEqual(profiles.map((profile) => profile.kind), ["main", "railgun", "turret", "flak"]);
  assert.deepEqual(
    profiles.map(({ damage, range, halfArc }) => [damage, range, halfArc]),
    [
      [12, 40, BASE_WEAPON_HALF_ARC],
      [12, 120, BASE_WEAPON_HALF_ARC * 0.3],
      [12, 30, 180],
      [60, 12, BASE_WEAPON_HALF_ARC],
    ],
  );
  assert.equal(profiles[0].color, "#ff5f7b");
});

test("ship basic-weapon kinds can change a hull's primary battery", () => {
  const pulse = weaponProfilesFor(makeShip("pulse", { basicWeapon: "pulse" }))[0];
  const torpedo = weaponProfilesFor(makeShip("torpedo", { basicWeapon: "torpedo" }))[0];

  assert.deepEqual(
    [pulse.name, pulse.damage, pulse.range, pulse.halfArc],
    ["Pulse repeater", 7, 17, 48],
  );
  assert.deepEqual(
    [torpedo.name, torpedo.damage, torpedo.range, torpedo.halfArc],
    ["Torpedo rack", 16, 27, 14],
  );
});

test("weapon origins follow per-hull visual scale", () => {
  const ship = makeShip("scaled", { modelScale: 2, eliteWeapons: ["turret"] });
  const [main, turret] = weaponProfilesFor(ship);

  assert.deepEqual(weaponLocalOriginFor(ship, main).toArray(), [0, 0, -2.96]);
  assert.deepEqual(weaponLocalOriginFor(ship, turret).toArray(), [0, 1.24, 0]);
  assert.deepEqual(weaponOriginFor(ship, main).toArray(), [0, 0, -2.96]);
});

test("focus fire queues two complete salvos with unique deterministic events", () => {
  const attacker = makeShip("focus", { eliteWeapons: ["railgun", "turret", "flak"] });
  const target = makeShip("target", { team: "enemy", position: [0, 0, -7], hull: 300, maxHull: 300 });
  const result = resolveCombatTurn([attacker, target], {
    [attacker.id]: { targetId: target.id, fire: false, mode: "focus-fire" },
  });

  assert.equal(result.shots.length, 8);
  assert.deepEqual(result.shots.map((shot) => shot.salvoIndex), [0, 0, 0, 0, 1, 1, 1, 1]);
  assert.deepEqual(result.shots.map((shot) => shot.mountIndex), [0, 1, 2, 3, 0, 1, 2, 3]);
  assert.equal(new Set(result.shots.map((shot) => shot.id)).size, 8);
  assert.equal(findShip(result.ships, target.id).hull, 140);
});

test("extra move forces weapons safe even when a stale order says fire", () => {
  const attacker = makeShip("sprinting");
  const target = makeShip("target", { team: "enemy", position: [0, 0, -8] });
  const result = resolveCombatTurn([attacker, target], {
    [attacker.id]: { targetId: target.id, fire: true, mode: "extra-move" },
  });

  assert.equal(result.shots.length, 0);
  assert.equal(findShip(result.ships, target.id).hull, 100);
});

test("both focus-fire salvos remain committed after the first destroys the target", () => {
  const attacker = makeShip("focus", { weaponDamage: 120 });
  const target = makeShip("target", { team: "enemy", position: [0, 0, -8] });
  const result = resolveCombatTurn([attacker, target], {
    [attacker.id]: { targetId: target.id, fire: true, mode: "focus-fire" },
  });

  assert.equal(result.shots.length, 2);
  assert.equal(result.shots.filter((shot) => shot.destroyed).length, 1);
  assert.equal(result.shots[0].destroyed, true);
  assert.equal(result.shots[1].destroyed, false);
});

test("zero-distance targets are safe and count as inside the firing arc", () => {
  const shooter = makeShip("shooter");
  const weapon = weaponProfilesFor(shooter)[0];
  const origin = weaponOriginFor(shooter, weapon);
  const target = makeShip("target", { position: [origin.x, origin.y, origin.z], team: "enemy" });
  const solution = shotSolutionForWeapon(shooter, target, weapon);

  assert.equal(solution.distance, 0);
  assert.equal(solution.inRange, true);
  assert.equal(solution.inArc, true);
  assert.equal(solution.valid, true);

  const result = resolveCombatTurn([shooter, target], ordersFor([[shooter.id, target.id]]));
  assert.equal(result.shots[0].valid, true);
  assert.equal(result.shots[0].face, "fore");
});

test("shield facings are selected from the exact weapon origin", () => {
  const target = makeShip("target", { team: "enemy" });
  const attacker = makeShip("attacker", {
    position: [0, -0.2, 0],
    eliteWeapons: ["turret"],
  });
  const turret = weaponProfilesFor(attacker).find((weapon) => weapon.kind === "turret");
  assert.ok(turret);

  assert.equal(shieldFaceForOrigin(target, attacker.position), "ventral");
  assert.equal(shieldFaceForHit(target, attacker, turret), "dorsal");

  const result = resolveCombatTurn([attacker, target], ordersFor([[attacker.id, target.id]]));
  const turretShot = result.shots.find((shot) => shot.weapon.kind === "turret");
  assert.ok(turretShot);
  assert.equal(turretShot.valid, true);
  assert.equal(turretShot.face, "dorsal");
});

test("shield damage overflows to hull and struck versus clear faces regenerate once", () => {
  const shooter = makeShip("shooter", { weaponDamage: 25 });
  const target = makeShip("target", {
    team: "enemy",
    position: [0, 0, -10],
    shields: shieldsAt(20),
    maxShields: shieldsAt(30),
  });
  const result = resolveCombatTurn([shooter, target], ordersFor([[shooter.id, target.id]]));
  const shot = result.shots[0];
  const resolvedTarget = findShip(result.ships, target.id);

  assert.equal(shot.face, "aft");
  assert.equal(shot.shieldBefore, 20);
  assert.equal(shot.shieldAfter, 0);
  assert.equal(shot.hullBefore, 100);
  assert.equal(shot.hullAfter, 95);
  assert.equal(resolvedTarget.hull, 95);
  assert.equal(resolvedTarget.shields.aft, 5);
  SHIELD_FACES.filter((face) => face !== "aft").forEach((face) => {
    assert.equal(resolvedTarget.shields[face], 30);
  });
});

test("shield regeneration cannot exceed each face's maximum", () => {
  const shooter = makeShip("shooter", { weaponDamage: 1 });
  const target = makeShip("target", {
    team: "enemy",
    position: [0, 0, -10],
    shields: shieldsAt(29),
    maxShields: shieldsAt(30),
  });
  const result = resolveCombatTurn([shooter, target], ordersFor([[shooter.id, target.id]]));
  const resolvedTarget = findShip(result.ships, target.id);

  assert.equal(result.shots[0].shieldAfter, 28);
  SHIELD_FACES.forEach((face) => assert.equal(resolvedTarget.shields[face], 30));
});

test("range and arc misses do no damage and count every shield face as clear", () => {
  const rangeShooter = makeShip("range-shooter", { weaponRange: 5 });
  const rangeTarget = makeShip("range-target", {
    team: "enemy",
    position: [0, 0, -20],
    shields: shieldsAt(2),
    maxShields: shieldsAt(20),
  });
  const rangeResult = resolveCombatTurn(
    [rangeShooter, rangeTarget],
    ordersFor([[rangeShooter.id, rangeTarget.id]]),
  );
  assert.equal(rangeResult.shots[0].valid, false);
  assert.equal(rangeResult.shots[0].missReason, "range");
  assert.equal(findShip(rangeResult.ships, rangeTarget.id).hull, 100);
  SHIELD_FACES.forEach((face) => assert.equal(findShip(rangeResult.ships, rangeTarget.id).shields[face], 12));

  const arcShooter = makeShip("arc-shooter", { weaponRange: 20 });
  const arcTarget = makeShip("arc-target", { team: "enemy", position: [0, 0, 5] });
  const arcResult = resolveCombatTurn([arcShooter, arcTarget], ordersFor([[arcShooter.id, arcTarget.id]]));
  assert.equal(arcResult.shots[0].valid, false);
  assert.equal(arcResult.shots[0].missReason, "arc");
  assert.equal(findShip(arcResult.ships, arcTarget.id).hull, 100);
});

test("dead shooters, dead starting targets, and missing targets never enter the volley", () => {
  const deadShooter = makeShip("dead-shooter", { hull: 0 });
  const liveShooter = makeShip("live-shooter");
  const deadTarget = makeShip("dead-target", { hull: 0, team: "enemy" });
  const liveTarget = makeShip("live-target", { team: "enemy", position: [0, 0, -5] });
  const result = resolveCombatTurn(
    [deadShooter, liveShooter, deadTarget, liveTarget],
    {
      [deadShooter.id]: { targetId: liveTarget.id, fire: true, mode: "normal" },
      [liveShooter.id]: { targetId: deadTarget.id, fire: true, mode: "normal" },
      [liveTarget.id]: { targetId: "missing", fire: true, mode: "normal" },
    },
  );

  assert.equal(result.shots.length, 0);
});

test("a ship destroyed before its weapon activation does not fire", () => {
  const player = makeShip("player", {
    hull: 10,
    maxHull: 10,
    weaponDamage: 20,
  });
  const enemy = makeShip("enemy", {
    team: "enemy",
    position: [0, 0, -5],
    rotation: [0, 180, 0],
    hull: 10,
    maxHull: 10,
    weaponDamage: 20,
  });
  const result = resolveCombatTurn(
    [player, enemy],
    ordersFor([[enemy.id, player.id], [player.id, enemy.id]]),
  );

  assert.deepEqual(result.shots.map((shot) => shot.shooterId), [player.id]);
  assert.equal(result.shots[0].valid, true);
  assert.equal(result.shots[0].destroyed, true);
  assert.equal(findShip(result.ships, player.id).hull, 10);
  assert.equal(findShip(result.ships, enemy.id).hull, 0);
  assert.deepEqual(result.destroyedIds, [enemy.id]);
  assert.ok(result.outcomes.some((outcome) => outcome.includes("destroyed before weapon activation")));
});

test("a later destroyed ship loses every queued mount and salvo", () => {
  const player = makeShip("player", {
    hull: 100,
    maxHull: 100,
    weaponDamage: 100,
  });
  const enemy = makeShip("enemy", {
    team: "enemy",
    position: [0, 0, -5],
    rotation: [0, 180, 0],
    hull: 10,
    maxHull: 10,
    weaponDamage: 4,
    eliteWeapons: ["railgun", "turret", "flak"],
  });
  const result = resolveCombatTurn(
    [player, enemy],
    {
      [enemy.id]: { targetId: player.id, fire: true, mode: "focus-fire" },
      [player.id]: { targetId: enemy.id, fire: true, mode: "normal" },
    },
  );
  const enemyShots = result.shots.filter((shot) => shot.shooterId === enemy.id);

  assert.equal(result.shots[0].shooterId, player.id);
  assert.equal(result.shots[0].destroyed, true);
  assert.equal(enemyShots.length, 0);
  assert.equal(findShip(result.ships, player.id).hull, 100);
});

test("a living ship wastes its activation when an earlier ship destroys its assigned target", () => {
  const killer = makeShip("killer", { weaponDamage: 20 });
  const follower = makeShip("follower", { position: [1, 0, 0] });
  const laterShooter = makeShip("later-shooter", { position: [-1, 0, 0] });
  const target = makeShip("target", {
    team: "enemy",
    position: [0, 0, -5],
    hull: 10,
    maxHull: 10,
  });
  const secondTarget = makeShip("second-target", { team: "enemy", position: [0, 0, -6] });
  const result = resolveCombatTurn(
    [killer, follower, laterShooter, target, secondTarget],
    ordersFor([[killer.id, target.id], [follower.id, target.id], [laterShooter.id, secondTarget.id]]),
  );

  assert.deepEqual(result.shots.map((shot) => shot.shooterId), [killer.id, laterShooter.id]);
  assert.deepEqual(result.shots.map((shot) => shot.sequence), [0, 1]);
  assert.equal(findShip(result.ships, target.id).hull, 0);
  assert.ok(result.outcomes.some((outcome) => outcome.includes("assigned target already destroyed")));
});

test("multiple mounts produce one event each and exactly one fatal event per target", () => {
  const attacker = makeShip("attacker", {
    weaponDamage: 10,
    eliteWeapons: ["railgun", "turret", "flak"],
  });
  const target = makeShip("target", {
    team: "enemy",
    position: [0, 0, -5],
    hull: 5,
    maxHull: 5,
  });
  const result = resolveCombatTurn([attacker, target], ordersFor([[attacker.id, target.id]]));

  assert.equal(result.shots.length, 4);
  assert.ok(result.shots.every((shot) => shot.valid));
  assert.equal(new Set(result.shots.map((shot) => shot.id)).size, 4);
  assert.deepEqual(result.shots.map((shot) => shot.mountIndex), [0, 1, 2, 3]);
  assert.deepEqual(result.shots.map((shot) => shot.sequence), [0, 1, 2, 3]);
  assert.equal(result.shots.filter((shot) => shot.destroyed).length, 1);
  assert.deepEqual(result.destroyedIds, [target.id]);
});

test("volley order and event snapshots do not depend on order-object insertion order", () => {
  const playerTwo = makeShip("player-two");
  const enemy = makeShip("enemy", {
    team: "enemy",
    position: [0, 0, -5],
    rotation: [0, 180, 0],
    hull: 1_000,
    maxHull: 1_000,
  });
  const playerOne = makeShip("player-one");
  const ships = [playerTwo, enemy, playerOne];
  const snapshot = structuredClone(ships);
  const first = resolveCombatTurn(
    ships,
    ordersFor([[enemy.id, playerOne.id], [playerOne.id, enemy.id], [playerTwo.id, enemy.id]]),
  );
  const second = resolveCombatTurn(
    ships,
    ordersFor([[playerTwo.id, enemy.id], [enemy.id, playerOne.id], [playerOne.id, enemy.id]]),
  );

  assert.deepEqual(first, second);
  assert.deepEqual(first.shots.map((shot) => shot.shooterId), [playerTwo.id, playerOne.id, enemy.id]);
  assert.deepEqual(ships, snapshot, "the pure resolver must not mutate source ships");
});
