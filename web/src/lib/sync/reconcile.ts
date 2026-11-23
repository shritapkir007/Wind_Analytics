// Cross-checks between our normalised data and the sheets' own summaries.
// Differences are reported as data-quality issues; they never change the data.

import type { Issue } from "../types";
import type { Snapshot } from "./collect";

const MAX_DETAIL = 25;

export function reconcile(snap: Snapshot, today: string): Issue[] {
  const out: Issue[] = [];

  // 1) Output vs per-process pivot tabs (full sync only).
  if (snap.extra.pivots && snap.submissions) {
    const ours = new Map<string, number>();
    for (const s of snap.submissions)
      for (const [p, q] of Object.entries(s.entries)) ours.set(`${p}|${s.employeeKey}|${s.date}`, q);
    for (const [proc, pivot] of Object.entries(snap.extra.pivots)) {
      let mismatches = 0;
      const keys = new Set<string>([...pivot.keys()]);
      for (const k of ours.keys()) if (k.startsWith(`${proc}|`)) keys.add(k.slice(proc.length + 1));
      for (const k of keys) {
        const a = ours.get(`${proc}|${k}`) ?? 0;
        const b = pivot.get(k) ?? 0;
        if (Math.abs(a - b) > 0.011) {
          mismatches++;
          if (mismatches <= MAX_DETAIL)
            out.push({ source: "workstudy", tab: proc, rowRef: k, severity: "warning", code: "pivot_mismatch", message: `${proc} for ${k.replace("|", " on ")}: User Input = ${a}, pivot tab = ${b}` });
        }
      }
      out.push({
        source: "workstudy",
        tab: proc,
        rowRef: "summary",
        severity: mismatches ? "warning" : "info",
        code: mismatches ? "pivot_mismatch_total" : "pivot_ok",
        message: mismatches ? `${mismatches} person-days differ between User Input and the ${proc} tab` : `${proc} tab matches User Input exactly`,
      });
    }
  }

  // 2) Leave Tracker vs Tracker (same Slack log).
  if (snap.leave && snap.extra.trackerIds) {
    const lt = new Set(snap.leave.map((l) => l.workflowId));
    const onlyTracker = [...snap.extra.trackerIds].filter((id) => !lt.has(id));
    const onlyLt = [...lt].filter((id) => !snap.extra.trackerIds!.has(id));
    if (onlyTracker.length)
      out.push({ source: "leave", tab: "Tracker", rowRef: onlyTracker.slice(0, 10).join(", "), severity: "warning", code: "tracker_only", message: `${onlyTracker.length} request(s) are in Tracker but missing from Leave Tracker` });
    if (onlyLt.length)
      out.push({ source: "leave", tab: "Leave Tracker", rowRef: onlyLt.slice(0, 10).join(", "), severity: "warning", code: "leave_tracker_only", message: `${onlyLt.length} request(s) are in Leave Tracker but missing from Tracker` });
  }

  // 3) Leave Dashboard cards.
  if (snap.leave) {
    const ref = new Map(snap.references.map((r) => [r.key, r.value]));
    const checks: [string, number][] = [
      ["leaveDashboard.Total Leave Requests", snap.leave.length],
      ["leaveDashboard.Approved Leave Requests", snap.leave.filter((l) => /^approved$/i.test(l.approvalStatus)).length],
      ["leaveDashboard.Leave Declined", snap.leave.filter((l) => /^declined$/i.test(l.approvalStatus)).length],
    ];
    for (const [k, ours] of checks) {
      if (!ref.has(k)) continue;
      const theirs = ref.get(k)!;
      out.push({
        source: "leave",
        tab: "Dashboard",
        rowRef: k.replace("leaveDashboard.", ""),
        severity: theirs === ours ? "info" : "warning",
        code: theirs === ours ? "dashboard_ok" : "dashboard_mismatch",
        message: theirs === ours ? `${k.replace("leaveDashboard.", "")}: ${ours} (matches Dashboard)` : `${k.replace("leaveDashboard.", "")}: app ${ours}, Dashboard ${theirs}`,
      });
    }
  }

  // 4) Effective leave requests vs Calendar View codes (past and current dates only).
  if (snap.leave && snap.calendar) {
    const cal = new Map(snap.calendar.map((d) => [`${d.employeeKey}|${d.date}`, d]));
    let n = 0;
    for (const l of snap.leave) {
      if (!l.effective || !l.startDate || !l.endDate) continue;
      const missing: string[] = [];
      for (let d = l.startDate; d <= l.endDate && d <= today; d = nextDay(d)) {
        const c = cal.get(`${l.employeeKey}|${d}`);
        if (c && (c.category === "present" || c.category === "wfh")) missing.push(d);
      }
      if (missing.length) {
        n++;
        if (n <= MAX_DETAIL)
          out.push({ source: "leave", tab: "Calendar View", rowRef: l.workflowId, severity: "warning", code: "leave_not_in_calendar", message: `Approved ${l.leaveType} for ${l.employeeKey} on ${missing.join(", ")} is not marked in Calendar View` });
      }
    }
    if (n > MAX_DETAIL)
      out.push({ source: "leave", tab: "Calendar View", rowRef: "summary", severity: "warning", code: "leave_not_in_calendar_total", message: `${n} approved requests are not fully reflected in Calendar View` });
  }

  // 5) Output on non-working days / present days with no output (yesterday and earlier).
  if (snap.submissions && snap.calendar) {
    const cal = new Map(snap.calendar.map((d) => [`${d.employeeKey}|${d.date}`, d]));
    let off = 0;
    for (const s of snap.submissions) {
      const c = cal.get(`${s.employeeKey}|${s.date}`);
      if (c && (c.presence === null || c.presence === 0) && Object.keys(s.entries).length) {
        off++;
        if (off <= MAX_DETAIL)
          out.push({ source: "workstudy", tab: "User Input", rowRef: `row ${s.sourceRow}`, severity: "info", code: "output_on_off_day", message: `${s.employeeKey} logged output on ${s.date}, marked "${c.rawCode || c.category}" in Calendar View (counted; may be overtime)` });
      }
    }
    if (off > MAX_DETAIL)
      out.push({ source: "workstudy", tab: "User Input", rowRef: "summary", severity: "info", code: "output_on_off_day_total", message: `${off} entries were logged on leave / week-off / holiday days` });
  }

  // 6) Work-study roster vs Calendar View.
  if (snap.extra.workstudyRoster && snap.employees) {
    const keys = new Set(snap.employees.filter((e) => e.section !== "Not in Calendar View").map((e) => e.key));
    for (const r of snap.extra.workstudyRoster)
      if (!keys.has(r.email))
        out.push({ source: "workstudy", tab: "Employee List", rowRef: r.email, severity: "info", code: "roster_mismatch", message: `${r.name} (${r.email}) is in Employee List but not in Calendar View` });
  }

  return out;
}

export function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
