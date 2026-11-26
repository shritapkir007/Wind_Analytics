import Link from "next/link";
import { asc } from "drizzle-orm";
import { can, currentUser } from "@/auth";
import { getDb, schema } from "@/lib/db";
import { getDataMode } from "@/lib/entry/store";
import { WEEKDAYS } from "@/lib/entry/catalog";
import { teamLabel, teamOf } from "@/lib/teams";
import type { SP } from "@/lib/view";
import { Badge, Card, CardBody, CardHeader, PageHeader, Table, td, th } from "@/components/ui";
import { EmployeeForm } from "@/components/entry/forms";

export const dynamic = "force-dynamic";

export default async function People({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await currentUser();
  if (!can(user, "manager")) return <div className="fade-in"><PageHeader title="People & Teams" subtitle="Only managers and admins manage the roster." /></div>;
  const sp = await searchParams;
  const mode = await getDataMode();
  const db = await getDb();
  const emps = await db.select().from(schema.employees).orderBy(asc(schema.employees.name));
  const sections = [...new Set(emps.map((e) => e.section).filter(Boolean))].sort((a, b) => teamOf(a).order - teamOf(b).order || a.localeCompare(b));
  const editing = typeof sp.edit === "string" ? emps.find((e) => e.key === sp.edit) : undefined;
  const show = sp.all === "1" ? emps : emps.filter((e) => e.isActive);

  return (
    <div className="fade-in">
      <PageHeader
        title="People & Teams"
        subtitle={mode === "app" ? "The roster drives attendance: week offs, place of work and join/leave dates generate everyone's calendar." : "While the app reads the sheets, the roster is refreshed from Calendar View on every sync — edits here may be overwritten."}
      />
      <div className="grid gap-4">
        <Card>
          <CardHeader title={editing ? `Edit ${editing.name}` : "Add a person"} actions={editing ? <Link href="/people" className="text-[13px] text-accent hover:underline">+ Add someone new instead</Link> : null} />
          <CardBody>
            <EmployeeForm
              key={editing?.key ?? "new"}
              sections={sections}
              value={
                editing
                  ? { key: editing.key, name: editing.name, email: editing.email ?? "", role: editing.role, section: editing.section, employeeCode: editing.employeeCode ?? "", weekOff: editing.weekOff, workLocation: editing.workLocation, joinedOn: editing.joinedOn ?? "", leftOn: editing.leftOn ?? "", isActive: editing.isActive }
                  : undefined
              }
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title={`Roster (${show.length})`}
            actions={<Link href={sp.all === "1" ? "/people" : "/people?all=1"} className="text-[13px] text-accent hover:underline">{sp.all === "1" ? "Active only" : "Include inactive"}</Link>}
          />
          <Table>
            <thead>
              <tr>{["Name", "Email", "Team", "Designation", "Days off", "Works from", "Status", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {show.map((e) => (
                <tr key={e.key}>
                  <td className={`${td} font-medium`}>{e.name}</td>
                  <td className={`${td} text-ink-2`}>{e.email ?? <Badge tone="warning">no email</Badge>}</td>
                  <td className={td}>{teamLabel(e.section)}</td>
                  <td className={td}>{e.role}</td>
                  <td className={td}>{e.weekOff.map((d) => WEEKDAYS[d]).join(", ")}</td>
                  <td className={td}>{e.workLocation === "wfh" ? "Home" : "Office"}</td>
                  <td className={td}>{e.isActive ? <Badge tone="good">active</Badge> : <Badge>inactive{e.leftOn ? ` · left ${e.leftOn}` : ""}</Badge>}</td>
                  <td className={td}><Link href={`/people?edit=${encodeURIComponent(e.key)}${sp.all === "1" ? "&all=1" : ""}`} className="text-accent hover:underline">Edit</Link></td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
