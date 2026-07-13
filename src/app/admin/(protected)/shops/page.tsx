"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Search, Download, Eye, Power, Users, Store,
  CheckCircle, XCircle, ChevronUp, ChevronDown, ChevronsUpDown,
} from "lucide-react";
import Pagination, { usePagination } from "@/components/Pagination";
import ConfirmActionModal from "@/components/ConfirmActionModal";

type Shop = {
  id: string;
  shop_domain: string;
  shop_owner_email: string | null;
  billing_plan_name: string | null;
  is_active: boolean;
  installed_at: string;
  uninstalled_at: string | null;
  last_synced_at: string | null;
  contact_count: number;
};

type SortKey =
  | "shop_domain" | "shop_owner_email" | "billing_plan_name"
  | "contact_count" | "is_active" | "installed_at" | "last_synced_at";
type SortDir = "asc" | "desc" | null;

const COLUMNS: { label: string; key: SortKey | null }[] = [
  { label: "Shop",         key: "shop_domain" },
  { label: "Owner",        key: "shop_owner_email" },
  { label: "Plan",         key: "billing_plan_name" },
  { label: "Contacts",     key: "contact_count" },
  { label: "Status",       key: "is_active" },
  { label: "Installed",    key: "installed_at" },
  { label: "Last Synced",  key: "last_synced_at" },
];

const STATUS_FILTERS: { label: string; match: (s: Shop) => boolean }[] = [
  { label: "All",         match: () => true },
  { label: "Active",      match: (s) => s.is_active && !s.uninstalled_at },
  { label: "Inactive",    match: (s) => !s.is_active && !s.uninstalled_at },
  { label: "Uninstalled", match: (s) => !!s.uninstalled_at },
];

function shopName(domain: string) {
  return domain.replace(".myshopify.com", "");
}

function fmtDate(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function AdminShopsPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [confirmShop, setConfirmShop] = useState<Shop | null>(null);

  async function loadShops() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/shops");
      const data = await res.json();
      if (res.ok) setShops(data.shops || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadShops(); }, []);

  async function toggleActive(shop: Shop) {
    setTogglingId(shop.id);
    const nextActive = !shop.is_active;
    try {
      const res = await fetch(`/api/admin/shops/${shop.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: nextActive }),
      });
      if (res.ok) {
        setShops((prev) => prev.map((s) => s.id === shop.id ? { ...s, is_active: nextActive } : s));
      }
    } finally {
      setTogglingId(null);
      setConfirmShop(null);
    }
  }

  function handleSort(key: SortKey) {
    if (sortKey !== key) { setSortKey(key); setSortDir("asc"); }
    else if (sortDir === "asc") setSortDir("desc");
    else { setSortKey(null); setSortDir(null); }
  }

  function getSorted(list: Shop[]) {
    if (!sortKey || !sortDir) return list;
    return [...list].sort((a, b) => {
      let av: string | number = "", bv: string | number = "";
      if (sortKey === "shop_domain") { av = a.shop_domain; bv = b.shop_domain; }
      else if (sortKey === "shop_owner_email") { av = a.shop_owner_email || ""; bv = b.shop_owner_email || ""; }
      else if (sortKey === "billing_plan_name") { av = a.billing_plan_name || ""; bv = b.billing_plan_name || ""; }
      else if (sortKey === "contact_count") { av = a.contact_count; bv = b.contact_count; }
      else if (sortKey === "is_active") { av = a.is_active ? 1 : 0; bv = b.is_active ? 1 : 0; }
      else if (sortKey === "installed_at") { av = a.installed_at; bv = b.installed_at; }
      else if (sortKey === "last_synced_at") { av = a.last_synced_at || ""; bv = b.last_synced_at || ""; }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }

  const processed = getSorted(
    shops
      .filter(STATUS_FILTERS[activeFilter].match)
      .filter((s) => {
        const q = search.toLowerCase();
        if (!q) return true;
        return (
          s.shop_domain.toLowerCase().includes(q) ||
          s.shop_owner_email?.toLowerCase().includes(q)
        );
      })
  );

  const { page, perPage, setPage, setPerPage, paginate } = usePagination(
    processed.length,
    [search, activeFilter, sortKey, sortDir]
  );
  const paginated = paginate(processed);

  function exportCSV() {
    if (processed.length === 0) return;

    const headers = [
      "shop_domain", "owner_email", "plan", "contacts",
      "status", "installed_at", "last_synced_at",
    ];

    const rows = processed.map((s) => [
      s.shop_domain,
      s.shop_owner_email || "",
      s.billing_plan_name || "",
      s.contact_count,
      s.uninstalled_at ? "uninstalled" : s.is_active ? "active" : "inactive",
      s.installed_at,
      s.last_synced_at || "",
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shops_export_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">All Shops</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage every store that has installed the app</p>
        </div>
        <button
          onClick={exportCSV}
          disabled={processed.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-300 border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          <Download size={12} />
          Export CSV
        </button>
      </div>

      {/* Search + filter chips */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-80">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search by domain or owner email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm text-gray-200 placeholder-gray-500 bg-gray-900 border border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-600 transition-colors"
          />
        </div>
        <div className="flex items-center gap-1.5">
          {STATUS_FILTERS.map((f, i) => {
            const count = shops.filter(f.match).length;
            const active = activeFilter === i;
            return (
              <button
                key={f.label}
                onClick={() => setActiveFilter(i)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  active
                    ? "bg-green-600/20 text-green-400 border border-green-600/40"
                    : "text-gray-400 border border-gray-800 hover:bg-gray-800"
                }`}
              >
                {f.label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? "bg-green-600/30" : "bg-gray-800"}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-gray-600 text-sm">Loading...</div>
        ) : paginated.length === 0 ? (
          <div className="p-16 text-center text-gray-600 text-sm">No shops found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800">
              <tr>
                {COLUMNS.map(({ label, key }) => (
                  <th key={label} className="text-left px-5 py-3">
                    {key ? (
                      <button
                        onClick={() => handleSort(key)}
                        className="flex items-center gap-1 group text-xs font-semibold text-gray-500 uppercase tracking-wide hover:text-gray-300 transition-colors"
                      >
                        {label}
                        <SortIcon active={sortKey === key} dir={sortKey === key ? sortDir : null} />
                      </button>
                    ) : (
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
                    )}
                  </th>
                ))}
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {paginated.map((shop) => {
                const status = shop.uninstalled_at ? "uninstalled" : shop.is_active ? "active" : "inactive";
                return (
                  <tr key={shop.id} className="hover:bg-gray-800/40 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Store size={13} className="text-gray-500 flex-shrink-0" />
                        <span className="text-white text-xs font-medium">{shopName(shop.shop_domain)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-gray-400 text-xs">{shop.shop_owner_email || "—"}</td>
                    <td className="px-5 py-3 text-gray-400 text-xs">{shop.billing_plan_name || "—"}</td>
                    <td className="px-5 py-3 text-gray-400 text-xs">{shop.contact_count}</td>
                    <td className="px-5 py-3">
                      {status === "active" ? (
                        <span className="flex items-center gap-1 text-green-400 text-xs"><CheckCircle size={11} />Active</span>
                      ) : status === "inactive" ? (
                        <span className="flex items-center gap-1 text-red-400 text-xs"><XCircle size={11} />Inactive</span>
                      ) : (
                        <span className="flex items-center gap-1 text-gray-500 text-xs"><XCircle size={11} />Uninstalled</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{fmtDate(shop.installed_at)}</td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{fmtDate(shop.last_synced_at)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <ActionBtn title="View shop" href={`/admin/shops/${shop.id}`} className="hover:bg-blue-500/10 hover:text-blue-400">
                          <Eye size={14} />
                        </ActionBtn>
                        <ActionBtn
                          title={shop.is_active ? "Deactivate shop" : "Activate shop"}
                          onClick={() => setConfirmShop(shop)}
                          disabled={togglingId === shop.id}
                          className="hover:bg-yellow-500/10 hover:text-yellow-400"
                        >
                          <Power size={14} />
                        </ActionBtn>
                        <ActionBtn title="View shop's contacts" href={`/admin/contacts?shop_id=${shop.id}`} className="hover:bg-purple-500/10 hover:text-purple-400">
                          <Users size={14} />
                        </ActionBtn>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <Pagination page={page} perPage={perPage} total={processed.length} onPageChange={setPage} onPerPageChange={setPerPage} />
      </div>

      {confirmShop && (
        <ConfirmActionModal
          title={confirmShop.is_active ? "Deactivate this shop?" : "Activate this shop?"}
          message={
            confirmShop.is_active
              ? `${shopName(confirmShop.shop_domain)} will be marked inactive. The merchant will lose access until you reactivate it.`
              : `${shopName(confirmShop.shop_domain)} will be marked active again.`
          }
          confirmLabel={confirmShop.is_active ? "Deactivate" : "Activate"}
          loadingLabel={confirmShop.is_active ? "Deactivating..." : "Activating..."}
          tone={confirmShop.is_active ? "warning" : "success"}
          loading={togglingId === confirmShop.id}
          onConfirm={() => toggleActive(confirmShop)}
          onCancel={() => setConfirmShop(null)}
        />
      )}
    </div>
  );
}

function ActionBtn({ children, onClick, href, title, className, disabled }: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  title: string;
  className?: string;
  disabled?: boolean;
}) {
  const cls = `w-7 h-7 flex items-center justify-center rounded-md text-gray-500 transition-colors disabled:opacity-40 ${className}`;
  if (href) {
    return (
      <Link href={href} title={title} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button onClick={onClick} title={title} disabled={disabled} className={cls}>
      {children}
    </button>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active || !dir) return <ChevronsUpDown size={13} className="text-gray-600 group-hover:text-gray-400" />;
  return dir === "asc" ? <ChevronUp size={13} className="text-green-500" /> : <ChevronDown size={13} className="text-green-500" />;
}
