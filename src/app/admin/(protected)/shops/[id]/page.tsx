"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, Store, Mail, CheckCircle, XCircle,
  Users, CreditCard, Clock, Power,
} from "lucide-react";
import ConfirmActionModal from "@/components/ConfirmActionModal";

type ShopDetail = {
  id: string;
  shop_domain: string;
  shop_owner_email: string | null;
  plan_name: string | null;
  credits_balance: number;
  is_active: boolean;
  installed_at: string;
  uninstalled_at: string | null;
  last_synced_at: string | null;
  contact_count: number;
  billing_plan: { name: string; monthly_price: number; included_credits: number } | null;
  subscription_status: string | null;
  current_period_end: string | null;
};

function shopName(domain: string) {
  return domain.replace(".myshopify.com", "");
}

function fmtDate(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function AdminShopDetailPage() {
  const params = useParams<{ id: string }>();
  const [shop, setShop] = useState<ShopDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [confirmToggle, setConfirmToggle] = useState(false);

  async function loadShop() {
    setLoading(true);
    setNotFound(false);
    try {
      const res = await fetch(`/api/admin/shops/${params.id}`);
      if (res.status === 404) { setNotFound(true); return; }
      const data = await res.json();
      if (res.ok) setShop(data.shop);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadShop(); }, [params.id]);

  async function toggleActive() {
    if (!shop) return;
    setToggling(true);
    const nextActive = !shop.is_active;
    try {
      const res = await fetch(`/api/admin/shops/${shop.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: nextActive }),
      });
      if (res.ok) {
        setShop((prev) => prev ? { ...prev, is_active: nextActive } : prev);
      }
    } finally {
      setToggling(false);
      setConfirmToggle(false);
    }
  }

  if (loading) {
    return <div className="p-16 text-center text-gray-600 text-sm">Loading...</div>;
  }

  if (notFound || !shop) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Link href="/admin/shops" className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 mb-6">
          <ArrowLeft size={14} /> Back to All Shops
        </Link>
        <div className="p-16 text-center text-gray-600 text-sm bg-gray-900 border border-gray-800 rounded-2xl">
          Shop not found.
        </div>
      </div>
    );
  }

  const status = shop.uninstalled_at ? "uninstalled" : shop.is_active ? "active" : "inactive";

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">

      <Link href="/admin/shops" className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200">
        <ArrowLeft size={14} /> Back to All Shops
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gray-800 flex items-center justify-center flex-shrink-0">
            <Store size={18} className="text-gray-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">{shopName(shop.shop_domain)}</h1>
            <p className="text-xs text-gray-500 mt-0.5">{shop.shop_domain}</p>
          </div>
        </div>
        <button
          onClick={() => setConfirmToggle(true)}
          className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
            shop.is_active
              ? "border-yellow-600/40 text-yellow-400 hover:bg-yellow-500/10"
              : "border-green-600/40 text-green-400 hover:bg-green-500/10"
          }`}
        >
          <Power size={12} />
          {shop.is_active ? "Deactivate" : "Activate"}
        </button>
      </div>

      {/* Status badge */}
      <div>
        {status === "active" ? (
          <span className="inline-flex items-center gap-1 text-green-400 text-xs bg-green-500/10 px-2.5 py-1 rounded-full"><CheckCircle size={11} />Active</span>
        ) : status === "inactive" ? (
          <span className="inline-flex items-center gap-1 text-red-400 text-xs bg-red-500/10 px-2.5 py-1 rounded-full"><XCircle size={11} />Inactive</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-gray-500 text-xs bg-gray-800 px-2.5 py-1 rounded-full"><XCircle size={11} />Uninstalled</span>
        )}
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-2 gap-4">
        <InfoCard icon={<Mail size={16} className="text-blue-400" />} label="Owner Email" value={shop.shop_owner_email || "—"} />
        <InfoCard icon={<Users size={16} className="text-purple-400" />} label="Contacts" value={String(shop.contact_count)} />
        <InfoCard icon={<CreditCard size={16} className="text-green-400" />} label="Billing Plan" value={shop.billing_plan?.name || "No active plan"} />
        <InfoCard icon={<Clock size={16} className="text-orange-400" />} label="Last Synced" value={fmtDate(shop.last_synced_at)} />
        <InfoCard icon={<Store size={16} className="text-gray-400" />} label="Shopify Plan" value={shop.plan_name || "—"} />
        <InfoCard icon={<CreditCard size={16} className="text-gray-400" />} label="Credits Balance" value={String(shop.credits_balance)} />
      </div>

      {/* Timeline */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-white mb-1">Timeline</h2>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Installed</span>
          <span className="text-gray-300">{fmtDate(shop.installed_at)}</span>
        </div>
        {shop.uninstalled_at && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Uninstalled</span>
            <span className="text-gray-300">{fmtDate(shop.uninstalled_at)}</span>
          </div>
        )}
        {shop.current_period_end && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Current billing period ends</span>
            <span className="text-gray-300">{fmtDate(shop.current_period_end)}</span>
          </div>
        )}
      </div>

      {/* Contacts link */}
      <Link
        href={`/admin/contacts?shop_id=${shop.id}`}
        className="flex items-center justify-between px-5 py-4 bg-gray-900 border border-gray-800 rounded-2xl hover:bg-gray-800/60 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm text-gray-200">
          <Users size={15} className="text-purple-400" />
          View this shop's contacts
        </span>
        <span className="text-xs text-gray-500">{shop.contact_count} contacts →</span>
      </Link>

      {confirmToggle && (
        <ConfirmActionModal
          title={shop.is_active ? "Deactivate this shop?" : "Activate this shop?"}
          message={
            shop.is_active
              ? `${shopName(shop.shop_domain)} will be marked inactive. The merchant will lose access until you reactivate it.`
              : `${shopName(shop.shop_domain)} will be marked active again.`
          }
          confirmLabel={shop.is_active ? "Deactivate" : "Activate"}
          loadingLabel={shop.is_active ? "Deactivating..." : "Activating..."}
          tone={shop.is_active ? "warning" : "success"}
          loading={toggling}
          onConfirm={toggleActive}
          onCancel={() => setConfirmToggle(false)}
        />
      )}
    </div>
  );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-200 truncate">{value}</p>
      </div>
    </div>
  );
}
