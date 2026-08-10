export type AiTacticalRole = "bow-tank" | "standoff" | "brawler" | "interceptor" | "heavy-platform" | "carrier";

export type AiTacticalProfile = {
  role: AiTacticalRole;
  preferredRangeRatio: number;
  facingPriority: "weapon-target" | "expected-threat";
  survivalHullRatio: number;
};
