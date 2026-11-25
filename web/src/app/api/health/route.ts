import { NextResponse } from "next/server";
import { lastSuccessfulRun } from "@/lib/sync/run";
import { describeDbError, withDbTimeout } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const r = await withDbTimeout(lastSuccessfulRun(), "health check", 15_000);
    return NextResponse.json({ ok: true, lastSuccessfulSync: r?.finishedAt ?? null });
  } catch (e) {
    return NextResponse.json({ ok: false, error: describeDbError(e) }, { status: 500 });
  }
}
