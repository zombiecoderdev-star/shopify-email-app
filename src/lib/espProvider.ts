import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

// Provider-agnostic email send for campaigns/test-send. ESP_PROVIDER picks
// the branch at call time — same pattern as src/lib/aiProvider.ts for
// Gemini/Anthropic — so dropping in SendGrid/Resend/Postmark later means
// adding a branch here, never touching calling code. Return type is
// identical across providers so callers never branch on which one ran.

export type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  campaignId?: string;
  contactId?: string;
};

export type SendEmailResult = {
  success: boolean;
  messageId?: string;
  error?: string;
};

export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const provider = process.env.ESP_PROVIDER;

  if (provider === "aws_ses") {
    return sendWithAwsSes(params);
  }
  throw new Error(`ESP_PROVIDER must be "aws_ses" (got: ${provider || "unset"})`);
}

let sesClient: SESClient | null = null;

function getSesClient(): SESClient {
  if (sesClient) return sesClient;
  const region = process.env.AWS_SES_REGION;
  const accessKeyId = process.env.AWS_SES_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SES_SECRET_ACCESS_KEY;
  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error("AWS SES is not configured (missing AWS_SES_REGION/AWS_SES_ACCESS_KEY_ID/AWS_SES_SECRET_ACCESS_KEY)");
  }
  sesClient = new SESClient({ region, credentials: { accessKeyId, secretAccessKey } });
  return sesClient;
}

// SES message tags are echoed back verbatim in the SNS bounce/complaint/
// delivery notification payload (mail.tags), which is how the SNS webhook
// (src/app/api/webhooks/ses/route.ts) correlates an event back to a
// campaign_recipients row without needing to track esp_message_id mappings
// ourselves. Tag names/values must match SES's restricted charset
// (letters, numbers, underscore, hyphen) — UUIDs already satisfy this.
async function sendWithAwsSes({ to, subject, html, campaignId, contactId }: SendEmailParams): Promise<SendEmailResult> {
  const fromEmail = process.env.AWS_SES_FROM_EMAIL;
  if (!fromEmail) {
    return { success: false, error: "AWS_SES_FROM_EMAIL is not configured" };
  }

  const tags = [
    campaignId ? { Name: "campaignId", Value: campaignId } : null,
    contactId ? { Name: "contactId", Value: contactId } : null,
  ].filter((t): t is { Name: string; Value: string } => t !== null);

  try {
    const client = getSesClient();
    const command = new SendEmailCommand({
      Source: fromEmail,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject, Charset: "UTF-8" },
        Body: { Html: { Data: html, Charset: "UTF-8" } },
      },
      Tags: tags.length > 0 ? tags : undefined,
      // Required for bounce/complaint/delivery events to reach the SNS
      // webhook (src/app/api/webhooks/ses/route.ts) at all — SES only
      // publishes events for sends that reference a configuration set with
      // an SNS event destination attached. Optional here (sends still work
      // fine without it) so this doesn't hard-fail setups that haven't done
      // the manual AWS console steps yet — see HANDOFF.md's ESP section.
      ConfigurationSetName: process.env.AWS_SES_CONFIGURATION_SET || undefined,
    });
    const response = await client.send(command);
    return { success: true, messageId: response.MessageId };
  } catch (err: any) {
    return { success: false, error: err?.message || "SES send failed" };
  }
}
