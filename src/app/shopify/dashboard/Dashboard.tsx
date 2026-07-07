"use client";

import { useAppBridge } from "@shopify/app-bridge-react";
import {
  Users, Mail, Send, Zap,
  TrendingUp, ArrowUpRight, Settings
} from "lucide-react";

export default function Dashboard() {
  const shopify = useAppBridge();

  function showToast() {
    shopify.toast.show("App Bridge connected! 🎉", { duration: 3000 });
  }

  return (
    <div className="p-6 space-y-6">

      {/* Welcome Banner */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-1">
            Shopify Embedded App
          </p>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome to DevStrong Email Marketing!
          </h1>
          <p className="text-gray-500 text-sm mt-1 max-w-xl">
            Configure automated email flows and schedule campaign broadcasts
            synced directly with your Shopify store.
          </p>
        </div>
        <button
          onClick={showToast}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors flex-shrink-0 ml-6"
        >
          + Connect Shopify
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Shopify Subscribers" value={0} icon={<Users size={18} className="text-blue-500" />} />
        <StatCard label="Email Templates" value={0} icon={<Mail size={18} className="text-green-500" />} />
        <StatCard label="Sent Campaigns" value={0} icon={<Send size={18} className="text-purple-500" />} />
        <StatCard label="Automation Flows" value={0} icon={<Zap size={18} className="text-orange-500" />} />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-3 gap-4">

        <div className="col-span-2 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">✨</span>
              <h2 className="font-semibold text-gray-900">Shopify Sandbox Simulation Board</h2>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Manually simulate Shopify webhooks or step automation flows forward.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <p className="text-sm font-medium text-gray-800">Shopify Store Webhooks</p>
                </div>
                <p className="text-xs text-gray-400 mb-3">
                  Simulates a shopper action and sends real-time webhook payloads.
                </p>
                <div className="flex gap-2">
                  <button className="px-3 py-1.5 bg-gray-900 text-white text-xs rounded-md hover:bg-gray-700">
                    + Customer Created
                  </button>
                  <button className="px-3 py-1.5 bg-gray-900 text-white text-xs rounded-md hover:bg-gray-700">
                    + Customer Ordered
                  </button>
                </div>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-blue-400" />
                  <p className="text-sm font-medium text-gray-800">Background Automation Queue</p>
                </div>
                <p className="text-xs text-gray-400 mb-3">
                  Forces the waiting customer queues to tick 1 step forward.
                </p>
                <button className="w-full px-3 py-1.5 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700">
                  Step Flow Queue Forward (Tick Engine)
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp size={16} className="text-green-500" />
              <h2 className="font-semibold text-gray-900">Simulated ROI Performance</h2>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <ROIStat label="Open Rate AVG" value="58.4%" note="▲ Industry +15%" />
              <ROIStat label="CTR Link Click AVG" value="18.2%" note="▲ Excellent" />
              <ROIStat label="Revenue Recov" value="$2,450.00" note="via Welcome Series" />
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Usage Credit Balances</h2>
              <button className="text-xs text-green-600 flex items-center gap-0.5 hover:underline">
                Manage <ArrowUpRight size={12} />
              </button>
            </div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-gray-500">Plan Tier:</span>
              <span className="font-semibold text-gray-900">FREE PLAN</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">0 sent</span>
              <span className="text-gray-400">500 limit</span>
            </div>
            <div className="mt-3 w-full bg-gray-100 rounded-full h-1.5">
              <div className="bg-green-500 h-1.5 rounded-full" style={{ width: "0%" }} />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Delivery Pipeline</h2>
              <button className="text-xs text-green-600 flex items-center gap-0.5 hover:underline">
                Configure <ArrowUpRight size={12} />
              </button>
            </div>
            <div className="space-y-2.5 text-sm">
              <PipelineRow label="Active ESP" value="SANDBOX" valueClass="font-semibold text-gray-900" />
              <PipelineRow label="Domain SPF/DKIM" value="⚠ Not set" valueClass="text-yellow-600" />
              <PipelineRow label="Sender Verified" value="⚠ Not set" valueClass="text-yellow-600" />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-900 mb-3">Quick Setup</h2>
            <div className="space-y-2">
              <QuickLink label="Configure ESP (SendGrid / Resend)" />
              <QuickLink label="Set up SPF / DKIM records" />
              <QuickLink label="Sync Shopify customers" />
              <QuickLink label="Create your first campaign" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between">
      <div>
        <p className="text-xs text-gray-400 mb-1">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
      </div>
      <div className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center">
        {icon}
      </div>
    </div>
  );
}

function ROIStat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-green-500 mt-0.5">{note}</p>
    </div>
  );
}

function PipelineRow({ label, value, valueClass }: { label: string; value: string; valueClass: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-500">{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}

function QuickLink({ label }: { label: string }) {
  return (
    <button className="w-full text-left text-xs text-gray-600 hover:text-green-600 flex items-center gap-1.5 py-1">
      <Settings size={11} className="text-gray-300" />
      {label}
    </button>
  );
}
