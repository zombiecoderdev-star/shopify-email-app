"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  Plus, Eye, Trash2, Send,
  ChevronUp, ChevronDown, ChevronsUpDown,
} from "lucide-react";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import ConfirmActionModal from "@/components/ConfirmActionModal";
import CampaignStatusBadge from "@/components/CampaignStatusBadge";
import Pagination, { usePagination } from "@/components/Pagination";

type Campaign = {
  id: string;
  name: string;
  status: "draft" | "scheduled" | "sending" | "sent" | "failed";
  scheduled_at: string | null;
  sent_at: string | null;
  recipient_count: number;
  created_at: string;
  templates: { name: string } | null;
};

type SortKey = "name" | "status" | "date";
type SortDir = "asc" | "desc" | null;

const COLUMNS: { label: string; key: SortKey }[] = [
  { label: "Name",   key: "name" },
  { label: "Status", key: "status" },
];

const EDITABLE_STATUSES = ["draft", "scheduled"];
const TERMINAL_STATUSES = ["sent", "failed"];
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 60000;

function campaignDate(c: Campaign) {
  return c.sent_at || c.scheduled_at || c.created_at;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function Campaigns() {
  const shopify = useAppBridge();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [deleteCampaign, setDeleteCampaign] = useState<Campaign | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [sendCampaignTarget, setSendCampaignTarget] = useState<Campaign | null>(null);
  const [sendingCampaign, setSendingCampaign] = useState(false);

  const shop = new URLSearchParams(window.location.search).get("shop") || "";
  const toast = (msg: string, opts?: { isError?: boolean }) => shopify.toast.show(msg, opts);

  // Active poll intervals, keyed by campaign id, so a component unmount
  // (e.g. navigating away mid-send) can clear all of them.
  const pollTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  useEffect(() => {
    return () => {
      Object.values(pollTimers.current).forEach(clearInterval);
    };
  }, []);

  function stopPolling(campaignId: string) {
    const timer = pollTimers.current[campaignId];
    if (timer) {
      clearInterval(timer);
      delete pollTimers.current[campaignId];
    }
  }

  // Lightweight polling for live status while a send is in flight — the
  // /send POST itself already resolves with the final status, but this
  // covers the badge in case the request takes a while.
  function pollCampaignStatus(campaignId: string) {
    stopPolling(campaignId);
    const startedAt = Date.now();
    pollTimers.current[campaignId] = setInterval(async () => {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        stopPolling(campaignId);
        return;
      }
      try {
        const res = await fetch(`/api/shopify/campaigns?shop=${shop}`);
        const data = await res.json();
        const match: Campaign | undefined = (data.campaigns || []).find((c: Campaign) => c.id === campaignId);
        if (match && TERMINAL_STATUSES.includes(match.status)) {
          stopPolling(campaignId);
          setCampaigns((prev) => prev.map((x) => (x.id === campaignId ? match : x)));
        }
      } catch {
        // transient network hiccup — keep polling until timeout
      }
    }, POLL_INTERVAL_MS);
  }

  async function loadCampaigns() {
    setLoading(true);
    try {
      const res = await fetch(`/api/shopify/campaigns?shop=${shop}`);
      const data = await res.json();
      setCampaigns(data.campaigns || []);
    } catch {
      toast("Failed to load campaigns", { isError: true });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadCampaigns(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSort(key: SortKey) {
    if (sortKey !== key) { setSortKey(key); setSortDir("asc"); }
    else if (sortDir === "asc") setSortDir("desc");
    else { setSortKey(null); setSortDir(null); }
  }

  function getSorted(list: Campaign[]) {
    if (!sortKey || !sortDir) return list;
    return [...list].sort((a, b) => {
      let av = "", bv = "";
      if (sortKey === "name") { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (sortKey === "status") { av = a.status; bv = b.status; }
      else if (sortKey === "date") { av = campaignDate(a); bv = campaignDate(b); }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }

  const sorted = getSorted(campaigns);
  const { page, perPage, setPage, setPerPage, paginate } = usePagination(sorted.length, [sortKey, sortDir]);
  const paginated = paginate(sorted);

  async function handleSend(c: Campaign) {
    const previousStatus = c.status;
    setSendingCampaign(true);
    // Optimistic flip — badge shows "Sending" immediately instead of
    // lingering on the pre-send status until the POST resolves.
    setCampaigns((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: "sending" } : x)));
    pollCampaignStatus(c.id);
    try {
      const res = await fetch(`/api/shopify/campaigns/${c.id}/send?shop=${shop}`, { method: "POST" });
      const data = await res.json();
      stopPolling(c.id);
      if (res.ok) {
        toast(data.message); // includes sent/failed counts
      } else {
        toast(data.error || "Send failed", { isError: true });
        // Business-logic failure (e.g. 409 double-send, 400 not sendable) —
        // the campaign never actually transitioned server-side, so revert.
        setCampaigns((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: previousStatus } : x)));
      }
      await loadCampaigns(); // status changed either way (sent/failed) — refresh
    } catch {
      stopPolling(c.id);
      toast("Send failed", { isError: true });
      setCampaigns((prev) => prev.map((x) => (x.id === c.id ? { ...x, status: previousStatus } : x)));
    } finally {
      setSendingCampaign(false);
      setSendCampaignTarget(null);
    }
  }

  async function handleDelete(c: Campaign) {
    setDeleting(true);
    try {
      const res = await fetch(`/api/shopify/campaigns/${c.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop }),
      });
      const data = await res.json();
      if (res.ok) {
        toast("Campaign deleted ✅");
        setCampaigns((prev) => prev.filter((x) => x.id !== c.id));
      } else {
        toast(data.error || "Delete failed", { isError: true });
      }
    } catch {
      toast("Delete failed", { isError: true });
    } finally {
      setDeleting(false);
      setDeleteCampaign(null);
    }
  }

  return (
    <div className="p-6">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
          <p className="text-sm text-gray-400 mt-1">
            One-off broadcasts — pick a template, pick an audience, save a draft, schedule, or send.
          </p>
        </div>
        <Link
          href={`/shopify/campaigns/new?shop=${shop}`}
          className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
        >
          <Plus size={14} /> New Campaign
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">
        <div className="flex-1">
          {loading ? (
            <div className="p-16 text-center text-gray-400 text-sm">Loading campaigns...</div>
          ) : paginated.length === 0 ? (
            <div className="p-16 text-center text-gray-400 text-sm">No campaigns yet — create your first one.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100">
                <tr>
                  {COLUMNS.map(({ label, key }) => (
                    <th key={key} className="text-left px-4 py-3">
                      <button
                        onClick={() => handleSort(key)}
                        className="flex items-center gap-1 group text-xs font-semibold text-gray-400 uppercase tracking-wide hover:text-gray-700 transition-colors"
                      >
                        {label}
                        <SortIcon active={sortKey === key} dir={sortKey === key ? sortDir : null} />
                      </button>
                    </th>
                  ))}
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Template</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Recipients</th>
                  <th className="text-left px-4 py-3">
                    <button
                      onClick={() => handleSort("date")}
                      className="flex items-center gap-1 group text-xs font-semibold text-gray-400 uppercase tracking-wide hover:text-gray-700 transition-colors"
                    >
                      Scheduled / Sent
                      <SortIcon active={sortKey === "date"} dir={sortKey === "date" ? sortDir : null} />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginated.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center flex-shrink-0">
                          <Send size={14} className="text-green-700" />
                        </div>
                        <p className="font-medium text-gray-900">{c.name}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3"><CampaignStatusBadge status={c.status} /></td>
                    <td className="px-4 py-3 text-gray-500">{c.templates?.name || "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{c.status === "sent" || c.status === "failed" ? c.recipient_count : "—"}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {c.status === "sent" ? formatDate(c.sent_at) : c.status === "scheduled" ? formatDate(c.scheduled_at) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <ActionBtn title="View/Edit campaign" href={`/shopify/campaigns/${c.id}?shop=${shop}`} className="hover:bg-blue-50 hover:text-blue-600">
                          <Eye size={14} />
                        </ActionBtn>
                        {EDITABLE_STATUSES.includes(c.status) && (
                          <>
                            <ActionBtn title="Send campaign now" onClick={() => setSendCampaignTarget(c)} className="hover:bg-green-50 hover:text-green-600">
                              <Send size={14} />
                            </ActionBtn>
                            <ActionBtn title="Delete campaign" onClick={() => setDeleteCampaign(c)} className="hover:bg-red-50 hover:text-red-500">
                              <Trash2 size={14} />
                            </ActionBtn>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <Pagination page={page} perPage={perPage} total={sorted.length} onPageChange={setPage} onPerPageChange={setPerPage} />
      </div>

      {sendCampaignTarget && (
        <ConfirmActionModal
          title="Send Campaign Now?"
          message={`"${sendCampaignTarget.name}" will be sent immediately via email to every subscribed contact in its audience. This cannot be undone.`}
          confirmLabel="Send Campaign"
          loadingLabel="Sending..."
          tone="success"
          loading={sendingCampaign}
          onConfirm={() => handleSend(sendCampaignTarget)}
          onCancel={() => setSendCampaignTarget(null)}
        />
      )}

      {deleteCampaign && (
        <DeleteConfirmModal
          title="Delete Campaign?"
          message={`"${deleteCampaign.name}" will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete Campaign"
          loading={deleting}
          onConfirm={() => handleDelete(deleteCampaign)}
          onCancel={() => setDeleteCampaign(null)}
        />
      )}
    </div>
  );
}

function ActionBtn({ children, onClick, href, title, className }: {
  children: React.ReactNode; onClick?: () => void; href?: string; title: string; className?: string;
}) {
  const cls = `w-7 h-7 flex items-center justify-center rounded-md text-gray-400 transition-colors ${className}`;
  if (href) {
    return <Link href={href} title={title} className={cls}>{children}</Link>;
  }
  return (
    <button onClick={onClick} title={title} className={cls}>
      {children}
    </button>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active || !dir) return <ChevronsUpDown size={13} className="text-gray-300 group-hover:text-gray-500" />;
  return dir === "asc" ? <ChevronUp size={13} className="text-green-600" /> : <ChevronDown size={13} className="text-green-600" />;
}
