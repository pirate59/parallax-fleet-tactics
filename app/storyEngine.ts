import type { EliteWeaponKind } from "./shipCatalog";

export type StoryStat = "weaponDamage" | "weaponRange" | "maxMove" | "maxHull";

export type StoryEffect =
  | { kind: "stat"; stat: StoryStat; amount: number }
  | { kind: "shield"; amount: number }
  | { kind: "hull"; amount: number }
  | { kind: "recruit"; ship: "scout" | "escort" | "gunboat" }
  | { kind: "threat"; threat: "retrieval" | "patrol" | "hunter"; delay: number }
  | { kind: "eliteWeapon"; weapon: EliteWeaponKind };

export type StoryOutcomeTone = "favourable" | "costly" | "danger";

export type StoryOutcome = {
  id: string;
  title: string;
  description: string;
  effectLabel: string;
  tone: StoryOutcomeTone;
  weight: number;
  effects: StoryEffect[];
};

export type StoryChoice = {
  id: string;
  label: string;
  description: string;
  outcomes: StoryOutcome[];
};

export type StoryEncounter = {
  id: string;
  signal: string;
  title: string;
  description: string;
  choices: [StoryChoice, StoryChoice];
};

export type SalvageOption = {
  id: string;
  category: string;
  label: string;
  description: string;
  effectLabel: string;
  rarity: "standard" | "elite";
  unique?: boolean;
  effects: StoryEffect[];
};

export const STORY_GATE_COUNT = 10;
export const ELITE_SALVAGE_CHANCE = 0.12;

export const SALVAGE_OPTIONS: SalvageOption[] = [
  {
    id: "cannon-capacitors",
    category: "WEAPONS",
    label: "Cannon capacitors",
    description: "Rewire a captured discharge bank into the forward cannon.",
    effectLabel: "+8 gun damage",
    rarity: "standard",
    effects: [{ kind: "stat", stat: "weaponDamage", amount: 8 }],
  },
  {
    id: "rail-collimator",
    category: "WEAPONS",
    label: "Rail collimator",
    description: "Extend the coherent firing solution before the beam disperses.",
    effectLabel: "+3 km gun range",
    rarity: "standard",
    effects: [{ kind: "stat", stat: "weaponRange", amount: 3 }],
  },
  {
    id: "drive-actuators",
    category: "MOVEMENT",
    label: "Drive actuators",
    description: "Fit lighter gimbal assemblies taken from a raider engine bank.",
    effectLabel: "+1.5 km movement",
    rarity: "standard",
    effects: [{ kind: "stat", stat: "maxMove", amount: 1.5 }],
  },
  {
    id: "ablative-weave",
    category: "DEFENCE",
    label: "Ablative shield weave",
    description: "Tune recovered field emitters across every shield facing.",
    effectLabel: "+16 all shields",
    rarity: "standard",
    effects: [{ kind: "shield", amount: 16 }],
  },
  {
    id: "hull-foam",
    category: "REPAIR",
    label: "Reactive hull foam",
    description: "Seal fractures and brace the stolen ship for the next gate.",
    effectLabel: "+36 hull repair",
    rarity: "standard",
    effects: [{ kind: "hull", amount: 36 }],
  },
  {
    id: "keel-reinforcement",
    category: "DEFENCE",
    label: "Keel reinforcement",
    description: "Weld a corsair spine section into the primary hull frame.",
    effectLabel: "+20 max hull and repair",
    rarity: "standard",
    effects: [
      { kind: "stat", stat: "maxHull", amount: 20 },
      { kind: "hull", amount: 20 },
    ],
  },
];

export const ELITE_SALVAGE_OPTIONS: SalvageOption[] = [
  {
    id: "elite-cannon-capacitors",
    category: "ELITE WEAPONS",
    label: "Siege cannon capacitors",
    description: "Route an intact capital-grade discharge bank through the forward cannon.",
    effectLabel: "+24 gun damage",
    rarity: "elite",
    unique: true,
    effects: [{ kind: "stat", stat: "weaponDamage", amount: 24 }],
  },
  {
    id: "elite-rail-collimator",
    category: "ELITE WEAPONS",
    label: "Event-horizon collimator",
    description: "Install a prototype lens that holds the firing solution far beyond fleet tolerances.",
    effectLabel: "+9 km gun range",
    rarity: "elite",
    unique: true,
    effects: [{ kind: "stat", stat: "weaponRange", amount: 9 }],
  },
  {
    id: "elite-drive-actuators",
    category: "ELITE MOVEMENT",
    label: "Inertial ghost drive",
    description: "Fit phase-synced actuators that move before their drive flare resolves.",
    effectLabel: "+4.5 km movement",
    rarity: "elite",
    unique: true,
    effects: [{ kind: "stat", stat: "maxMove", amount: 4.5 }],
  },
  {
    id: "elite-shield-weave",
    category: "ELITE DEFENCE",
    label: "Citadel shield weave",
    description: "Bind a fortress-grade field lattice into every shield facing.",
    effectLabel: "+48 all shields",
    rarity: "elite",
    unique: true,
    effects: [{ kind: "shield", amount: 48 }],
  },
  {
    id: "elite-hull-foam",
    category: "ELITE REPAIR",
    label: "Lazarus repair cloud",
    description: "Release a sealed reconstruction swarm through every damaged compartment.",
    effectLabel: "+108 hull repair",
    rarity: "elite",
    unique: true,
    effects: [{ kind: "hull", amount: 108 }],
  },
  {
    id: "elite-keel-reinforcement",
    category: "ELITE DEFENCE",
    label: "Titan keel",
    description: "Integrate a dreadnought spine section into the stolen ship's primary frame.",
    effectLabel: "+60 max hull and repair",
    rarity: "elite",
    unique: true,
    effects: [
      { kind: "stat", stat: "maxHull", amount: 60 },
      { kind: "hull", amount: 60 },
    ],
  },
  {
    id: "elite-railgun",
    category: "ELITE WEAPON",
    label: "Needlepoint rail gun",
    description: "Add a narrow-aperture spinal mount for extreme-range firing solutions.",
    effectLabel: "Rail gun · 3× range · 0.3× firing arc",
    rarity: "elite",
    unique: true,
    effects: [{ kind: "eliteWeapon", weapon: "railgun" }],
  },
  {
    id: "elite-turret",
    category: "ELITE WEAPON",
    label: "Omnidirectional turret",
    description: "Add a tracking mount able to fire through a complete spherical arc.",
    effectLabel: "Turret · 0.75× range · 360° firing arc",
    rarity: "elite",
    unique: true,
    effects: [{ kind: "eliteWeapon", weapon: "turret" }],
  },
  {
    id: "elite-flak",
    category: "ELITE WEAPON",
    label: "Breach flak cannon",
    description: "Add a brutal close-range mount loaded with overmass penetrator clouds.",
    effectLabel: "Flak cannon · 5× damage · 0.3× range",
    rarity: "elite",
    unique: true,
    effects: [{ kind: "eliteWeapon", weapon: "flak" }],
  },
];

export const STORY_ENCOUNTERS: StoryEncounter[] = [
  {
    id: "distress-call",
    signal: "CIVILIAN DISTRESS · CHANNEL 04",
    title: "A ship in distress",
    description: "A scarred courier tumbles beside the gate, broadcasting a failing life-support warning. Its crew asks to dock before the patrol arrives.",
    choices: [
      {
        id: "dock-help",
        label: "Dock and render aid",
        description: "Open the stolen ship to strangers and share your dwindling repair stores.",
        outcomes: [
          { id: "courier-joins", title: "A debt repaid", description: "The courier captain refuses to be left behind and brings their nimble ship under your command.", effectLabel: "Scout joins the squad", tone: "favourable", weight: 24, effects: [{ kind: "recruit", ship: "scout" }] },
          { id: "courier-repairs", title: "Field engineers", description: "The survivors seal several hull fractures before casting off toward a safer lane.", effectLabel: "+16 hull repair", tone: "favourable", weight: 46, effects: [{ kind: "hull", amount: 16 }] },
          { id: "courier-theft", title: "Airlock betrayal", description: "The distress call was bait. The boarders escape with targeting hardware before you can reseal the dock.", effectLabel: "−1.5 km range · −3 damage", tone: "danger", weight: 30, effects: [{ kind: "stat", stat: "weaponRange", amount: -1.5 }, { kind: "stat", stat: "weaponDamage", amount: -3 }] },
        ],
      },
      {
        id: "strip-wreck",
        label: "Refuse and strip the wreck",
        description: "Keep the airlocks sealed and take whatever can be recovered at range.",
        outcomes: [
          { id: "courier-coils", title: "Smuggler coils", description: "A concealed weapons crate contains pristine accelerator coils.", effectLabel: "+4 gun damage", tone: "favourable", weight: 44, effects: [{ kind: "stat", stat: "weaponDamage", amount: 4 }] },
          { id: "courier-explosion", title: "Reactor flash", description: "The wreck breaks apart as the tractor beam bites, hammering your bow with debris.", effectLabel: "−18 hull", tone: "danger", weight: 31, effects: [{ kind: "hull", amount: -18 }] },
          { id: "courier-search", title: "Unanswered registry", description: "The courier's transponder keeps calling home. Someone will eventually follow it here.", effectLabel: "Retrieval ship in a future gate", tone: "costly", weight: 25, effects: [{ kind: "threat", threat: "retrieval", delay: 2 }] },
        ],
      },
    ],
  },
  {
    id: "customs-relay",
    signal: "AUTHORITY NODE · AUTOMATED CHALLENGE",
    title: "Silent customs relay",
    description: "A dormant customs lattice wakes and requests the clearance codes belonging to the ship you stole.",
    choices: [
      {
        id: "transmit-codes",
        label: "Transmit the stolen codes",
        description: "Risk the old credentials and let the relay inspect your drive signature.",
        outcomes: [
          { id: "relay-route", title: "Priority corridor", description: "The codes still hold. The relay uploads a military-grade route through the next fold.", effectLabel: "+0.75 km movement", tone: "favourable", weight: 44, effects: [{ kind: "stat", stat: "maxMove", amount: 0.75 }] },
          { id: "relay-calibration", title: "Range tables", description: "A forgotten maintenance packet sharpens your long-range solution.", effectLabel: "+1.5 km gun range", tone: "favourable", weight: 30, effects: [{ kind: "stat", stat: "weaponRange", amount: 1.5 }] },
          { id: "relay-trace", title: "Credential revoked", description: "The system recognizes its stolen hull and quietly forwards your vector to customs enforcement.", effectLabel: "Patrol intercept in a future gate", tone: "danger", weight: 26, effects: [{ kind: "threat", threat: "patrol", delay: 1 }] },
        ],
      },
      {
        id: "destroy-relay",
        label: "Destroy the relay",
        description: "Erase the checkpoint before it can finish its challenge-response cycle.",
        outcomes: [
          { id: "relay-plating", title: "Authority shield bank", description: "The shattered node yields dense field capacitors rated for military debris fields.", effectLabel: "+9 all shields", tone: "favourable", weight: 43, effects: [{ kind: "shield", amount: 9 }] },
          { id: "relay-power", title: "Charged emitter", description: "Its defence capacitor slots neatly into the cannon bus.", effectLabel: "+4 gun damage", tone: "favourable", weight: 27, effects: [{ kind: "stat", stat: "weaponDamage", amount: 4 }] },
          { id: "relay-charge", title: "Failsafe detonation", description: "An anti-tamper charge fires through the tractor line and scorches the keel.", effectLabel: "−17 hull", tone: "danger", weight: 30, effects: [{ kind: "hull", amount: -17 }] },
        ],
      },
    ],
  },
  {
    id: "cryo-lifeboat",
    signal: "LIFEBOAT · CRYOGENIC POWER LOW",
    title: "The cold lifeboat",
    description: "A century-old lifeboat drifts out of the gate wake. Six cryogenic capsules remain powered; its navigation core is still warm.",
    choices: [
      {
        id: "thaw-occupants",
        label: "Thaw the occupants",
        description: "Spend power and trust whoever wakes inside the sealed craft.",
        outcomes: [
          { id: "cryo-escort", title: "Veteran watch", description: "The sleeper in the command capsule is a patrol officer with a hidden escort craft keyed to their biometrics.", effectLabel: "Escort joins the squad", tone: "favourable", weight: 22, effects: [{ kind: "recruit", ship: "escort" }] },
          { id: "cryo-repair", title: "Damage-control crew", description: "The revived engineers repay the rescue by sealing your most dangerous breaches.", effectLabel: "+17 hull repair", tone: "favourable", weight: 48, effects: [{ kind: "hull", amount: 17 }] },
          { id: "cryo-panic", title: "Wake shock", description: "A terrified sleeper fires a cutting lance through the shield emitters before being subdued.", effectLabel: "−10 all shields", tone: "danger", weight: 30, effects: [{ kind: "shield", amount: -10 }] },
        ],
      },
      {
        id: "drain-cells",
        label: "Drain the power cells",
        description: "Leave the capsules sealed and take the reserve power for your escape.",
        outcomes: [
          { id: "cryo-range", title: "Clean reserve cells", description: "The stable cells extend cannon coherence far beyond factory tolerances.", effectLabel: "+1.5 km gun range", tone: "favourable", weight: 46, effects: [{ kind: "stat", stat: "weaponRange", amount: 1.5 }] },
          { id: "cryo-corrosion", title: "Contaminated coolant", description: "Ancient coolant eats through a drive actuator before you can vent it.", effectLabel: "−0.75 km movement", tone: "danger", weight: 29, effects: [{ kind: "stat", stat: "maxMove", amount: -0.75 }] },
          { id: "cryo-beacon", title: "Funeral beacon", description: "Cutting power activates a final distress burst carrying your ship's signature.", effectLabel: "Hunter in a future gate", tone: "costly", weight: 25, effects: [{ kind: "threat", threat: "hunter", delay: 2 }] },
        ],
      },
    ],
  },
  {
    id: "gunship-ai",
    signal: "DERELICT WARSHIP · CORE RESPONSE",
    title: "The sleeping gunship",
    description: "A decommissioned gunship rotates in the gate's shadow. Its combat intelligence answers in fragments and asks for a captain.",
    choices: [
      {
        id: "reboot-ai",
        label: "Reboot the combat AI",
        description: "Restore the intelligence and hope its last allegiance has decayed.",
        outcomes: [
          { id: "ai-joins", title: "Command accepted", description: "The intelligence marks your stolen ship as fleet command and falls into formation.", effectLabel: "Gunboat joins the squad", tone: "favourable", weight: 21, effects: [{ kind: "recruit", ship: "gunboat" }] },
          { id: "ai-tuning", title: "Machine precision", description: "The AI refuses to leave but transmits a ruthless firing calibration.", effectLabel: "+5 gun damage", tone: "favourable", weight: 46, effects: [{ kind: "stat", stat: "weaponDamage", amount: 5 }] },
          { id: "ai-defence", title: "Intruder protocol", description: "The gunship wakes just long enough to fire a point-blank warning salvo.", effectLabel: "−20 hull", tone: "danger", weight: 33, effects: [{ kind: "hull", amount: -20 }] },
        ],
      },
      {
        id: "extract-core",
        label: "Extract its targeting core",
        description: "Keep the intelligence asleep and cut out the hardware you need.",
        outcomes: [
          { id: "core-damage", title: "Predictive targeting", description: "The intact core anticipates target drift and tightens every burst.", effectLabel: "+5 gun damage", tone: "favourable", weight: 45, effects: [{ kind: "stat", stat: "weaponDamage", amount: 5 }] },
          { id: "core-damaged", title: "Corrupt geometry", description: "The core installs cleanly, then collapses the long-range solution table.", effectLabel: "−1.5 km gun range", tone: "danger", weight: 29, effects: [{ kind: "stat", stat: "weaponRange", amount: -1.5 }] },
          { id: "core-hunter", title: "Remote awakening", description: "The empty gunship silently uploads your theft to another machine in the network.", effectLabel: "AI hunter in a future gate", tone: "costly", weight: 26, effects: [{ kind: "threat", threat: "hunter", delay: 1 }] },
        ],
      },
    ],
  },
  {
    id: "salvager-shrine",
    signal: "SALVAGER CLAN · RITUAL CHANNEL",
    title: "The iron shrine",
    description: "A family of shielded salvagers guards a field of fresh wrecks. They offer safe passage if you honour an unfamiliar trade ritual.",
    choices: [
      {
        id: "honour-ritual",
        label: "Honour the trade ritual",
        description: "Power down the cannon and exchange parts under their rules.",
        outcomes: [
          { id: "shrine-shield", title: "Clan-forged screen", description: "The salvagers tune layered shield projectors while singing the names of their previous owners.", effectLabel: "+10 all shields", tone: "favourable", weight: 43, effects: [{ kind: "shield", amount: 10 }] },
          { id: "shrine-repair", title: "Honest mechanics", description: "Their crew restores pressure to compartments you had written off.", effectLabel: "+18 hull repair", tone: "favourable", weight: 31, effects: [{ kind: "hull", amount: 18 }] },
          { id: "shrine-fraud", title: "Painted scrap", description: "The replacement cannon couplings shear as soon as the salvagers jump away.", effectLabel: "−4 gun damage", tone: "danger", weight: 26, effects: [{ kind: "stat", stat: "weaponDamage", amount: -4 }] },
        ],
      },
      {
        id: "take-by-force",
        label: "Claim the field by force",
        description: "Charge the cannon and make the salvagers abandon their claim.",
        outcomes: [
          { id: "shrine-weapons", title: "Prime salvage", description: "The clan flees before you fire, leaving a tuned accelerator assembly behind.", effectLabel: "+5 gun damage", tone: "favourable", weight: 41, effects: [{ kind: "stat", stat: "weaponDamage", amount: 5 }] },
          { id: "shrine-drive", title: "Racing thrusters", description: "A stripped courier drive makes the stolen ship faster than its registry claims.", effectLabel: "+0.75 km movement", tone: "favourable", weight: 31, effects: [{ kind: "stat", stat: "maxMove", amount: 0.75 }] },
          { id: "shrine-reprisal", title: "Clan mark", description: "The salvagers withdraw, but a guild bounty appears on your transponder before they vanish.", effectLabel: "Retrieval ship in a future gate", tone: "danger", weight: 28, effects: [{ kind: "threat", threat: "retrieval", delay: 2 }] },
        ],
      },
    ],
  },
  {
    id: "dimensional-echo",
    signal: "PARALLAX ANOMALY · MATCHING SIGNATURE",
    title: "A ship like yours",
    description: "A duplicate of your stolen ship emerges half a second ahead of your sensors, scarred by battles you have not fought.",
    choices: [
      {
        id: "follow-echo",
        label: "Follow the duplicate",
        description: "Mirror its vector through the anomaly and trust the path it survived.",
        outcomes: [
          { id: "echo-drive", title: "Future maneuver", description: "You copy a drive sequence your own systems had never calculated.", effectLabel: "+0.75 km movement", tone: "favourable", weight: 43, effects: [{ kind: "stat", stat: "maxMove", amount: 0.75 }] },
          { id: "echo-range", title: "Impossible telemetry", description: "The duplicate leaves behind firing data measured from the other side of the gate.", effectLabel: "+1.5 km gun range", tone: "favourable", weight: 31, effects: [{ kind: "stat", stat: "weaponRange", amount: 1.5 }] },
          { id: "echo-shear", title: "Hull out of phase", description: "The route closes through your engineering deck and tears matter from the keel.", effectLabel: "−19 hull", tone: "danger", weight: 26, effects: [{ kind: "hull", amount: -19 }] },
        ],
      },
      {
        id: "fire-echo",
        label: "Fire on the duplicate",
        description: "Refuse the paradox and destroy it before it can replace you.",
        outcomes: [
          { id: "echo-resonance", title: "Resonant cannon", description: "The shot returns as clean harmonic data that amplifies the next discharge.", effectLabel: "+5 gun damage", tone: "favourable", weight: 44, effects: [{ kind: "stat", stat: "weaponDamage", amount: 5 }] },
          { id: "echo-reflection", title: "Same firing solution", description: "The duplicate fires at the same instant, collapsing shields across every exposed surface.", effectLabel: "−11 all shields", tone: "danger", weight: 31, effects: [{ kind: "shield", amount: -11 }] },
          { id: "echo-return", title: "Unclosed loop", description: "The target vanishes, but its signature continues to follow one gate behind.", effectLabel: "Echo hunter in a future gate", tone: "costly", weight: 25, effects: [{ kind: "threat", threat: "hunter", delay: 1 }] },
        ],
      },
    ],
  },
  {
    id: "refugee-cutter",
    signal: "REFUGEE CUTTER · PURSUIT WARNING",
    title: "Passengers without a flag",
    description: "An overloaded cutter begs for a route through the gate. Its pursuers are close enough to distort the edge of your scope.",
    choices: [
      {
        id: "escort-cutter",
        label: "Escort the cutter",
        description: "Slow your escape long enough to hide the refugees in your wake.",
        outcomes: [
          { id: "cutter-scout", title: "Volunteer wing", description: "A refugee pilot launches their armed scout and pledges it to your escape.", effectLabel: "Scout joins the squad", tone: "favourable", weight: 23, effects: [{ kind: "recruit", ship: "scout" }] },
          { id: "cutter-shield", title: "Cargo shield cells", description: "The cutter transfers reserve field capacitors it can no longer carry safely.", effectLabel: "+9 all shields", tone: "favourable", weight: 48, effects: [{ kind: "shield", amount: 9 }] },
          { id: "cutter-pursuit", title: "Shared wake", description: "You hide the cutter, but its pursuers lock onto your drive flare instead.", effectLabel: "Patrol intercept in a future gate", tone: "danger", weight: 29, effects: [{ kind: "threat", threat: "patrol", delay: 1 }] },
        ],
      },
      {
        id: "send-away",
        label: "Send them another route",
        description: "Share coordinates, then jump before the pursuers can resolve your hull.",
        outcomes: [
          { id: "cutter-supplies", title: "Parting stores", description: "The refugees transfer sealant and medicine before turning away.", effectLabel: "+16 hull repair", tone: "favourable", weight: 44, effects: [{ kind: "hull", amount: 16 }] },
          { id: "cutter-false-route", title: "Bad ephemeris", description: "Their route packet carries a corrupt drive model that damages your gimbals.", effectLabel: "−0.75 km movement", tone: "danger", weight: 31, effects: [{ kind: "stat", stat: "maxMove", amount: -0.75 }] },
          { id: "cutter-identified", title: "A name traded for safety", description: "The cutter bargains with its pursuers by identifying the stolen ship that refused them.", effectLabel: "Hunter in a future gate", tone: "costly", weight: 25, effects: [{ kind: "threat", threat: "hunter", delay: 2 }] },
        ],
      },
    ],
  },
  {
    id: "weapons-cache",
    signal: "ORDNANCE PODS · NO OWNER RESPONSE",
    title: "Unstable weapons cache",
    description: "Mag-locked ordnance crates orbit a shattered carrier. Their thermal readings climb every time the gate pulses.",
    choices: [
      {
        id: "bring-aboard",
        label: "Bring the crates aboard",
        description: "Race the thermal alarms and integrate whatever still works.",
        outcomes: [
          { id: "cache-damage", title: "Military penetrators", description: "The crates hold dense penetrators compatible with your accelerator.", effectLabel: "+5 gun damage", tone: "favourable", weight: 46, effects: [{ kind: "stat", stat: "weaponDamage", amount: 5 }] },
          { id: "cache-range", title: "Coherent charges", description: "A sealed rack of shaped charges extends the cannon's stable envelope.", effectLabel: "+1.5 km gun range", tone: "favourable", weight: 29, effects: [{ kind: "stat", stat: "weaponRange", amount: 1.5 }] },
          { id: "cache-detonation", title: "Magazine cook-off", description: "One crate ruptures inside the cargo lock and drives shrapnel through the hull.", effectLabel: "−22 hull", tone: "danger", weight: 25, effects: [{ kind: "hull", amount: -22 }] },
        ],
      },
      {
        id: "remote-detonate",
        label: "Detonate them remotely",
        description: "Clear the lane with a cannon pulse before the crates drift closer.",
        outcomes: [
          { id: "cache-clear", title: "Open vector", description: "The controlled blast clears a path that lets the drive run at full authority.", effectLabel: "+0.75 km movement", tone: "favourable", weight: 44, effects: [{ kind: "stat", stat: "maxMove", amount: 0.75 }] },
          { id: "cache-shockwave", title: "Fragment storm", description: "The blast wave catches your broadside and overloads every shield facing.", effectLabel: "−10 all shields", tone: "danger", weight: 31, effects: [{ kind: "shield", amount: -10 }] },
          { id: "cache-patrol", title: "Ordnance alarm", description: "The destruction wakes a carrier defence flight parked beyond the next fold.", effectLabel: "Patrol intercept in a future gate", tone: "costly", weight: 25, effects: [{ kind: "threat", threat: "patrol", delay: 1 }] },
        ],
      },
    ],
  },
  {
    id: "gatekeeper-drone",
    signal: "GATEKEEPER · PASSAGE TOKEN REQUIRED",
    title: "The patient gatekeeper",
    description: "A gatekeeper drone blocks the stable corridor and requests a token issued by the hostile command you escaped.",
    choices: [
      {
        id: "spoof-token",
        label: "Spoof its credentials",
        description: "Let your stolen systems impersonate the officer who once owned them.",
        outcomes: [
          { id: "gatekeeper-range", title: "Survey solution", description: "The drone accepts the lie and uploads precision ranging for the corridor.", effectLabel: "+1.5 km gun range", tone: "favourable", weight: 43, effects: [{ kind: "stat", stat: "weaponRange", amount: 1.5 }] },
          { id: "gatekeeper-move", title: "Express aperture", description: "It opens a fast lane and teaches your drive how to hold the geometry.", effectLabel: "+0.75 km movement", tone: "favourable", weight: 31, effects: [{ kind: "stat", stat: "maxMove", amount: 0.75 }] },
          { id: "gatekeeper-trace", title: "Silent duplicate check", description: "The gate opens, but the drone records two vessels using the same command identity.", effectLabel: "Retrieval ship in a future gate", tone: "danger", weight: 26, effects: [{ kind: "threat", threat: "retrieval", delay: 2 }] },
        ],
      },
      {
        id: "dismantle-drone",
        label: "Dismantle the drone",
        description: "Pull the machine out of its orbit and force the aperture manually.",
        outcomes: [
          { id: "gatekeeper-shield", title: "Dense machine field", description: "The drone's enforcement array yields clean shield projectors.", effectLabel: "+10 all shields", tone: "favourable", weight: 43, effects: [{ kind: "shield", amount: 10 }] },
          { id: "gatekeeper-emitter", title: "Compact emitter", description: "Its enforcement beam adds a brutal pulse to the main cannon.", effectLabel: "+4 gun damage", tone: "favourable", weight: 28, effects: [{ kind: "stat", stat: "weaponDamage", amount: 4 }] },
          { id: "gatekeeper-charge", title: "Custodian failsafe", description: "The drone destroys its core and punches a molten line through your lower decks.", effectLabel: "−19 hull", tone: "danger", weight: 29, effects: [{ kind: "hull", amount: -19 }] },
        ],
      },
    ],
  },
  {
    id: "nanite-cloud",
    signal: "REPAIR SWARM · UNVERIFIED CONTROL",
    title: "The silver cloud",
    description: "A repair nanite cloud hangs across the gate aperture, mimicking the maintenance handshake of your stolen vessel.",
    choices: [
      {
        id: "allow-nanites",
        label: "Allow the cloud aboard",
        description: "Open the maintenance ports and let the swarm decide what needs fixing.",
        outcomes: [
          { id: "nanite-hull", title: "Hull rewritten", description: "The swarm closes fractures and rebuilds structural members atom by atom.", effectLabel: "+22 hull repair", tone: "favourable", weight: 44, effects: [{ kind: "hull", amount: 22 }] },
          { id: "nanite-shield", title: "Living shields", description: "The cloud retunes every field emitter before returning to the void.", effectLabel: "+11 all shields", tone: "favourable", weight: 31, effects: [{ kind: "shield", amount: 11 }] },
          { id: "nanite-contamination", title: "Sensor bloom", description: "Residual machines colonize the targeting array and blur distant contacts.", effectLabel: "−1.5 km gun range", tone: "danger", weight: 25, effects: [{ kind: "stat", stat: "weaponRange", amount: -1.5 }] },
        ],
      },
      {
        id: "purge-nanites",
        label: "Purge it with cannon fire",
        description: "Burn a channel through the swarm before crossing the aperture.",
        outcomes: [
          { id: "nanite-calibration", title: "Perfect burn", description: "The purge exposes an inefficiency in the cannon cycle and your crew corrects it.", effectLabel: "+4 gun damage", tone: "favourable", weight: 45, effects: [{ kind: "stat", stat: "weaponDamage", amount: 4 }] },
          { id: "nanite-breach", title: "Reactive swarm", description: "The cloud flows backward along the beam and eats into the bow.", effectLabel: "−17 hull", tone: "danger", weight: 30, effects: [{ kind: "hull", amount: -17 }] },
          { id: "nanite-hunter", title: "Distributed memory", description: "Fragments of the swarm escape carrying your cannon and drive signatures.", effectLabel: "Hunter in a future gate", tone: "costly", weight: 25, effects: [{ kind: "threat", threat: "hunter", delay: 1 }] },
        ],
      },
    ],
  },
  {
    id: "bounty-broadcast",
    signal: "OPEN BOUNTY · STOLEN NAVAL ASSET",
    title: "Your hull, named",
    description: "A bounty broadcast resolves into a perfect silhouette of your ship. Three hunters acknowledge the contract before the channel closes.",
    choices: [
      {
        id: "forge-reply",
        label: "Forge a reply",
        description: "Implicate another vessel and flood the channel with a false escape vector.",
        outcomes: [
          { id: "bounty-route", title: "Hunters diverted", description: "The false lead works, and their pursuit geometry reveals a faster route.", effectLabel: "+0.75 km movement", tone: "favourable", weight: 43, effects: [{ kind: "stat", stat: "maxMove", amount: 0.75 }] },
          { id: "bounty-decrypt", title: "Contract telemetry", description: "Your comms officer cracks their ranging packet before deleting the reply.", effectLabel: "+1.5 km gun range", tone: "favourable", weight: 31, effects: [{ kind: "stat", stat: "weaponRange", amount: 1.5 }] },
          { id: "bounty-forgery", title: "Voiceprint mismatch", description: "One hunter spots the forged cadence and marks the real signal for interception.", effectLabel: "Hunter in a future gate", tone: "danger", weight: 26, effects: [{ kind: "threat", threat: "hunter", delay: 2 }] },
        ],
      },
      {
        id: "answer-challenge",
        label: "Answer the challenge",
        description: "Broadcast your real vector and dare the closest hunter to take the ship.",
        outcomes: [
          { id: "bounty-cannon", title: "Hunter blinks", description: "The nearest ship retreats, shedding a weapons pod to lighten its jump.", effectLabel: "+5 gun damage", tone: "favourable", weight: 42, effects: [{ kind: "stat", stat: "weaponDamage", amount: 5 }] },
          { id: "bounty-shield", title: "Abandoned cache", description: "The hunter leaves a trapped cache, but your crew safely recovers its shield mesh.", effectLabel: "+10 all shields", tone: "favourable", weight: 30, effects: [{ kind: "shield", amount: 10 }] },
          { id: "bounty-trap", title: "Challenge accepted", description: "A concealed kinetic round arrives before the reply, smashing into the engine deck.", effectLabel: "−22 hull", tone: "danger", weight: 28, effects: [{ kind: "hull", amount: -22 }] },
        ],
      },
    ],
  },
  {
    id: "carrier-reactor",
    signal: "CARRIER WRECK · REACTOR CASCADE",
    title: "A dying star in miniature",
    description: "A carrier reactor enters its final cascade beside the gate. Its power could rebuild half your ship—or erase it.",
    choices: [
      {
        id: "tap-reactor",
        label: "Tap the reactor directly",
        description: "Hold position inside the radiation shadow and siphon power before collapse.",
        outcomes: [
          { id: "reactor-repair", title: "Power without limit", description: "For eleven seconds every repair system runs beyond specification.", effectLabel: "+24 hull repair", tone: "favourable", weight: 44, effects: [{ kind: "hull", amount: 24 }] },
          { id: "reactor-damage", title: "Overcharged cannon", description: "The weapons bus captures the surge and holds a permanent higher charge.", effectLabel: "+5 gun damage", tone: "favourable", weight: 30, effects: [{ kind: "stat", stat: "weaponDamage", amount: 5 }] },
          { id: "reactor-surge", title: "Containment loss", description: "The siphon arcs through the ship before the emergency breakers open.", effectLabel: "−23 hull", tone: "danger", weight: 26, effects: [{ kind: "hull", amount: -23 }] },
        ],
      },
      {
        id: "ride-shockwave",
        label: "Ride the final shockwave",
        description: "Time the gate jump to the reactor's collapse and steal its momentum.",
        outcomes: [
          { id: "reactor-move", title: "Slingshot burn", description: "The drive learns to hold an impossible acceleration curve.", effectLabel: "+1 km movement", tone: "favourable", weight: 49, effects: [{ kind: "stat", stat: "maxMove", amount: 1 }] },
          { id: "reactor-shield", title: "Radiation scouring", description: "The wave carries you clear but strips charge from every shield facing.", effectLabel: "−12 all shields", tone: "danger", weight: 28, effects: [{ kind: "shield", amount: -12 }] },
          { id: "reactor-wing", title: "Dead carrier wakes", description: "The blast restores a defence craft just long enough for it to mark your next aperture.", effectLabel: "Patrol intercept in a future gate", tone: "costly", weight: 23, effects: [{ kind: "threat", threat: "patrol", delay: 1 }] },
        ],
      },
    ],
  },
  {
    id: "mutiny-pod",
    signal: "ESCAPE POD · ENCRYPTED NAVAL BAND",
    title: "The officer in the pod",
    description: "An escape pod carries an officer from the same hostile fleet you fled. They claim to have mutinied and offer command codes for passage.",
    choices: [
      {
        id: "take-officer",
        label: "Bring the officer aboard",
        description: "Accept the mutineer, their command codes, and every enemy they made.",
        outcomes: [
          { id: "officer-escort", title: "Mutiny confirmed", description: "The officer calls a loyal escort out of silent running and places it under your command.", effectLabel: "Escort joins the squad", tone: "favourable", weight: 22, effects: [{ kind: "recruit", ship: "escort" }] },
          { id: "officer-codes", title: "Gunnery authority", description: "Their command codes unlock restricted calibration tables in the stolen ship.", effectLabel: "+4 gun damage · +1 km range", tone: "favourable", weight: 46, effects: [{ kind: "stat", stat: "weaponDamage", amount: 4 }, { kind: "stat", stat: "weaponRange", amount: 1 }] },
          { id: "officer-betrayal", title: "Loyalty test", description: "The officer transmits your position and sabotages the drive before being contained.", effectLabel: "−0.75 km movement · future patrol", tone: "danger", weight: 32, effects: [{ kind: "stat", stat: "maxMove", amount: -0.75 }, { kind: "threat", threat: "patrol", delay: 1 }] },
        ],
      },
      {
        id: "leave-officer",
        label: "Leave the pod behind",
        description: "Copy what data you can without opening the airlock.",
        outcomes: [
          { id: "officer-range", title: "Intercept tables", description: "The pod carries current fleet ranging tables in its emergency cache.", effectLabel: "+1.5 km gun range", tone: "favourable", weight: 43, effects: [{ kind: "stat", stat: "weaponRange", amount: 1.5 }] },
          { id: "officer-shield", title: "Command screen", description: "The pod's reinforced field cells become a patchwork second shield layer.", effectLabel: "+9 all shields", tone: "favourable", weight: 30, effects: [{ kind: "shield", amount: 9 }] },
          { id: "officer-witness", title: "Witness recovered", description: "A hostile patrol retrieves the officer and receives your exact gate sequence.", effectLabel: "Retrieval ship in a future gate", tone: "danger", weight: 27, effects: [{ kind: "threat", threat: "retrieval", delay: 2 }] },
        ],
      },
    ],
  },
  {
    id: "minefield-survivor",
    signal: "MINEFIELD PILOT · MANUAL BEACON",
    title: "One light in the minefield",
    description: "A lone pilot flashes a manual beacon from inside an abandoned mine lattice. They know a path out, but their ship cannot move.",
    choices: [
      {
        id: "clear-path",
        label: "Clear a path to them",
        description: "Use the forward cannon to carve a corridor through the dormant mines.",
        outcomes: [
          { id: "mine-scout", title: "Pilot recovered", description: "The survivor restores a compact scout and joins the squad rather than face the lattice alone.", effectLabel: "Scout joins the squad", tone: "favourable", weight: 23, effects: [{ kind: "recruit", ship: "scout" }] },
          { id: "mine-calibration", title: "Precision fire", description: "Clearing the path teaches your gunners to place energy exactly where it matters.", effectLabel: "+4 gun damage", tone: "favourable", weight: 46, effects: [{ kind: "stat", stat: "weaponDamage", amount: 4 }] },
          { id: "mine-chain", title: "Lattice cascade", description: "A hidden mine chain erupts across the port side before the corridor opens.", effectLabel: "−11 all shields · −8 hull", tone: "danger", weight: 31, effects: [{ kind: "shield", amount: -11 }, { kind: "hull", amount: -8 }] },
        ],
      },
      {
        id: "take-detour",
        label: "Take the pilot's detour",
        description: "Trust their transmitted route but leave the stranded ship behind.",
        outcomes: [
          { id: "mine-route", title: "Threading the lattice", description: "The route becomes a new drive-control routine for close maneuvering.", effectLabel: "+0.75 km movement", tone: "favourable", weight: 44, effects: [{ kind: "stat", stat: "maxMove", amount: 0.75 }] },
          { id: "mine-cache", title: "Maintenance hollow", description: "The detour passes a sealed mine tender stocked with repair foam.", effectLabel: "+17 hull repair", tone: "favourable", weight: 30, effects: [{ kind: "hull", amount: 17 }] },
          { id: "mine-ambush", title: "Sold coordinates", description: "The pilot's path is an ambush lane purchased by a nearby hunter.", effectLabel: "Hunter in a future gate", tone: "danger", weight: 26, effects: [{ kind: "threat", threat: "hunter", delay: 1 }] },
        ],
      },
    ],
  },
];

const safeRoll = (rng: () => number) => Math.min(0.999999, Math.max(0, rng()));

export function storyOutcomeWeights(choice: StoryChoice, fortune = 0) {
  return choice.outcomes.map((outcome) => {
    const shift = outcome.tone === "favourable" ? fortune : -fortune;
    return Math.max(1, outcome.weight + shift);
  });
}

export function rollStoryOutcome(choice: StoryChoice, rng: () => number = Math.random, fortune = 0) {
  const weights = storyOutcomeWeights(choice, fortune);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = safeRoll(rng) * total;
  for (let index = 0; index < choice.outcomes.length; index += 1) {
    cursor -= weights[index];
    if (cursor < 0) return choice.outcomes[index];
  }
  return choice.outcomes[choice.outcomes.length - 1];
}

export function pickStoryEncounter(seenIds: string[], rng: () => number = Math.random) {
  const unseen = STORY_ENCOUNTERS.filter((encounter) => !seenIds.includes(encounter.id));
  const pool = unseen.length ? unseen : STORY_ENCOUNTERS;
  return pool[Math.floor(safeRoll(rng) * pool.length)];
}

export function pickSalvageOptions(
  rng: () => number = Math.random,
  count = 3,
  excludedEliteIds: readonly string[] = [],
) {
  const pool = [...SALVAGE_OPTIONS];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(safeRoll(rng) * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  const drawCount = Math.max(0, Math.min(Math.floor(count), pool.length));
  const options = pool.slice(0, drawCount);
  const availableElites = ELITE_SALVAGE_OPTIONS.filter((option) => !excludedEliteIds.includes(option.id));
  if (!options.length || !availableElites.length || safeRoll(rng) >= ELITE_SALVAGE_CHANCE) return options;

  const elite = availableElites[Math.floor(safeRoll(rng) * availableElites.length)];
  const replaceIndex = Math.floor(safeRoll(rng) * options.length);
  options[replaceIndex] = elite;
  return options;
}

export function createFortuneMap(rng: () => number = Math.random) {
  return Object.fromEntries(
    STORY_ENCOUNTERS.map((encounter) => [encounter.id, encounter.choices[Math.floor(safeRoll(rng) * encounter.choices.length)].id]),
  );
}
