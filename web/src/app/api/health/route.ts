import { NextResponse } from "next/server";
import { lastSuccessfulRun } from "@/lib/sync/run";
import { describeDbError } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const r = await lastSuccessfulRun();
    return NextResponse.json({ ok: true, lastSuccessfulSync: r?.finishedAt ?? null });
  } catch (e) {
    return NextResponse.json({ ok: false, error: describeDbError(e) }, { status: 500 });
  }
}
