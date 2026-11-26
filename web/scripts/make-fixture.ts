/**
 * Generates a SYNTHETIC snapshot of the three workbooks with the same tab layouts as the real
 * sheets (fake people, random but plausible numbers). Used only for local development, tests and
 * demos; production always reads the real Google Sheets.
 *
 *   npx tsx scripts/make-fixture.ts [today=2026-11-23] [out=fixtures/demo.json]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const TODAY = process.argv[2] ?? "2026-11-23";
const OUT = process.argv[3] ?? "fixtures/demo.json";

let seed = 20261123;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const chance = (p: number) => rnd() < p;
const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const wd = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const days: string[] = [];
for (let d = "2026-01-01"; d <= "2026-12-31"; d = addDays(d, 1)) days.push(d);
const HOLIDAYS = new Set(["2026-01-01", "2026-01-15", "2026-01-26", "2026-03-19", "2026-05-01", "2026-08-15", "2026-09-14", "2026-10-02", "2026-10-20", "2026-11-01", "2026-11-10", "2026-12-25"]);

const FIRST = ["Asha", "Ravi", "Meera", "Kiran", "Divya", "Arjun", "Neha", "Rahul", "Pooja", "Vikram", "Sneha", "Anil", "Kavitha", "Suresh", "Lakshmi", "Manoj", "Priya", "Deepak", "Anitha", "Ganesh", "Rekha", "Nikhil", "Swati", "Harish", "Bhavya", "Tarun", "Usha", "Varun", "Geetha", "Sanjay", "Ritu", "Mohan", "Isha", "Praveen", "Shalini", "Rohit", "Nandini", "Ajay", "Keerthi", "Sunil", "Farah", "Imran"];
const LAST = ["Rao", "Shetty", "Nair", "Kumar", "Iyer", "Patil", "Reddy", "Menon", "Gowda", "Desai", "Hegde", "Joshi", "Pillai", "Kamath", "Bhat"];
type Person = { name: string; email: string; role: string; section: string; procs: string[]; skill: number; satWork: boolean; code: string };
const people: Person[] = [];
const sections: [string, number, string[][]][] = [
  ["", 14, [["Ext_FQC"], ["Ext_Analysis"], ["Ext_Prescreen", "Ext_Analysis"], ["Ext_FQC", "Critical Review"], ["Int_FQC"], ["Int_Pre+Analysis"]]],
  ["WFH", 5, [["Ext_FQC"], ["Ext_Analysis"], ["Ext_FQC", "SN Update Insights"]]],
  ["Data Process ", 4, [["Data Process"], ["Data Process", "Pilot-Uploaders"], ["ZDT Data Process"]]],
  ["GWO ", 8, [["ZDT Prescreen+Analysis"], ["ZDT FQC", "ZDT QI Resolved"], ["Skyspecs Data upload"], ["Ext_Prescreen"], ["Audit-2026", "Ext_FQC"]]],
  ["Encord Project", 7, [["Ext_Analysis"], ["Ext_Prescreen"], ["ZDT Data Process", "Nacelle"], ["Int_FQC", "Int_QI Resolved+Blade swap"]]],
];
const ROLES = ["Sr Engineer", "Engineer 2", "Engineer 1", "Data Analyst"];
let n = 0;
for (const [section, count, procSets] of sections) {
  for (let i = 0; i < count; i++) {
    const f = FIRST[n % FIRST.length];
    const l = LAST[(n * 7) % LAST.length];
    people.push({
      name: `${f} ${l}`,
      email: `${f}.${l}${n}`.toLowerCase() + "@example.com",
      role: n < 2 ? "Team Lead" : pick(ROLES),
      section,
      procs: pick(procSets),
      skill: 0.75 + rnd() * 0.45,
      satWork: chance(0.25),
      code: `FW${String(100 + n).padStart(3, "0")}`,
    });
    n++;
  }
}
const resigned = [{ name: "Old Member", email: "", role: "Data Analyst" }, { name: "Left Person", email: "left.person99@example.com", role: "Engineer 1" }];

// ---------------- Calendar + leave ----------------
const TYPES = ["EL", "CL", "WL", "PL", "EL CF"];
const cal = new Map<string, string>(); // email|date -> code
type Req = string[];
const leaveRows: Req[] = [];
let wf = 1767161000;
for (const p of people) {
  for (const d of days) {
    const w = wd(d);
    if (HOLIDAYS.has(d)) cal.set(`${p.email}|${d}`, "Public Holiday");
    else if (w === 0 || (w === 6 && !p.satWork)) cal.set(`${p.email}|${d}`, "Week Off");
    else if (p.section === "WFH" || chance(0.03)) cal.set(`${p.email}|${d}`, p.section === "WFH" ? "WFH" : "WFH");
  }
  // ~1.5 leave requests per month
  for (let k = 0; k < 17; k++) {
    const start = pick(days.filter((d) => !HOLIDAYS.has(d) && wd(d) !== 0 && wd(d) !== 6));
    const len = chance(0.2) ? 2 : 1;
    const end = addDays(start, len - 1);
    const type = chance(0.06) ? "Comp Off" : pick(TYPES);
    const unplanned = chance(0.25);
    const half = !unplanned && type !== "Comp Off" && chance(0.12);
    const status = chance(0.03) ? "Declined" : start > TODAY && chance(0.15) ? "" : "Approved";
    const reverted = status === "Approved" && chance(0.03);
    const applied = addDays(start, unplanned ? 0 : -Math.ceil(rnd() * 10));
    const [y, m, dd] = applied.split("-").map(Number);
    const ts = `${MONTH_FULL[m - 1]} ${dd}th, ${y} at ${1 + Math.floor(rnd() * 11)}:${String(Math.floor(rnd() * 60)).padStart(2, "0")} ${chance(0.5) ? "AM" : "PM"} GMT+5:30`;
    const kind = type === "Comp Off" ? "Compensatory Off (CW-)" : unplanned ? "Time Off - Unplanned" : "Time Off - Planned";
    leaveRows.push([String(wf++), p.email, kind, type, dmy(start), dmy(end), "Personal work", "", "https://slack.example/x", ts, status, `@${p.name.split(" ")[0]}`, status || "", "", status ? ts : "", "", status === "Approved" ? (reverted ? "Revert Leave" : "Processed") : status === "Declined" ? "Not Processed" : "", reverted ? "Leave Reverted (Log now expired)" : status === "Approved" ? "Leave Processed in Calendar View" : "", "", chance(0.6) ? "Yes" : ""]);
    if (status === "Approved" && !reverted) {
      for (let d = start; d <= end; d = addDays(d, 1)) {
        const c = cal.get(`${p.email}|${d}`);
        if (c === "Week Off" || c === "Public Holiday") continue;
        cal.set(`${p.email}|${d}`, half ? `${chance(0.5) ? "First" : "Second"} Half ${type}` : type);
      }
    }
  }
  // occasional LoP
  if (chance(0.15)) cal.set(`${p.email}|${pick(days.filter((d) => d <= TODAY && wd(d) > 0 && wd(d) < 6 && !HOLIDAYS.has(d)))}`, "LoP");
}

const header1 = ["Wind Team Leave Management - 2026", "", ""];
const header2 = ["", "", ""];
const header3 = ["", "", "Headcount/Day ➡️"];
const header4 = ["Team Members", "Email", "Role"];
const colDates: (string | null)[] = [];
let prevMonth = -1;
for (const d of days) {
  const m = Number(d.slice(5, 7)) - 1;
  if (m !== prevMonth) {
    colDates.push(null);
    prevMonth = m;
  }
  colDates.push(d);
}
for (const cd of colDates) {
  if (!cd) {
    const nextIdx = colDates.indexOf(cd);
    header1.push(MONTH_FULL[Number((colDates[colDates.indexOf(cd, nextIdx) + 1] ?? "2026-01").slice(5, 7)) - 1]);
    header2.push("");
    header3.push("");
    header4.push("");
    continue;
  }
  header1.push(`${MON[Number(cd.slice(5, 7)) - 1]} ${Number(cd.slice(8, 10))}`);
  header2.push(WD[wd(cd)]);
  const hc = people.reduce((a, p) => {
    const c = cal.get(`${p.email}|${cd}`) ?? "";
    return a + (c === "" || c === "WFH" || c === "Working" ? 1 : /^(First|Second) Half (CL|EL|EL CF)$/.test(c) ? 0.5 : 0);
  }, 0);
  header3.push(String(hc));
  header4.push(String(people.length - hc));
}
// fix month labels: put the right month name before each month's first day
for (let i = 3; i < header1.length; i++) {
  if (!/^\w{3} \d/.test(header1[i])) {
    const next = header1[i + 1];
    header1[i] = next ? MONTH_FULL[MON.indexOf(next.slice(0, 3))] : "";
  }
}
const calendarGrid: string[][] = [header1, header2, header3, header4];
let lastSection = "";
for (const p of people) {
  if (p.section !== lastSection) {
    calendarGrid.push([]);
    if (p.section) calendarGrid.push([p.section]);
    lastSection = p.section;
  }
  calendarGrid.push([p.name, p.email, p.role, ...colDates.map((d) => (d ? cal.get(`${p.email}|${d}`) ?? "" : ""))]);
}
calendarGrid.push([], ["Resigned/Layed OFF People "]);
for (const r of resigned) calendarGrid.push([r.name, r.email, r.role]);

// ---------------- User Input ----------------
const PROCESS_COLS = ["Ext_FQC", "Ext_Analysis", "Ext_Prescreen", "Ext_QI Resolved", "Critical Review", "SN Update Insights", "Ext_Eng Review", "Int_Eng Review", "Full Internal Inspection(P+A+FQC)", "Int_FQC", "Int_Pre+Analysis", "Int_QI Resolved+Blade swap", "Pilot-Uploaders", "Data Process", "Data Process_QI-Rework", "Nacelle", "Tower", "Cooler Top", "HUB Inspection", "ZDT Data Process ", "ZDT Pitch Beraring Data Process", "ZDT Prescreen+Analysis ", "ZDT Pitch Beraring Prescreen+Analysis", "ZDT FQC", "ZDT Pitch Beraring FQC", "Nordex Calculation", "Audit-2026", "ZDT QI Resolved", "Skyspecs Data upload"];
const RATE: Record<string, number> = { Ext_FQC: 11, Ext_Analysis: 7.5, Ext_Prescreen: 19, "Int_FQC": 3.3, "Int_Pre+Analysis": 3.1, "Data Process": 7, "ZDT Data Process ": 8, "ZDT Prescreen+Analysis ": 9.5, "ZDT FQC": 11.5, "Audit-2026": 11, "Skyspecs Data upload": 40, "Critical Review": 20, "SN Update Insights": 6, "Pilot-Uploaders": 60, Nacelle: 4, "ZDT QI Resolved": 4, "Int_QI Resolved+Blade swap": 2, "Ext_QI Resolved": 2 };
const ui: string[][] = [
  ["Emplyoee Name", "Output_Date", "Data Added By", "Timestamp", "Which Backend Sheets Updated ?", "Output Entry Status", ...PROCESS_COLS, "Other_Work", "Team Lead's Notes"],
  ["", "", "", "", "", "", "0", "0", "0", "0"],
];
const pivots: Record<string, Map<string, number>> = {};
for (const d of days.filter((x) => x < TODAY)) {
  for (const p of people) {
    const c = cal.get(`${p.email}|${d}`) ?? "";
    const w = c === "" || c === "WFH" || c === "Working" ? 1 : /Half/.test(c) ? 0.5 : 0;
    if (w === 0 && !(c === "Week Off" && chance(0.01))) continue;
    if (w > 0 && chance(0.04)) continue; // forgot to log
    const vals: Record<string, number> = {};
    const share = 1 / p.procs.length;
    const mood = 0.6 + rnd() * 0.7;
    for (const proc of p.procs) {
      const col = PROCESS_COLS.find((c2) => c2.trim() === proc.trim()) ?? proc;
      const r = RATE[col] ?? 5;
      let q = r * share * p.skill * mood * (w || 1);
      q = col.startsWith("Int_") || col === "Data Process" ? round(Math.round(q * 3) / 3, 2) : Math.max(0, Math.round(q));
      if (q > 0) vals[col] = q;
    }
    const late = chance(0.1) ? 2 : 0;
    const row = [p.email, dmy(d), p.email, `${dmy(addDays(d, late))} 18:${String(Math.floor(rnd() * 60)).padStart(2, "0")}:00`, `Sheets Updated: ${Object.keys(vals).join(", ")}`, "Updated", ...PROCESS_COLS.map((col) => (vals[col] != null ? String(vals[col]) : "0")), chance(0.05) ? "1 QI resolved turbine" : "0", "0"];
    ui.push(row);
    for (const [col, q] of Object.entries(vals)) {
      const k = col.trim();
      (pivots[k] ??= new Map()).set(`${p.email}|${d}`, q);
    }
  }
}

// pivot tabs (reconciliation): one per process with data
const pivotTabs: Record<string, string[][]> = {};
for (const [col, m] of Object.entries(pivots)) {
  const emails = [...new Set([...m.keys()].map((k) => k.split("|")[0]))];
  const g: string[][] = [["", "", "", "", ...emails], ["Month", "Date", "Day", "Total", ...emails.map((e) => people.find((p) => p.email === e)!.name)], ["", "", "", ""], ["", "", "", ""]];
  for (const d of days) {
    const vals = emails.map((e) => (HOLIDAYS.has(d) ? "H" : String(m.get(`${e}|${d}`) ?? 0)));
    g.push([MONTH_FULL[Number(d.slice(5, 7)) - 1], dmy(d), WD[wd(d)], String(emails.reduce((a, e) => a + (m.get(`${e}|${d}`) ?? 0), 0)), ...vals]);
  }
  pivotTabs[col] = g;
}

// ---------------- Active ZV ----------------
const zv: string[][] = [
  ["", "", "", "Blade External", "", "", "", "", "", "", "", "Blade Internal", "", "", "", "", "", "", "", "ZDT(Zero Down Time)"],
  ["", "", "", "", "Total Delivered\n(As of Today)"],
  [],
  [],
  ["Month", "Date", "No of Week", "Delivered/Day  ", "Expected/day", "Upload/Day ", "Current Inventory", "Quality Issue (In Asana)", "Duplicate Turbines", "Late Uploads", "External Audit Count ", "Delivered/Day  ", "Expected/day", "Upload/Day (inc.LM)", "Current Inventory", "Quality Issue (In Asana)", "Duplicate Turbines", "Late Uploads", "Internal Audot count ", "Delivered/Day  ", "Expected/day", "Upload/Day ", "Current Inventory", "Quality Issue (In Asana)", "Duplicate Turbines"],
];
let inv = { e: 220, i: 80, z: 60 };
let qi = { e: 130, i: 55, z: 40 };
for (const d of days) {
  const working = d < TODAY && wd(d) > 0 && wd(d) < 6 && !HOLIDAYS.has(d);
  const extDel = working ? [...pivots["Ext_FQC"]?.entries() ?? []].filter(([k]) => k.endsWith(d)).reduce((a, [, v]) => a + v, 0) : 0;
  const intDel = working ? [...pivots["Int_FQC"]?.entries() ?? []].filter(([k]) => k.endsWith(d)).reduce((a, [, v]) => a + v, 0) : 0;
  const zDel = working ? [...pivots["ZDT FQC"]?.entries() ?? []].filter(([k]) => k.endsWith(d)).reduce((a, [, v]) => a + v, 0) : 0;
  const up = working ? { e: Math.round(extDel * (0.85 + rnd() * 0.35)), i: round(intDel * (0.8 + rnd() * 0.45), 2), z: Math.round(zDel * (0.8 + rnd() * 0.4)) } : { e: 0, i: 0, z: 0 };
  if (working) {
    inv = { e: Math.max(40, inv.e + up.e - extDel), i: Math.max(10, round(inv.i + up.i - intDel, 2)), z: Math.max(5, inv.z + up.z - zDel) };
    qi = { e: Math.max(20, qi.e + Math.round((rnd() - 0.5) * 8)), i: Math.max(5, qi.i + Math.round((rnd() - 0.5) * 4)), z: Math.max(2, qi.z + Math.round((rnd() - 0.55) * 4)) };
  }
  const z = (v: number) => String(working ? v : 0);
  zv.push([MONTH_FULL[Number(d.slice(5, 7)) - 1], dmy(d), "1", z(extDel), "0", z(up.e), z(inv.e), z(qi.e), z(chance(0.1) ? 1 : 0), z(chance(0.05) ? 1 : 0), "", z(round(intDel, 2)), "0", z(up.i), z(inv.i), z(qi.i), "0", "0", "", z(zDel), "0", z(up.z), z(inv.z), z(qi.z), "0"]);
}

// ---------------- Target, Employee List, OT, Employee ID ----------------
const target = [
  ["2026 - Throughput target"], [],
  ["Method", "Process", "Images", "WTG/Day", "Average WTG/Day", "Minutes/WTG"],
  ["External", "PreScreen", "300-500", "18-20", "19", "19"],
  ["External", "Analysis", "300-500", "7-8", "7.5", "48"],
  ["External", "FQC", "300-500", "10-12", "11", "33"],
  ["Internal", "PreScreen + Analysis", "800-1500", "2.6-3.6", "3.1", "116"],
  ["Internal", "FQC", "800-1500", "3-3.6", "3.3", "109"],
  ["ZDT", "PreScreen + Analysis", "240-300", "9-10", "9.5", "38"],
  ["ZDT", "FQC", "240-300", "11-12", "11.5", "31"],
  ["ZDT", "Data Processing ", "", "8", "8", "45"],
  ["Internal - DP", "Data Processing", "", "6-8", "7", "51"],
  ["Audit", "Audit Work", "300-500", "10-12", "11", "33"],
];
const employeeList = [["Name", "Employee Email", "Role"], [], ...people.map((p) => [p.name, p.email, p.role])];
const ot: string[][] = [["Analyst Name", "Role", "Location", "Operational Process", "Supporting department", "Date", "Time Start", "Time ends", "Shift (0.5 &1)", "No. of Turbines delivered", "Column 14", "Supervisor name", "Notes", "Column 1", "Employee ID"]];
for (const d of days.filter((x) => x < TODAY && wd(x) === 6)) {
  for (const p of people.filter(() => chance(0.08))) ot.push([p.name, p.role, "WfH", p.procs[0].replace(/_/g, " "), "Externals", dmy(d), "09:30:00", "06:30:00", chance(0.85) ? "Full Day" : "Half Day", `${Math.round(5 + rnd() * 8)} ${p.procs[0].replace(/_/g, " ")}`, "", people[0].name]);
}
const employeeIds = people.filter(() => chance(0.7)).map((p) => [p.code, p.name, p.email, p.role]);

// ---------------- Leave tracker tabs ----------------
const ltHeader = ["Workflow ID", "Request from", "Request", "Request Type", "Start Date", "End Date", "Comment", "Follow up Comment", "Slack Message", "Application Time Stamp", "Approval Status", "Reviewed by", "Leads Comment", "Leads Follow up Comment", "Closures Time Stamp", "", "Status With \nCalendar View", "Comment from Calendar View", "Team Lead's Note", "Zoho Applied ?", " Manager's Note\n(LoP needs to manually add in Calendar View)"];
leaveRows.sort((a, b) => Number(a[0]) - Number(b[0]));
const leaveTracker = [["Leave's Log from the Slack", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "Team Lead's Space", "", "", "Manager's Space"], ltHeader, ...leaveRows];
const tracker = [ltHeader.slice(0, 15), ...leaveRows.map((r) => r.slice(0, 15))];
const count = (st: string) => leaveRows.filter((r) => r[10] === st).length;
const dashboard = [[dmy(TODAY)], ["", "Employee Leave Requests Dashboard"], [], [], [], ["", "An overall summary of the employee's leaves in a year"], [], [],
  ["", "Total Leave \nRequests", "", "", "Approved Leave Requests", "", "", "In Discussion ", "", "", "Reconsider Request", "", "Leave Declined", "", "", "", "", "", "Pending Leave \nRequests"], [],
  ["", String(leaveRows.length), "", "", String(count("Approved")), "", "", "0", "", "", "0", "", String(count("Declined")), "", "", "", "", "", String(count(""))],
  // side tables with repeated headings, like the real Dashboard
  [], [], [], [],
  ["", "Employee(s) on Leave Today", "", "", "", "", "", "", "", "", "", "Leave Requested", "", "", "Leave Approved"],
  ["Change Date", dmy(TODAY), "", "", "", "", "", "", "", "", "", "Request From", "Total Leaves", "", "Request From", "Total Leaves"],
  ["", "", "", "", "", "", "", "", "", "", "", "Request from", "count Workflow ID", "", "Request from", "count Workflow ID"],
  ["", "", "", "", "", "", "", "", "", "", "", people[0].email, "31", "", people[1].email, "30"]];

// ---------------- Wind-Inventory Count (one tab per Asana tracker + Priority) ----------------
// Bases are the real counts of 26 Nov 2026; earlier days drift around them. Sundays and future days
// are left at zero, like the sheet (it has a row for every day of the year).
const INV: [string, [string, number][]][] = [
  ["Asana - Wind Analytics Daily Tracker", [["Prescreen", 79], ["ZV Analysis", 1396], ["Accurance Analysis", 80], ["FQC", 420], ["Quality Issues", 146], ["Total", -1], ["Nordex analysis ", 71], ["Nordex FQC ", 8]]],
  ["Asana - External Quality Issues", [["Engineering - Needs review", 40], ["Ops - Action needed", 96], ["Ready for Analysis", 3], ["Product Related Issue ", 0], ["Total", -1]]],
  ["Asana - Internal Blade Analytics Daily Tracker", [["Prescreen+Analysis", 100], ["FQC", 16], ["Quality Issues", 67]]],
  ["Asana - Internal Data Process Tracker", [["Pending Upload", 49], ["Data Avl to Download", 30], ["In-Preprocessing", 65], ["Pilot Uploader", 78]]],
  ["Asana - ZDT Analytics Daily Tracker", [["Prescreen+Analysis", 43], ["FQC", 32], ["Quality Issues", 0]]],
  ["ZDT Data Process", [["ZDT Pre - Processing", 90], ["ZDT Pilot uploader", 1]]],
  ["ZV-Skyspecs- GE Upload Tracker", [["Yet to Upload Data", 0], ["In Progress", 2273], ["Issue/Error", 980]]],
];
const invTabs: Record<string, string[][]> = {};
const yearDays: string[] = [];
for (let d = `${TODAY.slice(0, 4)}-01-01`; d <= `${TODAY.slice(0, 4)}-12-31`; d = addDays(d, 1)) yearDays.push(d);
for (const [tab, cols] of INV) {
  const grid: string[][] = [[tab], [], ["Month", "Date", "Day", "Week", ...cols.map(([h]) => h)]];
  for (const d of yearDays) {
    const off = d > TODAY || wd(d) === 0 || HOLIDAYS.has(d);
    const ageDays = (Date.parse(TODAY) - Date.parse(d)) / 864e5;
    const vals = cols.map(([, base]) => (base < 0 || off ? 0 : Math.max(0, Math.round(base * (1 + Math.sin(ageDays / 9) * 0.12 + (rnd() - 0.5) * 0.08)))));
    const total = vals.reduce((a, b) => a + b, 0);
    grid.push([MONTH_FULL[+d.slice(5, 7) - 1], dmy(d), WD[wd(d)].slice(0, 3), String(Math.ceil((+d.slice(8, 10)) / 7)), ...cols.map(([, base], i) => (base < 0 ? String(off ? 0 : total) : String(vals[i])))]);
  }
  invTabs[tab] = grid;
}
invTabs["Priority"] = [[], ["Date:"], [TODAY], ["Priority Site", "Number of Wtgs Active", "Customer", "Prescreen", "Analysis", "FQC", "Request from - Ops Coordinator", "SLA", "Status", "Comments", "ETD"],
  ["Foard City", "0", "GE", "-", "-", "-", "Camron", "--", "Complete", "DONE", "15-11-2026"],
  ["Ouro Branco", "0", "Vestas", "", "0", "0", "Gabriel Alves", "--", "Complete", "DONE", "18-11-2026"],
  ["Crookwell 2", "24", "GE", "6", "10", "8", "Daniel AU", "48h", "In progress", "Analysis running", dmy(addDays(TODAY, 2))],
  ["Diamond Trail Expansion", "18", "GE", "18", "0", "0", "Camron", "72h", "Not started", "", dmy(addDays(TODAY, 4))]];

const out = {
  workstudy: { "User Input": ui, "Active ZV": zv, Target: target, "Employee List": employeeList, ...pivotTabs },
  leave: { "Calendar View": calendarGrid, "Leave Tracker": leaveTracker, Tracker: tracker, Dashboard: dashboard },
  overtime: { "Wind OT tracker 2026": ot, "Employee ID": employeeIds },
  inventory: invTabs,
};
mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));
console.log(`wrote ${OUT}: ${people.length} people, ${ui.length - 2} output rows, ${leaveRows.length} leave requests`);
