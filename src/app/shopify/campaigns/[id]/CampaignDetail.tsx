"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useAppBridge } from "@shopify/app-bridge-react";
import { ArrowLeft, Trash2, Send } from "lucide-react";
import CampaignWizard from "@/components/CampaignWizard";
import CampaignStatusBadge from "@/components/CampaignStatusBadge";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import TestSendModal from "@/components/TestSendModal";
import { audienceFilterLabel } from "@/lib/audience";

type Campaign = {
  id: string;
  name: string;
  subject: string;
  status: "draft" | "scheduled" | "sending" | "sent" | "failed";
  template_id: string | null;
  // Raw JSONB from the DB — old rows may still be the legacy { segment }
  // shape, so this is normalized wherever it's consumed (label helper,
  // wizard) rather than trusted here.
  audience_filter: unknown;
  scheduled_at: string | null;
  sent_at: string | null;
  recipient_count: number;
  created_at: string;
  templates: { name: string; subject: string | null } | null;
};

type Recipient = {
  id: string;
  status: string;
  error: string | null;
  created_at: string;
  contacts: { email: string; first_name: string | null; last_name: string | null } | null;
};

const EDITABLE_STATUSES = ["draft", "scheduled"];

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function CampaignDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const shopify = useAppBridge();
  const shop = new URLSearchParams(window.location.search).get("shop") || "";
  const toast = (msg: string, opts?: { isError?: boolean }) => shopify.toast.show(msg, opts);

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showTestSend, setShowTestSend] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/shopify/campaigns?shop=${shop}`);
      const data = await res.json();
      const found: Campaign | undefined = (data.campaigns || []).find((c: Campaign) => c.id === params.id);
      if (!found) { setNotFound(true); return; }
      setCampaign(found);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [params.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (campaign?.status !== "sent" && campaign?.status !== "failed") return;
    setLoadingRecipients(true);
    fetch(`/api/shopify/campaigns/${params.id}/recipients?shop=${shop}`)
      .then((res) => res.json())
      .then((data) => setRecipients(data.recipients || []))
      .catch(() => {})
      .finally(() => setLoadingRecipients(false));
  }, [campaign?.status, params.id, shop]);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/shopify/campaigns/${params.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop }),
      });
      const data = await res.json();
      if (res.ok) {
        toast("Campaign deleted ✅");
        router.push(`/shopify/campaigns?shop=${shop}`);
      } else {
        toast(data.error || "Delete failed", { isError: true });
      }
    } catch {
      toast("Delete failed", { isError: true });
    } finally {
      setDeleting(false);
      setShowDelete(false);
    }
  }

  if (loading) {
    return <div className="p-16 text-center text-gray-400 text-sm">Loading campaign...</div>;
  }

  if (notFound || !campaign) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <Link href={`/shopify/campaigns?shop=${shop}`} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700">
          <ArrowLeft size={14} /> Back to campaigns
        </Link>
        <div className="p-16 text-center text-gray-400 text-sm bg-white rounded-xl border border-gray-200">
          Campaign not found.
        </div>
      </div>
    );
  }

  const editable = EDITABLE_STATUSES.includes(campaign.status);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <Link href={`/shopify/campaigns?shop=${shop}`} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700">
        <ArrowLeft size={14} /> Back to campaigns
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">{campaign.name}</h1>
            <CampaignStatusBadge status={campaign.status} />
          </div>
          <p className="text-sm text-gray-400 mt-1">
            {editable
              ? "Draft and scheduled campaigns can still be edited."
              : campaign.status === "failed"
              ? "This campaign send failed for every recipient — see the recipient list below for error details."
              : "This campaign has been sent and is view-only."}
          </p>
        </div>
        {editable && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTestSend(true)}
              disabled={!campaign.template_id}
              title={campaign.template_id ? "Send a test copy of this campaign's email" : "Pick a template first"}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <Send size={14} /> Send Test
            </button>
            <button
              onClick={() => setShowDelete(true)}
              className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-500 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors"
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        )}
      </div>

      {editable ? (
        <CampaignWizard
          shop={shop}
          campaignId={campaign.id}
          initialName={campaign.name}
          initialSubject={campaign.subject}
          initialTemplateId={campaign.template_id}
          initialAudienceFilter={campaign.audience_filter}
          initialScheduledAt={campaign.scheduled_at}
          onSaved={load}
          showToast={toast}
        />
      ) : (
        <SentCampaignView campaign={campaign} recipients={recipients} loadingRecipients={loadingRecipients} />
      )}

      {showTestSend && (
        <TestSendModal
          shop={shop}
          campaignId={campaign.id}
          onClose={() => setShowTestSend(false)}
          showToast={toast}
        />
      )}

      {showDelete && (
        <DeleteConfirmModal
          title="Delete Campaign?"
          message={`"${campaign.name}" will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete Campaign"
          loading={deleting}
          onConfirm={handleDelete}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </div>
  );
}

function SentCampaignView({ campaign, recipients, loadingRecipients }: {
  campaign: Campaign;
  recipients: Recipient[];
  loadingRecipients: boolean;
}) {
  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-gray-200 p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryStat label="Template" value={campaign.templates?.name || "—"} />
        <SummaryStat label="Audience" value={audienceFilterLabel(campaign.audience_filter)} />
        <SummaryStat label="Recipients" value={String(campaign.recipient_count)} />
        <SummaryStat label="Sent" value={formatDate(campaign.sent_at)} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Analytics</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <SummaryStat label="Opens" value="—" />
          <SummaryStat label="Clicks" value="—" />
          <SummaryStat label="Bounces" value={String(recipients.filter((r) => r.status === "bounced").length)} />
          <SummaryStat label="Complaints" value={String(recipients.filter((r) => r.status === "complained").length)} />
          <SummaryStat label="Failed" value={String(recipients.filter((r) => r.status === "failed").length)} />
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Bounces/complaints come from real AWS SES/SNS notifications. Open/click tracking requires
          additional SES event tracking setup (not yet configured).
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recipients ({campaign.recipient_count})</p>
        </div>
        {loadingRecipients ? (
          <p className="p-8 text-center text-sm text-gray-400">Loading recipients...</p>
        ) : recipients.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400">No recipients recorded.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100">
              <tr>
                <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Contact</th>
                <th className="text-left px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recipients.map((r) => (
                <tr key={r.id}>
                  <td className="px-5 py-2.5">
                    <p className="text-gray-900">
                      {[r.contacts?.first_name, r.contacts?.last_name].filter(Boolean).join(" ") || "—"}
                    </p>
                    <p className="text-xs text-gray-400">{r.contacts?.email}</p>
                  </td>
                  <td className="px-5 py-2.5">
                    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold uppercase ${recipientStatusStyle(r.status)}`}>
                      {r.status}
                    </span>
                    {r.status === "failed" && r.error && (
                      <p className="text-[11px] text-red-500 mt-1 max-w-md">{r.error}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const RECIPIENT_STATUS_STYLES: Record<string, string> = {
  sent: "bg-green-100 text-green-700",
  delivered: "bg-green-100 text-green-700",
  bounced: "bg-red-100 text-red-700",
  complained: "bg-red-100 text-red-700",
  failed: "bg-gray-200 text-gray-600",
};

function recipientStatusStyle(status: string) {
  return RECIPIENT_STATUS_STYLES[status] || "bg-gray-100 text-gray-600";
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-900 mt-0.5">{value}</p>
    </div>
  );
}
