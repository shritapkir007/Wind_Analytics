// Team structure (decision 25 Nov). Calendar View sections are sub-teams; several of them
// belong to the Wind Team. Unknown new sections become their own team automatically.

import type { Employee } from "./types";

export interface TeamInfo {
  team: string;
  subTeam: string;
  order: number;
}

const RULES: { test: RegExp; team: string; subTeam: string; order: number }[] = [
  { test: /^wind team$/i, team: "Wind Team", subTeam: "Wind Team (core)", order: 10 },
  // Decision 25 Nov: the Data Process and WFH sections are part of Wind Team (core).
  { test: /^data process/i, team: "Wind Team", subTeam: "Wind Team (core)", order: 10 },
  { test: /^wfh$/i, team: "Wind Team", subTeam: "Wind Team (core)", order: 10 },
  // GWO members are Wind Team on field operations.
  { test: /^gwo/i, team: "Wind Team", subTeam: "GWO (Field operations)", order: 13 },
  { test: /lm blade pilot/i, team: "Wind Team", subTeam: "LM Blade Pilot", order: 14 },
  { test: /cross vertical/i, team: "Properties-Wind-Utilities Cross Vertical", subTeam: "Properties-Wind-Utilities Cross Vertical", order: 20 },
  { test: /encord/i, team: "Encord Team", subTeam: "Encord Team", order: 30 },
  { test: /resigned|layed off|laid off/i, team: "Former members", subTeam: "Resigned / laid off", order: 90 },
  { test: /department changed/i, team: "Former members", subTeam: "Department changed", order: 91 },
  { test: /not in calendar view/i, team: "Not in Calendar View", subTeam: "Not in Calendar View", order: 99 },
];

export function teamOf(section: string): TeamInfo {
  const s = section.replace(/\s+/g, " ").trim();
  const r = RULES.find((x) => x.test.test(s));
  return r ? { team: r.team, subTeam: r.subTeam, order: r.order } : { team: s || "Unassigned", subTeam: s || "Unassigned", order: 50 };
}

/** Sections whose members are current staff (everything except Resigned / Department changed). */
export function isActiveSection(section: string): boolean {
  return teamOf(section).team !== "Former members" && teamOf(section).team !== "Not in Calendar View";
}

export type TeamedEmployee = Employee & TeamInfo;

export function withTeam(e: Employee): TeamedEmployee {
  return { ...e, ...teamOf(e.section) };
}

/** A filter value is either a whole team ("Wind Team") or one sub-team ("Data Process"). */
export function inTeamScope(e: { section: string } | undefined, value: string | undefined): boolean {
  if (!value) return true;
  if (!e) return false;
  const t = teamOf(e.section);
  return t.team === value || t.subTeam === value;
}

/** Teams with their sub-teams, in display order, for filters and grouped tables. */
export function teamTree(employees: Employee[]): { team: string; subTeams: string[] }[] {
  const infos = [...new Map(employees.map((e) => teamOf(e.section)).map((t) => [t.subTeam, t])).values()].sort((a, b) => a.order - b.order || a.subTeam.localeCompare(b.subTeam));
  const out: { team: string; subTeams: string[] }[] = [];
  for (const t of infos) {
    let g = out.find((x) => x.team === t.team);
    if (!g) out.push((g = { team: t.team, subTeams: [] }));
    g.subTeams.push(t.subTeam);
  }
  return out;
}

/** "Wind Team · Data Process", or just the team when it has no separate sub-teams. */
export function teamLabel(section: string): string {
  const t = teamOf(section);
  return t.team === t.subTeam ? t.team : `${t.team} · ${t.subTeam}`;
}
