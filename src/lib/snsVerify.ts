// Manual verification of an SNS message signature, per AWS's documented
// algorithm: https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html
// No @aws-sdk package ships a ready-made verifier for this — SNS delivery
// (client-sns) and signature verification are different concerns. This is
// deliberately fail-closed: any error (bad host, fetch failure, signature
// mismatch, unexpected shape) returns false so the caller drops the
// message rather than trusting unverified input.
//
// NOTE: this has not been exercised against a real AWS-signed message in
// this environment (no way to generate one without a live SNS topic) — the
// field ordering and cert-host check follow AWS's docs exactly, but treat
// the first real SubscriptionConfirmation as the actual test and watch the
// webhook_logs / server logs for a rejection before relying on it.
import crypto from "crypto";

export type SnsMessage = {
  Type: string;
  MessageId: string;
  TopicArn: string;
  Subject?: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  UnsubscribeURL?: string;
  SubscribeURL?: string;
  Token?: string;
};

// Only trust certs actually served by AWS SNS — otherwise an attacker could
// point SigningCertURL at their own cert and self-sign a fake message.
const SIGNING_CERT_HOST_RE = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/i;

function buildStringToSign(msg: SnsMessage): string {
  const isConfirmation = msg.Type === "SubscriptionConfirmation" || msg.Type === "UnsubscribeConfirmation";

  const fields: [string, string | undefined][] = isConfirmation
    ? [
        ["Message", msg.Message],
        ["MessageId", msg.MessageId],
        ["SubscribeURL", msg.SubscribeURL],
        ["Timestamp", msg.Timestamp],
        ["Token", msg.Token],
        ["TopicArn", msg.TopicArn],
        ["Type", msg.Type],
      ]
    : [
        ["Message", msg.Message],
        ["MessageId", msg.MessageId],
        ["Subject", msg.Subject],
        ["Timestamp", msg.Timestamp],
        ["TopicArn", msg.TopicArn],
        ["Type", msg.Type],
      ];

  return (
    fields
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}\n${value}`)
      .join("\n") + "\n"
  );
}

export async function verifySnsSignature(msg: SnsMessage): Promise<boolean> {
  try {
    if (!msg.SigningCertURL || !msg.Signature) return false;

    const certUrl = new URL(msg.SigningCertURL);
    if (certUrl.protocol !== "https:" || !SIGNING_CERT_HOST_RE.test(certUrl.hostname)) {
      return false;
    }

    const certRes = await fetch(certUrl.toString());
    if (!certRes.ok) return false;
    const cert = await certRes.text();

    const stringToSign = buildStringToSign(msg);
    const algorithm = msg.SignatureVersion === "2" ? "RSA-SHA256" : "RSA-SHA1";

    const verifier = crypto.createVerify(algorithm);
    verifier.update(stringToSign, "utf8");
    return verifier.verify(cert, msg.Signature, "base64");
  } catch {
    return false;
  }
}
