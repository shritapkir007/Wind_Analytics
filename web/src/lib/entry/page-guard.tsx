import "server-only";
import { Card, CardBody, PageHeader } from "@/components/ui";
import { getDataMode } from "./store";

/** Shown on entry pages while the app still reads the Google Sheets. */
export async function requireAppModePage(title: string) {
  if ((await getDataMode()) === "app") return null;
  return (
    <div className="fade-in">
      <PageHeader title={title} />
      <Card>
        <CardBody>
          <p className="text-[13.5px] text-ink">In-app data entry is not switched on yet — the dashboards still read the Google Sheets.</p>
          <p className="mt-1 text-[13px] text-ink-2">An admin can switch it on in Settings → Data entry.</p>
        </CardBody>
      </Card>
    </div>
  );
}
