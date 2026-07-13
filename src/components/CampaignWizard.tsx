"use client";

import { useEffect, useState } from "react";
import { Plus, Mail, AlertTriangle, Calendar } from "lucide-react";
import { AUDIENCE_SEGMENTS, audienceSegmentLabel, type AudienceFilter } from "@/lib/audience";

type TemplateOption = {
  id: string;
  name: string;
  subject: string | null;
  content?: { blocks?: unknown[] };
};

type Props = {
  shop: string;
  campaignId?: string; // present -> edit mode (PUT), absent -> create mode (POST)
  initialName?: string;
  initialSubject?: string;
  initialTemplateId?: string | null;
  initialAudienceFilter?: AudienceFilter;
  initialScheduledAt?: string | null;
  onSaved: () => void;
  showToast: (msg: string, opts?: { isError?: boolean }) => void;
};

const STEPS = [
  { n: 1, label: "Basics" },
  { n: 2, label: "Template" },
  { n: 3, label: "Audience" },
  { n: 4, label: "Review & Send" },
];

function toLocalInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export default function CampaignWizard({
  shop,
  campaignId,
  initialName = "",
  initialSubject = "",
  initialTemplateId = null,
  initialAudienceFilter = { segment: "subscribed" },
  initialScheduledAt = null,
  onSaved,
  showToast,
}: Props) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState(initialName);
  const [subject, setSubject] = useState(initialSubject);
  const [templateId, setTemplateId] = useState<string | null>(initialTemplateId);
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>(initialAudienceFilter);
  const [scheduledAt, setScheduledAt] = useState(
    initialScheduledAt ? toLocalInputValue(new Date(initialScheduledAt)) : ""
  );
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);

  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [audienceCounts, setAudienceCounts] = useState<Record<string, number> | null>(null);

  const [saving, setSaving] = useState<"draft" | "schedule" | "send" | null>(null);

  useEffect(() => {
    fetch(`/api/shopify/templates?shop=${shop}`)
      .then((res) => res.json())
      .then((data) => setTemplates(data.templates || []))
      .catch(() => showToast("Failed to load templates", { isError: true }))
      .finally(() => setLoadingTemplates(false));

    fetch(`/api/shopify/campaigns/audience-count?shop=${shop}`)
      .then((res) => res.json())
      .then((data) => setAudienceCounts(data.counts || null))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prefill subject from the chosen template, once, without clobbering
  // anything the merchant already typed.
  useEffect(() => {
    if (!templateId || subject.trim()) return;
    const t = templates.find((x) => x.id === templateId);
    if (t?.subject) setSubject(t.subject);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, templates]);

  const selectedTemplate = templates.find((t) => t.id === templateId) || null;
  const selectedSegmentMeta = AUDIENCE_SEGMENTS.find((s) => s.id === audienceFilter.segment);
  const recipientCount = audienceCounts ? audienceCounts[audienceFilter.segment] ?? 0 : null;

  function canReachStep(n: number) {
    if (n <= 1) return true;
    if (n === 2) return name.trim().length > 0;
    return name.trim().length > 0 && !!templateId;
  }

  function validate() {
    if (!name.trim()) {
      showToast("Campaign name is required", { isError: true });
      setStep(1);
      return false;
    }
    if (!templateId) {
      showToast("Choose a template", { isError: true });
      setStep(2);
      return false;
    }
    if (!subject.trim()) {
      showToast("Subject line is required", { isError: true });
      setStep(1);
      return false;
    }
    return true;
  }

  async function persistCampaign(status: string, scheduled_at: string | null) {
    const res = await fetch(
      campaignId ? `/api/shopify/campaigns/${campaignId}` : "/api/shopify/campaigns",
      {
        method: campaignId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop,
          name: name.trim(),
          subject: subject.trim(),
          template_id: templateId,
          audience_filter: audienceFilter,
          status,
          scheduled_at,
        }),
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Save failed");
    return data.campaign;
  }

  async function handleSaveDraft() {
    if (!validate()) return;
    setSaving("draft");
    try {
      await persistCampaign("draft", null);
      showToast("Campaign saved as draft ✅");
      onSaved();
    } catch (err: any) {
      showToast(err.message || "Save failed", { isError: true });
    } finally {
      setSaving(null);
    }
  }

  async function handleConfirmSchedule() {
    if (!validate()) return;
    if (!scheduledAt) {
      showToast("Pick a date and time", { isError: true });
      return;
    }
    setSaving("schedule");
    try {
      await persistCampaign("scheduled", new Date(scheduledAt).toISOString());
      showToast("Campaign scheduled ✅");
      onSaved();
    } catch (err: any) {
      showToast(err.message || "Schedule failed", { isError: true });
    } finally {
      setSaving(null);
    }
  }

  async function handleSendNow() {
    if (!validate()) return;
    setSaving("send");
    try {
      const campaign = await persistCampaign("sending", null);
      const res = await fetch("/api/shopify/campaigns/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign_id: campaign.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Send failed");
      showToast(data.message);
      onSaved();
    } catch (err: any) {
      showToast(err.message || "Send failed", { isError: true });
    } finally {
      setSaving(null);
    }
  }

  const busy = saving !== null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

      {/* Stepper */}
      <div className="flex items-center px-5 py-4 border-b border-gray-100">
        {STEPS.map((s, i) => {
          const reachable = canReachStep(s.n);
          const active = step === s.n;
          return (
            <div key={s.n} className="flex items-center flex-1 last:flex-none">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => setStep(s.n)}
                className="flex items-center gap-2 disabled:cursor-not-allowed"
              >
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${
                    active
                      ? "bg-green-600 text-white"
                      : reachable
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {s.n}
                </span>
                <span className={`text-sm font-medium whitespace-nowrap ${active ? "text-gray-900" : reachable ? "text-gray-500" : "text-gray-300"}`}>
                  {s.label}
                </span>
              </button>
              {i < STEPS.length - 1 && <div className="flex-1 h-px bg-gray-200 mx-3" />}
            </div>
          );
        })}
      </div>

      <div className="p-5">
        {/* Step 1 — Basics */}
        {step === 1 && (
          <div className="space-y-4 max-w-lg">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Campaign Name<span className="text-red-400 ml-0.5">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Spring Sale Blast"
                className="w-full px-3 py-2 text-sm border border-gray-200 bg-gray-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Subject Line<span className="text-red-400 ml-0.5">*</span>
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Prefills once you pick a template — still editable"
                className="w-full px-3 py-2 text-sm border border-gray-200 bg-gray-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition-colors"
              />
            </div>
            <div className="flex justify-end pt-2">
              <button
                disabled={!canReachStep(2)}
                onClick={() => setStep(2)}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                Next: Template
              </button>
            </div>
          </div>
        )}

        {/* Step 2 — Template */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Choose a template for this campaign.</p>
              <a
                href={`/shopify/templates/new?shop=${shop}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-sm text-green-600 hover:text-green-700"
              >
                <Plus size={13} /> Create new template
              </a>
            </div>

            {loadingTemplates ? (
              <p className="text-sm text-gray-400 py-8 text-center">Loading templates...</p>
            ) : templates.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">
                No templates yet — create one first (opens in a new tab, your progress here stays).
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {templates.map((t) => {
                  const active = templateId === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTemplateId(t.id)}
                      className={`text-left border rounded-xl p-4 transition-colors ${
                        active ? "border-green-500 bg-green-50 ring-2 ring-green-200" : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="w-9 h-9 rounded-lg bg-green-100 flex items-center justify-center mb-2">
                        <Mail size={16} className="text-green-700" />
                      </div>
                      <p className="font-medium text-gray-900 text-sm">{t.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5 truncate">{t.subject || "No subject"}</p>
                      <p className="text-[11px] text-gray-300 mt-1">{t.content?.blocks?.length ?? 0} blocks</p>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(1)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                Back
              </button>
              <button
                disabled={!canReachStep(3)}
                onClick={() => setStep(3)}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                Next: Audience
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Audience */}
        {step === 3 && (
          <div className="space-y-4 max-w-lg">
            <div className="space-y-2">
              {AUDIENCE_SEGMENTS.map((seg) => {
                const active = audienceFilter.segment === seg.id;
                return (
                  <label
                    key={seg.id}
                    className={`flex items-center justify-between px-4 py-3 border rounded-lg cursor-pointer transition-colors ${
                      active ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="audience-segment"
                        checked={active}
                        onChange={() => setAudienceFilter({ segment: seg.id })}
                        className="accent-blue-600"
                      />
                      <span className="text-sm text-gray-800">{seg.label}</span>
                    </span>
                    <span className="text-xs text-gray-500">
                      {audienceCounts ? `${audienceCounts[seg.id] ?? 0} contacts` : "…"}
                    </span>
                  </label>
                );
              })}
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-yellow-800 mb-1.5">GDPR / CASL Consent Check</p>
              <p className="text-xs text-yellow-700 leading-relaxed">
                Only send marketing emails to customers flagged with{" "}
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 border border-green-300">SUBSCRIBED</span>
                . Sending emails to unsubscribed accounts is a CAN-SPAM violation.
              </p>
            </div>

            {selectedSegmentMeta?.warnUnsubscribed && (
              <div className="bg-red-50 border border-red-300 rounded-xl p-4 flex items-start gap-2">
                <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700 leading-relaxed">
                  This segment includes unsubscribed contacts. Sending marketing email to them violates
                  CAN-SPAM / GDPR / CASL — double check this is intentional before sending.
                </p>
              </div>
            )}

            <div className="flex justify-between pt-2">
              <button onClick={() => setStep(2)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                Back
              </button>
              <button onClick={() => setStep(4)} className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors">
                Next: Review
              </button>
            </div>
          </div>
        )}

        {/* Step 4 — Review & Send */}
        {step === 4 && (
          <div className="space-y-4 max-w-lg">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-2.5 text-sm">
              <SummaryRow label="Campaign name" value={name || "—"} />
              <SummaryRow label="Subject" value={subject || "—"} />
              <SummaryRow label="Template" value={selectedTemplate?.name || "—"} />
              <SummaryRow label="Audience" value={audienceSegmentLabel(audienceFilter)} />
              <SummaryRow label="Recipients" value={recipientCount === null ? "…" : `${recipientCount} contacts`} />
            </div>

            {selectedSegmentMeta?.warnUnsubscribed && (
              <div className="bg-red-50 border border-red-300 rounded-xl p-3 flex items-start gap-2">
                <AlertTriangle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-700">This audience includes unsubscribed contacts.</p>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 flex-wrap gap-3">
              <button onClick={() => setStep(3)} disabled={busy} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors">
                Back
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveDraft}
                  disabled={busy}
                  className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  {saving === "draft" ? "Saving..." : "Save as Draft"}
                </button>

                <div className="relative">
                  <button
                    onClick={() => setShowSchedulePicker((v) => !v)}
                    disabled={busy}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    <Calendar size={14} /> Schedule for later
                  </button>
                  {showSchedulePicker && (
                    <div className="absolute right-0 bottom-full mb-2 z-20 w-64 bg-white border border-gray-200 rounded-lg shadow-lg p-3 space-y-2">
                      <input
                        type="datetime-local"
                        value={scheduledAt}
                        min={toLocalInputValue(new Date())}
                        onChange={(e) => setScheduledAt(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-md bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition-colors"
                      />
                      <button
                        onClick={handleConfirmSchedule}
                        disabled={!scheduledAt || busy}
                        className="w-full px-2.5 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {saving === "schedule" ? "Scheduling..." : "Confirm Schedule"}
                      </button>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleSendNow}
                  disabled={busy}
                  className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {saving === "send" ? "Sending..." : "Send Now"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  );
}
