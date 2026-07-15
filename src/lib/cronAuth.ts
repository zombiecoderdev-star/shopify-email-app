import { NextRequest } from "next/server";

// Shared-secret check for cron-triggered routes (process-scheduled, the
// tick dispatcher). Callers send the secret as the `x-cron-secret` header.
// process-scheduled previously had NO auth check at all ("deliberately no
// auth check... add one before wiring up a real scheduler" — see its old
// comment); this introduces that check for the first time, reused by every
// cron-facing route so there's exactly one CRON_SECRET to configure.
export function verifyCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("x-cron-secret") === secret;
}
