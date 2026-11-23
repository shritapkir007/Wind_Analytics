import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runSync } from "@/lib/sync/run";
import { auth } from "@/auth";
import { devBypass } from "@/auth.config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function secretOk(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || !got || got.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(secret));
}

async function handle(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("mode") === "full" ? "full" : "quick";
  let trigger: "schedule" | "manual" = "schedule";
  let by: string | undefined;
  if (!secretOk(req)) {
    const s = devBypass ? { user: { email: "dev@localhost", role: "admin" } } : await auth();
    const role = (s?.user as { role?: string } | undefined)?.role;
    if (!s?.user?.email || !(role === "manager" || role === "admin")) {
      return NextResponse.json({ error: "unauthorised" }, { status: 401 });
    }
    trigger = "manual";
    by = s.user.email;
  }
  const result = await runSync({ mode, trigger, triggeredBy: by });
  return NextResponse.json(result, { status: result.status === "failed" ? 502 : 200 });
}

export const GET = handle;
export const POST = handle;
