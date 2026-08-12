export type AiTacticalRole = "bow-tank" | "standoff" | "brawler" | "interceptor" | "heavy-platform" | "carrier";

/** The ship's battlefield job. Doctrine separately controls risk tolerance. */
export type AiMissionOrder = "interception" | "defense" | "bombing" | "assault";

export const AI_MISSION_ORDER: AiMissionOrder[] = ["interception", "defense", "bombing", "assault"];

export const AI_MISSION_RULES: Record<AiMissionOrder, {
  label: string;
  shortRule: string;
  description: string;
}> = {
  interception: {
    label: "Interception",
    shortRule: "SCREEN · HUNT",
    description: "Hunt fast strike craft and threats closing on high-value fleet assets.",
  },
  defense: {
    label: "Defense",
    shortRule: "GUARD · DENY",
    description: "Prioritise the enemies posing the greatest danger to this ship and its fleet.",
  },
  bombing: {
    label: "Bombing",
    shortRule: "CAPITAL · RANGE",
    description: "Attack strategically valuable capital ships while preserving the fitted weapon range.",
  },
  assault: {
    label: "Assault",
    shortRule: "PRESS · BREAK",
    description: "Close on vulnerable or high-value targets and exploit impact-capable hulls.",
  },
};

export type AiTacticalProfile = {
  role: AiTacticalRole;
  defaultMission?: AiMissionOrder;
  preferredRangeRatio: number;
  facingPriority: "weapon-target" | "expected-threat";
  survivalHullRatio: number;
};
