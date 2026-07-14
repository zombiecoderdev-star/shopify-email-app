import { NextResponse } from "next/server";
import { SESClient, GetSendQuotaCommand } from "@aws-sdk/client-ses";

// GET /api/shopify/sending/status
// Read-only ESP configuration snapshot for the "Sending & ESP" settings
// page. Never returns the AWS secret key — only the provider name, a
// masked from-address, and a best-effort sandbox-mode heuristic (SES v1's
// API has no "am I in sandbox" boolean — GetAccountSendingEnabled only
// reports whether sending is paused, not sandbox status. GetSendQuota's
// Max24HourSend/MaxSendRate happen to match AWS's fixed sandbox defaults
// (200/day, 1/sec), so we use that as a heuristic — not a certainty).

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(local.length - 2, 1))}@${domain}`;
}

export async function GET() {
  const provider = process.env.ESP_PROVIDER || null;
  const fromEmail = process.env.AWS_SES_FROM_EMAIL || null;

  const result: {
    provider: string | null;
    fromEmail: string | null;
    sandbox: { likelyInSandbox: boolean; max24HourSend: number; maxSendRate: number; sentLast24Hours: number } | null;
    sandboxCheckError: string | null;
  } = {
    provider,
    fromEmail: fromEmail ? maskEmail(fromEmail) : null,
    sandbox: null,
    sandboxCheckError: null,
  };

  if (provider === "aws_ses") {
    const region = process.env.AWS_SES_REGION;
    const accessKeyId = process.env.AWS_SES_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SES_SECRET_ACCESS_KEY;

    if (!region || !accessKeyId || !secretAccessKey) {
      result.sandboxCheckError = "AWS SES credentials are not fully configured";
    } else {
      try {
        const client = new SESClient({ region, credentials: { accessKeyId, secretAccessKey } });
        const quota = await client.send(new GetSendQuotaCommand({}));
        const max24HourSend = quota.Max24HourSend ?? 0;
        const maxSendRate = quota.MaxSendRate ?? 0;
        result.sandbox = {
          likelyInSandbox: max24HourSend <= 200 && maxSendRate <= 1,
          max24HourSend,
          maxSendRate,
          sentLast24Hours: quota.SentLast24Hours ?? 0,
        };
      } catch (err: any) {
        result.sandboxCheckError = err?.message || "Failed to check SES account status";
      }
    }
  } else if (provider) {
    result.sandboxCheckError = `Sandbox status check is only implemented for aws_ses (current provider: ${provider})`;
  }

  return NextResponse.json(result);
}
