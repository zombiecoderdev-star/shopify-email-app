"use client";

import { useEffect, useState } from "react";
import { Plus, Mail, AlertTriangle, Calendar, Search, Tag, X } from "lucide-react";
import {
  AUDIENCE_SEGMENTS,
  audienceFilterLabel,
  normalizeAudienceFilter,
  type AudienceFilter,
  type AudienceSegmentId,
} from "@/lib/audience";
import Pagination, { usePagination } from "@/components/Pagination";

type TemplateOption = {
  id: string;
  name: string;
  subject: string | null;
  content?: { blocks?: unknown[] };
};

// The contact fields the "Specific contacts" picker needs — subscribed is
// kept so hand-picked unsubscribed contacts get a badge + warning.
type PickerContact = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  subscribed: boolean;
};

type Props = {
  shop: string;
  campaignId?: string; // present -> edit mode (PUT), absent -> create mode (POST)
  initialName?: string;
  initialSubject?: string;
  initialTemplateId?: string | null;
  // Raw DB value — may still be the legacy { segment } shape on old rows.
  initialAudienceFilter?: unknown;
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

function contactLabel(c: PickerContact) {
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email;
}

export default function CampaignWizard({
  shop,
  campaignId,
  initialName = "",
  initialSubject = "",
  initialTemplateId = null,
  initialAudienceFilter,
  initialScheduledAt = null,
  onSaved,
  showToast,
}: Props) {
  const [initialFilter] = useState<AudienceFilter>(() => normalizeAudienceFilter(initialAudienceFilter));

  const [step, setStep] = useState(1);
  const [name, setName] = useState(initialName);
  const [subject, setSubject] = useState(initialSubject);
  const [templateId, setTemplateId] = useState<string | null>(initialTemplateId);
  const [scheduledAt, setScheduledAt] = useState(
    initialScheduledAt ? toLocalInputValue(new Date(initialScheduledAt)) : ""
  );
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);

  // Audience selection is split by type so switching between the radio
  // options doesn't throw away a half-built tag/contact selection; the
  // stored AudienceFilter is assembled from whichever type is active.
  const [audienceType, setAudienceType] = useState<AudienceFilter["type"]>(initialFilter.type);
  const [segment, setSegment] = useState<AudienceSegmentId>(
    initialFilter.type === "segment" ? initialFilter.segment : "subscribed"
  );
  const [selectedTags, setSelectedTags] = useState<string[]>(
    initialFilter.type === "tag" ? initialFilter.tags : []
  );
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>(
    initialFilter.type === "contacts" ? initialFilter.contact_ids : []
  );
  // id -> details for chips + the unsubscribed warning; filled by the picker
  // as contacts are checked, and by a lookup fetch when editing a saved
  // "specific contacts" campaign.
  const [contactInfo, setContactInfo] = useState<Record<string, PickerContact>>({});

  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [audienceCounts, setAudienceCounts] = useState<Record<string, number> | null>(null);
  const [allTags, setAllTags] = useState<string[] | null>(null);
  const [tagCount, setTagCount] = useState<number | null>(null);

  const [saving, setSaving] = useState<"draft" | "schedule" | "send" | null>(null);

  const audienceFilter: AudienceFilter =
    audienceType === "tag"
      ? { type: "tag", tags: selectedTags }
      : audienceType === "contacts"
      ? { type: "contacts", contact_ids: selectedContactIds }
      : { type: "segment", segment };

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

    fetch(`/api/shopify/tags?shop=${shop}`)
      .then((res) => res.json())
      .then((data) => setAllTags(data.tags || []))
      .catch(() => setAllTags([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Editing a saved "specific contacts" campaign — look up the selected
  // contacts' details so the chips and unsubscribed warning can render.
  useEffect(() => {
    if (initialFilter.type !== "contacts" || initialFilter.contact_ids.length === 0) return;
    fetch(`/api/shopify/contacts?shop=${shop}&ids=${initialFilter.contact_ids.join(",")}`)
      .then((res) => res.json())
      .then((data) => {
        const info: Record<string, PickerContact> = {};
        for (const c of (data.contacts || []) as PickerContact[]) info[c.id] = c;
        setContactInfo((prev) => ({ ...info, ...prev }));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live recipient count for the tag audience — same resolveAudience logic
  // as the actual send (subscribed contacts whose tags overlap), debounced
  // while tags are toggled.
  useEffect(() => {
    if (audienceType !== "tag" || selectedTags.length === 0) {
      setTagCount(selectedTags.length === 0 ? 0 : null);
      return;
    }
    setTagCount(null);
    const timer = setTimeout(() => {
      fetch("/api/shopify/campaigns/audience-count", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop, audience_filter: { type: "tag", tags: selectedTags } }),
      })
        .then((res) => res.json())
        .then((data) => setTagCount(typeof data.count === "number" ? data.count : null))
        .catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [audienceType, selectedTags, shop]);

  // Prefill subject from the chosen template, once, without clobbering
  // anything the merchant already typed.
  useEffect(() => {
    if (!templateId || subject.trim()) return;
    const t = templates.find((x) => x.id === templateId);
    if (t?.subject) setSubject(t.subject);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, templates]);

  const selectedTemplate = templates.find((t) => t.id === templateId) || null;
  const selectedSegmentMeta = AUDIENCE_SEGMENTS.find((s) => s.id === segment);

  const unsubscribedSelected =
    audienceType === "contacts"
      ? selectedContactIds.filter((id) => contactInfo[id] && !contactInfo[id].subscribed)
      : [];

  const warnUnsubscribed =
    (audienceType === "segment" && !!selectedSegmentMeta?.warnUnsubscribed) ||
    unsubscribedSelected.length > 0;

  const recipientCount: number | null =
    audienceType === "segment"
      ? audienceCounts
        ? audienceCounts[segment] ?? 0
        : null
      : audienceType === "tag"
      ? tagCount
      : selectedContactIds.length;

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
    if (audienceType === "tag" && selectedTags.length === 0) {
      showToast("Select at least one tag", { isError: true });
      setStep(3);
      return false;
    }
    if (audienceType === "contacts" && selectedContactIds.length === 0) {
      showToast("Select at least one contact", { isError: true });
      setStep(3);
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
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed", { isError: true });
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
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Schedule failed", { isError: true });
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
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Send failed", { isError: true });
    } finally {
      setSaving(null);
    }
  }

  function toggleContact(c: PickerContact) {
    setContactInfo((prev) => ({ ...prev, [c.id]: c }));
    setSelectedContactIds((prev) =>
      prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id]
    );
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
          <div className="space-y-4 max-w-2xl">
            <div className="space-y-2">
              {AUDIENCE_SEGMENTS.map((seg) => {
                const active = audienceType === "segment" && segment === seg.id;
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
                        onChange={() => { setAudienceType("segment"); setSegment(seg.id); }}
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

              {/* By tag */}
              <div
                className={`border rounded-lg transition-colors ${
                  audienceType === "tag" ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <label className="flex items-center justify-between px-4 py-3 cursor-pointer">
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="audience-segment"
                      checked={audienceType === "tag"}
                      onChange={() => setAudienceType("tag")}
                      className="accent-blue-600"
                    />
                    <span className="text-sm text-gray-800">By tag</span>
                  </span>
                  {audienceType === "tag" && (
                    <span className="text-xs text-gray-500">
                      {selectedTags.length === 0 ? "pick tags below" : tagCount === null ? "…" : `${tagCount} contacts`}
                    </span>
                  )}
                </label>
                {audienceType === "tag" && (
                  <div className="px-4 pb-4 space-y-2">
                    {allTags === null ? (
                      <p className="text-xs text-gray-400">Loading tags...</p>
                    ) : allTags.length === 0 ? (
                      <p className="text-xs text-gray-400">
                        No tags yet — add tags to contacts on the Customers page first.
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {allTags.map((t) => {
                          const on = selectedTags.includes(t);
                          return (
                            <button
                              key={t}
                              type="button"
                              onClick={() =>
                                setSelectedTags((prev) =>
                                  on ? prev.filter((x) => x !== t) : [...prev, t]
                                )
                              }
                              className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full border transition-colors ${
                                on
                                  ? "bg-blue-600 text-white border-blue-600"
                                  : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
                              }`}
                            >
                              <Tag size={10} /> {t}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <p className="text-[11px] text-gray-400">
                      Reaches subscribed contacts with at least one of the selected tags —
                      unsubscribed contacts are always excluded.
                    </p>
                  </div>
                )}
              </div>

              {/* Specific contacts */}
              <div
                className={`border rounded-lg transition-colors ${
                  audienceType === "contacts" ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:bg-gray-50"
                }`}
              >
                <label className="flex items-center justify-between px-4 py-3 cursor-pointer">
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="audience-segment"
                      checked={audienceType === "contacts"}
                      onChange={() => setAudienceType("contacts")}
                      className="accent-blue-600"
                    />
                    <span className="text-sm text-gray-800">Specific contacts</span>
                  </span>
                  {audienceType === "contacts" && (
                    <span className="text-xs text-gray-500">
                      {selectedContactIds.length} selected
                    </span>
                  )}
                </label>
                {audienceType === "contacts" && (
                  <div className="px-4 pb-4 space-y-3">
                    {selectedContactIds.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedContactIds.map((id) => {
                          const c = contactInfo[id];
                          return (
                            <span
                              key={id}
                              className={`inline-flex items-center gap-1 pl-2 pr-1 py-0.5 text-xs font-medium rounded-full border ${
                                c && !c.subscribed
                                  ? "bg-red-50 text-red-700 border-red-200"
                                  : "bg-white text-gray-700 border-gray-300"
                              }`}
                            >
                              {c ? contactLabel(c) : id.slice(0, 8)}
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedContactIds((prev) => prev.filter((x) => x !== id))
                                }
                                title="Remove"
                                className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-gray-100"
                              >
                                <X size={10} />
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    )}
                    <ContactPicker
                      shop={shop}
                      selectedIds={selectedContactIds}
                      onToggle={toggleContact}
                    />
                    {unsubscribedSelected.length > 0 && (
                      <div className="bg-red-50 border border-red-300 rounded-lg p-3 flex items-start gap-2">
                        <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-red-700">
                          {unsubscribedSelected.length} selected contact{unsubscribedSelected.length > 1 ? "s are" : " is"}{" "}
                          unsubscribed — sending marketing email to them violates CAN-SPAM / GDPR / CASL.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-yellow-800 mb-1.5">GDPR / CASL Consent Check</p>
              <p className="text-xs text-yellow-700 leading-relaxed">
                Only send marketing emails to customers flagged with{" "}
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 border border-green-300">SUBSCRIBED</span>
                . Sending emails to unsubscribed accounts is a CAN-SPAM violation.
              </p>
            </div>

            {audienceType === "segment" && selectedSegmentMeta?.warnUnsubscribed && (
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
              <SummaryRow label="Audience" value={audienceFilterLabel(audienceFilter)} />
              <SummaryRow label="Recipients" value={recipientCount === null ? "…" : `${recipientCount} contacts`} />
            </div>

            {warnUnsubscribed && (
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

// ── Contact picker (Specific contacts audience) ─────────────────────────────
// Server-side search + pagination against /api/shopify/contacts so it works
// at any list size (the default contacts fetch caps at 100 rows). Uses the
// shared usePagination hook for page/perPage state; paginate() itself isn't
// used because the server already returns one page at a time.

function ContactPicker({
  shop,
  selectedIds,
  onToggle,
}: {
  shop: string;
  selectedIds: string[];
  onToggle: (c: PickerContact) => void;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [contacts, setContacts] = useState<PickerContact[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const { page, perPage, setPage, setPerPage } = usePagination(total, [debouncedSearch]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({
      shop,
      page: String(page),
      per_page: String(perPage),
    });
    if (debouncedSearch) params.set("search", debouncedSearch);
    fetch(`/api/shopify/contacts?${params}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        setContacts(data.contacts || []);
        setTotal(data.total || 0);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [shop, debouncedSearch, page, perPage]);

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="p-2 border-b border-gray-100">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts by name or email..."
            className="w-full pl-8 pr-3 py-1.5 text-xs text-gray-700 placeholder-gray-400 bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition-colors"
          />
        </div>
      </div>

      <div className="max-h-56 overflow-y-auto">
        {loading ? (
          <p className="p-6 text-center text-xs text-gray-400">Loading contacts...</p>
        ) : contacts.length === 0 ? (
          <p className="p-6 text-center text-xs text-gray-400">No contacts found.</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {contacts.map((c) => {
              const checked = selectedIds.includes(c.id);
              return (
                <li key={c.id}>
                  <label className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(c)}
                      className="accent-green-600 w-3.5 h-3.5 cursor-pointer"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-xs font-medium text-gray-900 truncate">{contactLabel(c)}</span>
                      <span className="block text-[11px] text-gray-400 truncate">{c.email}</span>
                    </span>
                    {!c.subscribed && (
                      <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-600 flex-shrink-0">
                        UNSUBSCRIBED
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Pagination page={page} perPage={perPage} total={total} onPageChange={setPage} onPerPageChange={setPerPage} />
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
