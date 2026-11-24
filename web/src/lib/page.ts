import "server-only";
import { getDataset } from "./domain/dataset";
import { parseView, type SP } from "./view";
import type { Preset } from "./domain/dates";
import type { Filter } from "./domain/metrics";

/** Everything a page needs: dataset, parsed URL filter and filter-bar options. */
export async function loadPage(spPromise: Promise<SP>, defaultPreset: Preset = "this_month") {
  const [ds, sp] = await Promise.all([getDataset(), spPromise]);
  const v = parseView(sp, ds.today, defaultPreset);
  const filter: Filter = { from: v.from, to: v.to, section: v.section, employee: v.employee, family: v.family };
  const sections = [...new Set(ds.employees.filter((e) => e.isActive).map((e) => e.section))];
  const employees = ds.employees
    .filter((e) => e.isActive && (!v.section || e.section === v.section))
    .map((e) => ({ key: e.key, name: e.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const barProps = { preset: v.preset, from: v.from, to: v.to, sections, employees, grain: v.grain, defaultPreset };
  return { ds, sp, v, filter, barProps, hasData: ds.calendarDates.length > 0 || ds.submissions.length > 0 };
}
