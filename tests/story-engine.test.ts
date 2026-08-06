import assert from "node:assert/strict";
import test from "node:test";
import {
  ELITE_SALVAGE_CHANCE,
  ELITE_SALVAGE_OPTIONS,
  SALVAGE_OPTIONS,
  STORY_ENCOUNTERS,
  STORY_GATE_COUNT,
  createFortuneMap,
  pickSalvageOptions,
  pickStoryEncounter,
  rollStoryOutcome,
  storyOutcomeWeights,
} from "../app/storyEngine.ts";

test("story campaign exposes a varied, mixed-risk encounter deck", () => {
  assert.equal(STORY_GATE_COUNT, 10);
  assert.ok(STORY_ENCOUNTERS.length >= 12);
  assert.equal(new Set(STORY_ENCOUNTERS.map((encounter) => encounter.id)).size, STORY_ENCOUNTERS.length);

  for (const encounter of STORY_ENCOUNTERS) {
    assert.equal(encounter.choices.length, 2);
    for (const choice of encounter.choices) {
      assert.equal(Object.hasOwn(choice, "riskHint"), false);
      assert.ok(choice.label.trim().length > 0);
      assert.ok(choice.description.trim().length > 0);
      assert.ok(choice.outcomes.length >= 3);
      assert.ok(choice.outcomes.some((outcome) => outcome.tone === "favourable"));
      assert.ok(choice.outcomes.some((outcome) => outcome.tone !== "favourable"));
      assert.ok(choice.outcomes.every((outcome) => outcome.effects.length > 0));
      assert.equal(choice.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0), 100);
    }
  }

  const effects = STORY_ENCOUNTERS.flatMap((encounter) => encounter.choices.flatMap((choice) => choice.outcomes.flatMap((outcome) => outcome.effects)));
  assert.deepEqual(new Set(effects.map((effect) => effect.kind)), new Set(["stat", "shield", "hull", "recruit", "threat"]));
  const stats = effects.filter((effect) => effect.kind === "stat").map((effect) => effect.stat);
  assert.ok(["weaponDamage", "weaponRange", "maxMove"].every((stat) => stats.includes(stat as typeof stats[number])));
});

test("standard salvage values are doubled and use shield terminology", () => {
  assert.deepEqual(
    SALVAGE_OPTIONS.map((option) => ({ id: option.id, rarity: option.rarity, effects: option.effects })),
    [
      { id: "cannon-capacitors", rarity: "standard", effects: [{ kind: "stat", stat: "weaponDamage", amount: 8 }] },
      { id: "rail-collimator", rarity: "standard", effects: [{ kind: "stat", stat: "weaponRange", amount: 3 }] },
      { id: "drive-actuators", rarity: "standard", effects: [{ kind: "stat", stat: "maxMove", amount: 1.5 }] },
      { id: "ablative-weave", rarity: "standard", effects: [{ kind: "shield", amount: 16 }] },
      { id: "hull-foam", rarity: "standard", effects: [{ kind: "hull", amount: 36 }] },
      {
        id: "keel-reinforcement",
        rarity: "standard",
        effects: [{ kind: "stat", stat: "maxHull", amount: 20 }, { kind: "hull", amount: 20 }],
      },
    ],
  );

  const visibleCopy = [
    ...SALVAGE_OPTIONS.flatMap((option) => [option.category, option.label, option.description, option.effectLabel]),
    ...ELITE_SALVAGE_OPTIONS.flatMap((option) => [option.category, option.label, option.description, option.effectLabel]),
    ...STORY_ENCOUNTERS.flatMap((encounter) => [
      encounter.signal,
      encounter.title,
      encounter.description,
      ...encounter.choices.flatMap((choice) => [
        choice.label,
        choice.description,
        ...choice.outcomes.flatMap((outcome) => [outcome.title, outcome.description, outcome.effectLabel]),
      ]),
    ]),
  ].join("\n");
  assert.doesNotMatch(visibleCopy, /armou?r/i);
});

test("elite salvage is unique and three times the new standard strength", () => {
  assert.equal(ELITE_SALVAGE_CHANCE, 0.12);
  assert.equal(ELITE_SALVAGE_OPTIONS.length, 9);
  assert.equal(new Set(ELITE_SALVAGE_OPTIONS.map((option) => option.id)).size, ELITE_SALVAGE_OPTIONS.length);
  assert.ok(ELITE_SALVAGE_OPTIONS.every((option) => option.rarity === "elite" && option.unique));

  assert.deepEqual(
    ELITE_SALVAGE_OPTIONS.slice(0, 6).map((option) => option.effects),
    [
      [{ kind: "stat", stat: "weaponDamage", amount: 24 }],
      [{ kind: "stat", stat: "weaponRange", amount: 9 }],
      [{ kind: "stat", stat: "maxMove", amount: 4.5 }],
      [{ kind: "shield", amount: 48 }],
      [{ kind: "hull", amount: 108 }],
      [{ kind: "stat", stat: "maxHull", amount: 60 }, { kind: "hull", amount: 60 }],
    ],
  );
  assert.deepEqual(
    ELITE_SALVAGE_OPTIONS.slice(6).map((option) => option.effects),
    [
      [{ kind: "eliteWeapon", weapon: "railgun" }],
      [{ kind: "eliteWeapon", weapon: "turret" }],
      [{ kind: "eliteWeapon", weapon: "flak" }],
    ],
  );
});

test("elite salvage obeys the chance boundary and replaces at most one standard", () => {
  const noElite = pickSalvageOptions(() => ELITE_SALVAGE_CHANCE, 3);
  assert.equal(noElite.filter((option) => option.rarity === "elite").length, 0);

  const eliteOffer = pickSalvageOptions(() => ELITE_SALVAGE_CHANCE - 0.000001, 3);
  assert.equal(eliteOffer.length, 3);
  assert.equal(new Set(eliteOffer.map((option) => option.id)).size, 3);
  assert.equal(eliteOffer.filter((option) => option.rarity === "elite").length, 1);
  assert.equal(eliteOffer.filter((option) => option.rarity === "standard").length, 2);
});

test("elite salvage exclusions prevent repeat offers", () => {
  const remainingElite = ELITE_SALVAGE_OPTIONS.at(-1);
  assert.ok(remainingElite);
  const excluded = ELITE_SALVAGE_OPTIONS.slice(0, -1).map((option) => option.id);
  const offer = pickSalvageOptions(() => 0, 3, excluded);
  assert.equal(offer.find((option) => option.rarity === "elite")?.id, remainingElite?.id);

  const exhausted = pickSalvageOptions(() => 0, 3, ELITE_SALVAGE_OPTIONS.map((option) => option.id));
  assert.ok(exhausted.every((option) => option.rarity === "standard"));
});

test("weighted outcome rolls are deterministic at their boundaries", () => {
  const choice = STORY_ENCOUNTERS[0].choices[0];
  assert.equal(rollStoryOutcome(choice, () => 0).id, choice.outcomes[0].id);
  assert.equal(rollStoryOutcome(choice, () => 0.999999).id, choice.outcomes.at(-1)?.id);
});

test("hidden per-run fortune changes which choice is statistically stronger", () => {
  const [dock, refuse] = STORY_ENCOUNTERS[0].choices;
  const favourableOdds = (choice: typeof dock, fortune: number) => {
    const weights = storyOutcomeWeights(choice, fortune);
    const favourable = choice.outcomes.reduce(
      (sum, outcome, index) => sum + (outcome.tone === "favourable" ? weights[index] : 0),
      0,
    );
    return favourable / weights.reduce((sum, weight) => sum + weight, 0);
  };

  assert.ok(favourableOdds(dock, 18) > favourableOdds(refuse, -18));
  assert.ok(favourableOdds(refuse, 18) > favourableOdds(dock, -18));
});

test("encounter draws avoid seen cards while alternatives remain", () => {
  const seen = STORY_ENCOUNTERS.slice(0, -1).map((encounter) => encounter.id);
  assert.equal(pickStoryEncounter(seen, () => 0).id, STORY_ENCOUNTERS.at(-1)?.id);
});

test("salvage draws are distinct and the hidden fortune map covers every encounter", () => {
  const salvage = pickSalvageOptions(() => 0.42, 3);
  assert.equal(salvage.length, 3);
  assert.equal(new Set(salvage.map((option) => option.id)).size, 3);
  assert.ok(salvage.every((option) => SALVAGE_OPTIONS.includes(option)));

  const fortune = createFortuneMap(() => 0);
  assert.equal(Object.keys(fortune).length, STORY_ENCOUNTERS.length);
  STORY_ENCOUNTERS.forEach((encounter) => assert.equal(fortune[encounter.id], encounter.choices[0].id));
});
