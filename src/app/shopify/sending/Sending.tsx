"use client";

import { useEffect, useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { Send, AlertTriangle, CheckCircle2, Loader2, HelpCircle } from "lucide-react";

type StatusResponse = {
  provider: string | null;
  fromEmail: string | null;
  sandbox: { likelyInSandbox: boolean; max24HourSend: number; maxSendRate: number; sentLast24Hours: number } | null;
  sandboxCheckError: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Sending() {
  const shopify = useAppBridge();
  const shop = new URLSearchParams(window.location.search).get("shop") || "";
  const toast = (msg: string, opts?: { isError?: boolean }) => shopify.toast.show(msg, opts);

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    fetch("/api/shopify/sending/status")
      .then((res) => res.json())
      .then(setStatus)
      .catch(() => toast("Failed to load ESP status", { isError: true }))
      .finally(() => setLoadingStatus(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSendTest() {
    if (!EMAIL_RE.test(testEmail)) {
      toast("Enter a valid email address", { isError: true });
      return;
    }
    setSendingTest(true);
    try {
      const res = await fetch("/api/shopify/templates/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop, test_email: testEmail }),
      });
      const data = await res.json();
      if (res.ok) {
        toast(data.message);
      } else {
        toast(data.error || "Test send failed", { isError: true });
      }
    } catch {
      toast("Something went wrong", { isError: true });
    } finally {
      setSendingTest(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Sending & ESP</h1>
        <p className="text-sm text-gray-400 mt-1">
          Email sending provider configuration. Set via environment variables — not editable from this page.
        </p>
      </div>

      {/* Current config */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Current Configuration</p>
        {loadingStatus ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400">Provider</p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5">
                {status?.provider || <span className="text-red-500">Not configured (ESP_PROVIDER)</span>}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400">From Address</p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5">
                {status?.fromEmail || <span className="text-red-500">Not configured (AWS_SES_FROM_EMAIL)</span>}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Sandbox status */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">AWS SES Sandbox Status</p>

        {loadingStatus ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : status?.sandbox ? (
          <div className="space-y-2">
            <div
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                status.sandbox.likelyInSandbox ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-700"
              }`}
            >
              {status.sandbox.likelyInSandbox ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
              {status.sandbox.likelyInSandbox ? "Likely still in sandbox mode" : "Production access likely granted"}
            </div>
            <p className="text-xs text-gray-400">
              Based on your SES send quota — {status.sandbox.max24HourSend}/day max,{" "}
              {status.sandbox.maxSendRate}/sec rate, {status.sandbox.sentLast24Hours} sent in the last 24h.
              This is a heuristic (AWS's default sandbox quota is exactly 200/day at 1/sec) — not a guaranteed
              signal from AWS.
            </p>
          </div>
        ) : status?.sandboxCheckError ? (
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <HelpCircle size={14} className="flex-shrink-0 mt-0.5" />
            <span>Could not determine sandbox status: {status.sandboxCheckError}</span>
          </div>
        ) : null}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800 leading-relaxed">
          <p className="font-semibold mb-1">What sandbox mode means</p>
          Every new AWS SES account starts in sandbox mode: it can only send to email addresses/domains you've
          manually verified in the SES console. Real campaign sends to unverified recipients will fail until AWS
          grants production access. Request it in the SES console under <em>Account dashboard → Request production
          access</em> — approval is usually granted within 24 hours.
        </div>
      </div>

      {/* Test send */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Test Connection</p>
        <p className="text-xs text-gray-400">
          Sends a simple, template-less test email to verify the AWS connection works — independent of any
          saved template. While in sandbox mode, the recipient address must be verified in SES.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="you@example.com"
            className="flex-1 px-3 py-2 text-sm border border-gray-200 bg-gray-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition-colors"
          />
          <button
            onClick={handleSendTest}
            disabled={sendingTest || !testEmail}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors flex-shrink-0"
          >
            {sendingTest ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            {sendingTest ? "Sending..." : "Send Test"}
          </button>
        </div>
      </div>
    </div>
  );
}
