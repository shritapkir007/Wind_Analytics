import { describe, expect, it } from "vitest";
import { inTeamScope, isActiveSection, teamLabel, teamOf, teamTree } from "@/lib/teams";

const emp = (section: string) => ({ key: section, email: null, name: section, role: "", section, isActive: true, employeeCode: null });

describe("team structure (decision 25 Nov)", () => {
  it("maps Calendar View sections to teams and sub-teams", () => {
    expect(teamOf("Wind Team")).toMatchObject({ team: "Wind Team", subTeam: "Wind Team (core)" });
    // Data Process and WFH are part of Wind Team (core)
    expect(teamOf("Data Process ")).toMatchObject({ team: "Wind Team", subTeam: "Wind Team (core)" });
    expect(teamOf("WFH")).toMatchObject({ team: "Wind Team", subTeam: "Wind Team (core)" });
    expect(teamOf("GWO ")).toMatchObject({ team: "Wind Team", subTeam: "GWO (Field operations)" });
    expect(teamOf("LM Blade Pilot ")).toMatchObject({ team: "Wind Team", subTeam: "LM Blade Pilot" });
    expect(teamOf("Properties-Wind-Utilities Cross Vertical")).toMatchObject({ team: "Properties-Wind-Utilities Cross Vertical" });
    expect(teamOf("Encord Project")).toMatchObject({ team: "Encord Team" });
    expect(teamOf("Brand New Section")).toMatchObject({ team: "Brand New Section", subTeam: "Brand New Section" });
  });

  it("filters by a whole team or a single sub-team", () => {
    expect(inTeamScope(emp("WFH"), "Wind Team")).toBe(true);
    expect(inTeamScope(emp("GWO "), "Wind Team")).toBe(true);
    expect(inTeamScope(emp("WFH"), "Wind Team (core)")).toBe(true);
    expect(inTeamScope(emp("Data Process "), "Wind Team (core)")).toBe(true);
    expect(inTeamScope(emp("GWO "), "Wind Team (core)")).toBe(false);
    expect(inTeamScope(emp("Encord Project"), "Wind Team")).toBe(false);
    expect(inTeamScope(emp("Encord Project"), "Encord Team")).toBe(true);
    expect(inTeamScope(emp("Encord Project"), undefined)).toBe(true);
  });

  it("builds the tree in a stable order and labels people", () => {
    const tree = teamTree(["Encord Project", "WFH", "Wind Team", "Data Process ", "GWO ", "Properties-Wind-Utilities Cross Vertical"].map(emp));
    expect(tree).toEqual([
      { team: "Wind Team", subTeams: ["Wind Team (core)", "GWO (Field operations)"] },
      { team: "Properties-Wind-Utilities Cross Vertical", subTeams: ["Properties-Wind-Utilities Cross Vertical"] },
      { team: "Encord Team", subTeams: ["Encord Team"] },
    ]);
    expect(teamLabel("Data Process ")).toBe("Wind Team · Wind Team (core)");
    expect(teamLabel("Encord Project")).toBe("Encord Team");
  });

  it("treats linked people in current sections as active", () => {
    expect(isActiveSection("LM Blade Pilot ")).toBe(true);
    expect(isActiveSection("GWO ")).toBe(true);
    expect(isActiveSection("Resigned/Layed OFF People ")).toBe(false);
    expect(isActiveSection("Department Changed ")).toBe(false);
  });
});
