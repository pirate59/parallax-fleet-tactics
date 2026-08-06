import assert from "node:assert/strict";
import test from "node:test";
import {
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
      assert.ok(choice.outcomes.length >= 3);
      assert.ok(choice.outcomes.some((outcome) => outcome.tone === "favourable"));
      assert.ok(choice.outcomes.some((outcome) => outcome.tone !== "favourable"));
      assert.ok(choice.outcomes.every((outcome) => outcome.effects.length > 0));
      assert.equal(choice.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0), 100);
    }
  }

  const effects = STORY_ENCOUNTERS.flatMap((encounter) => encounter.choices.flatMap((choice) => choice.outcomes.flatMap((outcome) => outcome.effects)));
  assert.deepEqual(new Set(effects.map((effect) => effect.kind)), new Set(["stat", "armour", "hull", "recruit", "threat"]));
  const stats = effects.filter((effect) => effect.kind === "stat").map((effect) => effect.stat);
  assert.ok(["weaponDamage", "weaponRange", "maxMove"].every((stat) => stats.includes(stat as typeof stats[number])));
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
