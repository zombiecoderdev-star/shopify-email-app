"use client";

import { useState, useEffect } from "react";
import {
  Store, Users, Activity, RefreshCw,
  CheckCircle, XCircle,
} from "lucide-react";

type ShopSummary = {
  id: string;
  shop_domain: string;
  shop_owner_email: string | null;
  plan_name: string | null;
  is_active: boolean;
  installed_at: string;
  contact_count: number;
};

type Stats = {
  total_shops: number;
  active_shops: number;
  total_contacts: number;
};

export default function AdminDashboard() {
  const [shops, setShops] = useState<ShopSummary[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/shops");
      const data = await res.json();
      if (res.ok) {
        setShops(data.shops || []);
        setStats(data.stats || null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Overview of all installed shops</p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 text-xs text-gray-400 border border-gray-700 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <StatCard icon={<Store size={18} className="text-blue-400" />} label="Total Installs" value={stats.total_shops} color="border-blue-500/20 bg-blue-500/5" />
          <StatCard icon={<Activity size={18} className="text-green-400" />} label="Active Shops" value={stats.active_shops} color="border-green-500/20 bg-green-500/5" />
          <StatCard icon={<Users size={18} className="text-purple-400" />} label="Total Contacts" value={stats.total_contacts} color="border-purple-500/20 bg-purple-500/5" />
        </div>
      )}

      {/* Shops table */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-white">Installed Shops</h2>
        </div>
        {loading ? (
          <div className="p-16 text-center text-gray-600 text-sm">Loading...</div>
        ) : shops.length === 0 ? (
          <div className="p-16 text-center text-gray-600 text-sm">No shops installed yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-800">
              <tr>
                {["Shop", "Owner", "Contacts", "Plan", "Status", "Installed"].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {shops.map((shop) => (
                <tr key={shop.id} className="hover:bg-gray-800/40 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Store size={13} className="text-gray-500" />
                      <span className="text-white text-xs font-medium">{shop.shop_domain}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-gray-400 text-xs">{shop.shop_owner_email || "—"}</td>
                  <td className="px-5 py-3 text-gray-400 text-xs">{shop.contact_count}</td>
                  <td className="px-5 py-3 text-gray-400 text-xs">{shop.plan_name || "—"}</td>
                  <td className="px-5 py-3">
                    {shop.is_active ? (
                      <span className="flex items-center gap-1 text-green-400 text-xs"><CheckCircle size={11} />Active</span>
                    ) : (
                      <span className="flex items-center gap-1 text-red-400 text-xs"><XCircle size={11} />Uninstalled</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-gray-500 text-xs">
                    {new Date(shop.installed_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
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

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className={`border rounded-xl p-5 flex items-center gap-4 ${color}`}>
      <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0">{icon}</div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-2xl font-bold text-white">{value.toLocaleString()}</p>
      </div>
    </div>
  );
}