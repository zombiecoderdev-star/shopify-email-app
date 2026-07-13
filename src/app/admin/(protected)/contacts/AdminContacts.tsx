"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Search, RefreshCw, Plus, Filter, Upload,
  ChevronUp, ChevronDown, ChevronsUpDown,
  Eye, Pencil, Trash2, Store, CheckCircle, XCircle,
} from "lucide-react";
import AddCustomerModal from "@/components/AddCustomerModal";
import ImportExportModal from "@/components/ImportExportModal";
import ViewCustomerPanel from "@/components/ViewCustomerPanel";
import UpdateCustomerModal from "@/components/UpdateCustomerModal";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";
import Pagination, { usePagination } from "@/components/Pagination";

type Shop = {
  id: string;
  shop_domain: string;
  is_active: boolean;
  uninstalled_at: string | null;
};

type Contact = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  orders_count: number;
  total_spent: number;
  subscribed: boolean;
  tags: string[];
  shopify_customer_id: string;
  created_at?: string;
  last_order_at?: string | null;
};

type SortKey = "name" | "status" | "orders_count" | "total_spent";
type SortDir = "asc" | "desc" | null;

const SEGMENTS = [
  { label: "All Contacts",         filter: () => true },
  { label: "Email Subscribers",    filter: (c: Contact) => c.subscribed },
  { label: "Frequent Buyers (3+)", filter: (c: Contact) => c.orders_count >= 3 },
  { label: "Unsubscribed list",    filter: (c: Contact) => !c.subscribed },
];

const COLUMNS: { label: string; key: SortKey | null }[] = [
  { label: "Customer Name",  key: "name" },
  { label: "Status",         key: "status" },
  { label: "Tags",           key: null },
  { label: "Orders / Spent", key: "orders_count" },
];

function shopName(domain: string) {
  return domain.replace(".myshopify.com", "");
}

export default function AdminContacts() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [shops, setShops] = useState<Shop[]>([]);
  const [shopsLoading, setShopsLoading] = useState(true);
  const [selectedShopId, setSelectedShopId] = useState<string | null>(null);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [activeSegment, setActiveSegment] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  // Modal/panel state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportExport, setShowImportExport] = useState(false);
  const [viewContact, setViewContact] = useState<Contact | null>(null);
  const [updateContact, setUpdateContact] = useState<Contact | null>(null);
  const [deleteContact, setDeleteContact] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Multi-select
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkDelete, setShowBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Minimal local toast — admin panel has no App Bridge to provide one.
  const [toastState, setToastState] = useState<{ msg: string; isError?: boolean } | null>(null);
  const toast = useCallback((msg: string, opts?: { isError?: boolean }) => {
    setToastState({ msg, isError: opts?.isError });
    setTimeout(() => setToastState(null), 3000);
  }, []);

  const selectedShop = shops.find((s) => s.id === selectedShopId) || null;

  // Load shops for the selector, then decide which one is selected:
  // ?shop_id= from the URL if valid, else the first active shop, else the first shop.
  useEffect(() => {
    setShopsLoading(true);
    fetch("/api/admin/shops")
      .then((r) => r.json())
      .then((d) => {
        const list: Shop[] = d.shops || [];
        setShops(list);
        const paramId = searchParams.get("shop_id");
        const initial =
          (paramId && list.some((s) => s.id === paramId) ? paramId : null) ||
          list.find((s) => s.is_active && !s.uninstalled_at)?.id ||
          list[0]?.id ||
          null;
        setSelectedShopId(initial);
      })
      .finally(() => setShopsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadContacts = useCallback(async (shopId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/contacts?shop_id=${shopId}`);
      const data = await res.json();
      setContacts(data.contacts || []);
    } catch {
      toast("Failed to load contacts", { isError: true });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Whenever the selected shop changes, sync the URL and reload contacts.
  useEffect(() => {
    if (!selectedShopId) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("shop_id", selectedShopId);
    router.replace(`/admin/contacts?${params.toString()}`, { scroll: false });
    setSelected(new Set());
    loadContacts(selectedShopId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShopId]);

  async function syncCustomers() {
    if (!selectedShop) return;
    setSyncing(true);
    try {
      // Reused as-is from the embedded app — this route has no merchant-specific
      // auth of its own (it trusts the shop domain in the body either way).
      const res = await fetch("/api/shopify/sync-customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop: selectedShop.shop_domain }),
      });
      const data = await res.json();
      if (data.success) {
        toast(`Synced ${data.synced} customers ✅`);
        await loadContacts(selectedShop.id);
      } else {
        toast("Sync failed: " + data.error, { isError: true });
      }
    } catch {
      toast("Sync failed", { isError: true });
    } finally {
      setSyncing(false);
    }
  }

  async function handleDelete(contact: Contact) {
    if (!selectedShop) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/contacts/delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop_id: selectedShop.id, shopify_customer_id: contact.shopify_customer_id }),
      });
      if (res.ok) {
        toast("Customer deleted ✅");
        setContacts((prev) => prev.filter((c) => c.id !== contact.id));
        setSelected((prev) => { const s = new Set(prev); s.delete(contact.id); return s; });
      } else {
        toast("Delete failed", { isError: true });
      }
    } catch {
      toast("Delete failed", { isError: true });
    } finally {
      setDeleting(false);
      setDeleteContact(null);
    }
  }

  async function handleBulkDelete() {
    if (!selectedShop) return;
    setBulkDeleting(true);
    const ids = contacts.filter((c) => selected.has(c.id)).map((c) => c.shopify_customer_id);
    try {
      const res = await fetch("/api/admin/contacts/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shop_id: selectedShop.id, shopify_customer_ids: ids }),
      });
      const data = await res.json();
      if (res.ok) {
        toast(`Deleted ${data.succeeded} customers ✅`);
        setContacts((prev) => prev.filter((c) => !selected.has(c.id)));
        setSelected(new Set());
      } else {
        toast("Bulk delete failed", { isError: true });
      }
    } catch {
      toast("Bulk delete failed", { isError: true });
    } finally {
      setBulkDeleting(false);
      setShowBulkDelete(false);
    }
  }

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

  const processed = getSorted(
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

  const { page, perPage, setPage, setPerPage, paginate } = usePagination(
    processed.length,
    [search, activeSegment, sortKey, sortDir, selectedShopId]
  );
  const paginated = paginate(processed);

  const allCurrentSelected = paginated.length > 0 && paginated.every((c) => selected.has(c.id));
  const someCurrentSelected = paginated.some((c) => selected.has(c.id));

  function toggleSelectAll() {
    if (allCurrentSelected) {
      setSelected((prev) => { const s = new Set(prev); paginated.forEach((c) => s.delete(c.id)); return s; });
    } else {
      setSelected((prev) => { const s = new Set(prev); paginated.forEach((c) => s.add(c.id)); return s; });
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  return (
    <div className="p-6">

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="text-sm text-gray-400 mt-1">
            View and manage any shop's Shopify customers from one place.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowImportExport(true)} disabled={!selectedShop} className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
            <Upload size={14} /> Import / Export
          </button>
          <button onClick={() => setShowAddModal(true)} disabled={!selectedShop} className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
            <Plus size={14} /> Add Customer
          </button>
          <button onClick={syncCustomers} disabled={!selectedShop || syncing} className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing..." : "Sync Customers"}
          </button>
        </div>
      </div>

      {/* Shop selector */}
      <div className="bg-white rounded-xl border border-gray-200 p-3 mb-4 flex items-center gap-3">
        <Store size={15} className="text-gray-400 flex-shrink-0" />
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex-shrink-0">Shop</label>
        {shopsLoading ? (
          <p className="text-sm text-gray-400">Loading shops...</p>
        ) : shops.length === 0 ? (
          <p className="text-sm text-gray-400">No shops installed yet.</p>
        ) : (
          <select
            value={selectedShopId || ""}
            onChange={(e) => setSelectedShopId(e.target.value)}
            className="flex-1 max-w-sm px-3 py-1.5 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition-colors"
          >
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {shopName(s.shop_domain)}{!s.is_active ? " (inactive)" : ""}
              </option>
            ))}
          </select>
        )}
        {selectedShop && (
          selectedShop.is_active
            ? <span className="flex items-center gap-1 text-green-600 text-xs"><CheckCircle size={11} />Active</span>
            : <span className="flex items-center gap-1 text-red-500 text-xs"><XCircle size={11} />Inactive</span>
        )}
      </div>

      <div className="flex gap-4">

        {/* Left panel */}
        <div className="w-64 flex-shrink-0 space-y-3">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-1.5">
                <Filter size={12} className="text-gray-400" />
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Audience Segments</p>
              </div>
            </div>
            <div className="py-1">
              {SEGMENTS.map((seg, i) => {
                const count = contacts.filter(seg.filter).length;
                const active = activeSegment === i;
                return (
                  <button key={i} onClick={() => { setActiveSegment(i); setSelected(new Set()); }}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors ${active ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-600 hover:bg-gray-50"}`}
                  >
                    <span>{seg.label}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${active ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-400"}`}>{count}</span>
                  </button>
                );
              })}
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
        </div>

        {/* Right panel */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden flex flex-col">

          {/* Search */}
          <div className="p-3 border-b border-gray-100">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search customers by name, email, or Shopify tags..." value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm text-gray-700 placeholder-gray-400 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:bg-white transition-colors"
              />
            </div>
          </div>

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50 border-b border-blue-100">
              <p className="text-xs font-medium text-blue-700">
                {selected.size} customer{selected.size > 1 ? "s" : ""} selected
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => setSelected(new Set())} className="text-xs text-blue-500 hover:text-blue-700">
                  Deselect all
                </button>
                <button
                  onClick={() => setShowBulkDelete(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 transition-colors"
                >
                  <Trash2 size={12} />
                  Delete selected
                </button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="flex-1">
            {!selectedShop ? (
              <div className="p-16 text-center text-gray-400 text-sm">Select a shop above to view its contacts.</div>
            ) : loading ? (
              <div className="p-16 text-center text-gray-400 text-sm">Loading contacts...</div>
            ) : paginated.length === 0 ? (
              <div className="p-16 text-center text-gray-400 text-sm">No customers found.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100">
                  <tr>
                    <th className="pl-4 py-3 w-8">
                      <input type="checkbox" checked={allCurrentSelected}
                        ref={(el) => { if (el) el.indeterminate = someCurrentSelected && !allCurrentSelected; }}
                        onChange={toggleSelectAll}
                        className="accent-green-600 w-3.5 h-3.5 cursor-pointer"
                      />
                    </th>
                    {COLUMNS.map(({ label, key }) => (
                      <th key={label} className="text-left px-4 py-3">
                        {key ? (
                          <button onClick={() => handleSort(key)}
                            className="flex items-center gap-1 group text-xs font-semibold text-gray-400 uppercase tracking-wide hover:text-gray-700 transition-colors"
                          >
                            {label}
                            <SortIcon active={sortKey === key} dir={sortKey === key ? sortDir : null} />
                          </button>
                        ) : (
                          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
                        )}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.map((c) => (
                    <tr key={c.id} className={`hover:bg-gray-50 transition-colors ${selected.has(c.id) ? "bg-blue-50/50" : ""}`}>
                      <td className="pl-4 py-3 w-8">
                        <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleOne(c.id)}
                          className="accent-green-600 w-3.5 h-3.5 cursor-pointer"
                        />
                      </td>
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
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${c.subscribed ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {c.subscribed ? "SUBSCRIBED" : "UNSUBSCRIBED"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {c.tags?.length > 0
                            ? c.tags.slice(0, 2).map((tag) => (
                                <span key={tag} className="px-1.5 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">{tag}</span>
                              ))
                            : <span className="text-gray-300 text-xs">—</span>
                          }
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {c.orders_count} orders / ${parseFloat(String(c.total_spent)).toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <ActionBtn title="View details" onClick={() => setViewContact(c)} className="hover:bg-blue-50 hover:text-blue-600">
                            <Eye size={14} />
                          </ActionBtn>
                          <ActionBtn title="Edit customer" onClick={() => setUpdateContact(c)} className="hover:bg-green-50 hover:text-green-600">
                            <Pencil size={14} />
                          </ActionBtn>
                          <ActionBtn title="Delete customer" onClick={() => setDeleteContact(c)} className="hover:bg-red-50 hover:text-red-500">
                            <Trash2 size={14} />
                          </ActionBtn>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <Pagination page={page} perPage={perPage} total={processed.length} onPageChange={setPage} onPerPageChange={setPerPage} />
        </div>
      </div>

      {/* ── Modals & Panels ── */}
      {showAddModal && selectedShop && (
        <AddCustomerModal
          shop={selectedShop.shop_domain}
          shopId={selectedShop.id}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => loadContacts(selectedShop.id)}
          showToast={toast}
        />
      )}
      {showImportExport && selectedShop && (
        <ImportExportModal
          shop={selectedShop.shop_domain}
          shopId={selectedShop.id}
          contacts={contacts}
          onClose={() => setShowImportExport(false)}
          onImportDone={() => loadContacts(selectedShop.id)}
          showToast={toast}
        />
      )}

      {viewContact && (
        <ViewCustomerPanel
          contact={viewContact}
          onClose={() => setViewContact(null)}
          onUpdate={(c) => { setViewContact(null); setUpdateContact(c); }}
        />
      )}

      {updateContact && selectedShop && (
        <UpdateCustomerModal
          shop={selectedShop.shop_domain}
          shopId={selectedShop.id}
          contact={updateContact}
          onClose={() => setUpdateContact(null)}
          onSuccess={(updated) => setContacts((prev) => prev.map((c) => c.id === updated.id ? { ...c, ...updated } : c))}
          showToast={toast}
        />
      )}

      {deleteContact && (
        <DeleteConfirmModal
          title="Delete Customer?"
          message={`${[deleteContact.first_name, deleteContact.last_name].filter(Boolean).join(" ") || deleteContact.email} will be permanently deleted from Shopify and this shop's contacts list. This cannot be undone.`}
          confirmLabel="Delete Customer"
          loading={deleting}
          onConfirm={() => handleDelete(deleteContact)}
          onCancel={() => setDeleteContact(null)}
        />
      )}

      {showBulkDelete && (
        <DeleteConfirmModal
          title={`Delete ${selected.size} Customers?`}
          message={`All ${selected.size} selected customers will be permanently deleted from Shopify and this shop's contacts list. This cannot be undone.`}
          confirmLabel={`Delete ${selected.size} Customers`}
          loading={bulkDeleting}
          onConfirm={handleBulkDelete}
          onCancel={() => setShowBulkDelete(false)}
        />
      )}

      {/* Toast */}
      {toastState && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium z-[60] ${
          toastState.isError ? "bg-red-600 text-white" : "bg-gray-900 text-white"
        }`}>
          {toastState.msg}
        </div>
      )}
    </div>
  );
}

function ActionBtn({ children, onClick, title, className }: {
  children: React.ReactNode; onClick: () => void; title: string; className?: string;
}) {
  return (
    <button onClick={onClick} title={title}
      className={`w-7 h-7 flex items-center justify-center rounded-md text-gray-400 transition-colors ${className}`}>
      {children}
    </button>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active || !dir) return <ChevronsUpDown size={13} className="text-gray-300 group-hover:text-gray-500" />;
  return dir === "asc" ? <ChevronUp size={13} className="text-green-600" /> : <ChevronDown size={13} className="text-green-600" />;
}
