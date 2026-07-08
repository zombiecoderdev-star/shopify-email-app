"use client";

import { useState, useEffect } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  Search, RefreshCw, Plus, Filter,
  ChevronUp, ChevronDown, ChevronsUpDown,
} from "lucide-react";
import AddCustomerModal from "@/components/AddCustomerModal";

type Contact = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  orders_count: number;
  total_spent: number;
  subscribed: boolean;
  tags: string[];
  shopify_customer_id: string;
};

type SortKey = "name" | "status" | "orders_count" | "total_spent";
type SortDir = "asc" | "desc" | null;

const SEGMENTS = [
  { label: "All Contacts",         filter: () => true },
  { label: "Email Subscribers",    filter: (c: Contact) => c.subscribed },
  { label: "VIP Spenders ($400+)", filter: (c: Contact) => c.total_spent >= 400 },
  { label: "Frequent Buyers (3+)", filter: (c: Contact) => c.orders_count >= 3 },
  { label: "Unsubscribed list",    filter: (c: Contact) => !c.subscribed },
];

const COLUMNS: { label: string; key: SortKey | null }[] = [
  { label: "Customer Name",  key: "name" },
  { label: "Status",         key: "status" },
  { label: "Tags",           key: null },
  { label: "Shopify ID",     key: null },
  { label: "Orders / Spent", key: "orders_count" },
];

export default function Customers() {
  const shopify = useAppBridge();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [activeSegment, setActiveSegment] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const shop = new URLSearchParams(window.location.search).get("shop") || "";

  async function loadContacts() {
    setLoading(true);
    try {
      const res = await fetch(`/api/shopify/contacts?shop=${shop}`);
      const data = await res.json();
      setContacts(data.contacts || []);
    } catch {
      shopify.toast.show("Failed to load contacts", { isError: true });
    } finally {
      setLoading(false);
    }
  }

  async function syncCustomers() {
    setSyncing(true);
    try {
      const res = await fetch("/api/shopify/sync-customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop }),
      });
      const data = await res.json();
      if (data.success) {
        shopify.toast.show(`Synced ${data.synced} customers ✅`);
        await loadContacts();
      } else {
        shopify.toast.show("Sync failed: " + data.error, { isError: true });
      }
    } catch {
      shopify.toast.show("Sync failed", { isError: true });
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => { loadContacts(); }, []);

  function handleSort(key: SortKey) {
    if (sortKey !== key) { setSortKey(key); setSortDir("asc"); }
    else if (sortDir === "asc") setSortDir("desc");
    else { setSortKey(null); setSortDir(null); }
  }

  function getSorted(list: Contact[]) {
    if (!sortKey || !sortDir) return list;
    return [...list].sort((a, b) => {
      let av: string | number = 0, bv: string | number = 0;
      if (sortKey === "name") {
        av = [a.first_name, a.last_name].filter(Boolean).join(" ").toLowerCase() || a.email;
        bv = [b.first_name, b.last_name].filter(Boolean).join(" ").toLowerCase() || b.email;
      } else if (sortKey === "status") { av = a.subscribed ? 1 : 0; bv = b.subscribed ? 1 : 0; }
      else if (sortKey === "orders_count") { av = a.orders_count; bv = b.orders_count; }
      else if (sortKey === "total_spent") { av = a.total_spent; bv = b.total_spent; }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }

  const filtered = getSorted(
    contacts
      .filter(SEGMENTS[activeSegment].filter)
      .filter((c) => {
        const q = search.toLowerCase();
        return (
          c.email?.toLowerCase().includes(q) ||
          c.first_name?.toLowerCase().includes(q) ||
          c.last_name?.toLowerCase().includes(q) ||
          c.tags?.some((t) => t.toLowerCase().includes(q))
        );
      })
  );

  return (
    <div className="p-6">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customers & Segments</h1>
          <p className="text-sm text-gray-400 mt-1">
            View Shopify customers, build high-converting subscription segments, and verify email consent logs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Plus size={14} />
            Add Customer
          </button>
          <button
            onClick={syncCustomers}
            disabled={syncing}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing..." : "Sync Customers"}
          </button>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex gap-4">

        {/* Left panel */}
        <div className="w-64 flex-shrink-0 space-y-3">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-1.5">
                <Filter size={12} className="text-gray-400" />
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Audience Segments
                </p>
              </div>
            </div>
            <div className="py-1">
              {SEGMENTS.map((seg, i) => {
                const count = contacts.filter(seg.filter).length;
                const active = activeSegment === i;
                return (
                  <button
                    key={i}
                    onClick={() => setActiveSegment(i)}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${
                      active
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <span>{seg.label}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      active ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-400"
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-yellow-800 mb-1.5">GDPR / CASL Consent Check</p>
            <p className="text-xs text-yellow-700 leading-relaxed">
              Only send marketing emails to customers flagged with{" "}
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700 border border-green-300">
                SUBSCRIBED
              </span>
              . Sending emails to unsubscribed accounts is a CAN-SPAM violation.
            </p>
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-3 border-b border-gray-100">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search customers by name, email, or Shopify tags..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm text-gray-700 placeholder-gray-400 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition-colors"
              />
            </div>
          </div>

          {loading ? (
            <div className="p-16 text-center text-gray-400 text-sm">Loading contacts...</div>
          ) : filtered.length === 0 ? (
            <div className="p-16 text-center text-gray-400 text-sm">
              No customers found matching the search or segment criteria.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100">
                <tr>
                  {COLUMNS.map(({ label, key }) => (
                    <th key={label} className="text-left px-4 py-3">
                      {key ? (
                        <button
                          onClick={() => handleSort(key)}
                          className="flex items-center gap-1 group text-xs font-semibold text-gray-400 uppercase tracking-wide hover:text-gray-700 transition-colors"
                        >
                          {label}
                          <SortIcon active={sortKey === key} dir={sortKey === key ? sortDir : null} />
                        </button>
                      ) : (
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                          {label}
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-xs font-bold text-green-700 flex-shrink-0">
                          {(c.first_name?.[0] || c.email?.[0] || "?").toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            {[c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                          </p>
                          <p className="text-xs text-gray-400">{c.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${
                        c.subscribed ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}>
                        {c.subscribed ? "SUBSCRIBED" : "UNSUBSCRIBED"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {c.tags?.length > 0
                          ? c.tags.slice(0, 2).map((tag) => (
                              <span key={tag} className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">
                                {tag}
                              </span>
                            ))
                          : <span className="text-gray-300 text-xs">—</span>
                        }
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs font-mono">
                      #{c.shopify_customer_id}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {c.orders_count} orders / ${parseFloat(String(c.total_spent)).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add Customer Modal */}
      {showAddModal && (
        <AddCustomerModal
          shop={shop}
          onClose={() => setShowAddModal(false)}
          onSuccess={loadContacts}
          showToast={(msg, opts) => shopify.toast.show(msg, opts)}
        />
      )}
    </div>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active || !dir) return <ChevronsUpDown size={13} className="text-gray-300 group-hover:text-gray-500" />;
  return dir === "asc"
    ? <ChevronUp size={13} className="text-green-600" />
    : <ChevronDown size={13} className="text-green-600" />;
}
