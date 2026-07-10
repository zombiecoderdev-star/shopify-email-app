"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingBag,
  Users,
  Mail,
  Send,
  Zap,
  Settings,
  CreditCard,
  Shield,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const STORAGE_KEY = "shopify-sidebar-collapsed";

const navItems = [
  { label: "Dashboard", href: "/shopify/dashboard", icon: LayoutDashboard },
  { label: "Shopify Connection", href: "/shopify/connection", icon: ShoppingBag },
  { label: "Customers & Segments", href: "/shopify/customers", icon: Users },
  { label: "Email Templates", href: "/shopify/templates", icon: Mail },
  { label: "Campaigns", href: "/shopify/campaigns", icon: Send },
  { label: "Automation Flows", href: "/shopify/flows", icon: Zap },
  { label: "Sending & ESP", href: "/shopify/sending", icon: Settings },
  { label: "Billing & Credits", href: "/shopify/billing", icon: CreditCard },
  { label: "GDPR & Compliance", href: "/shopify/gdpr", icon: Shield },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <aside
      className={`${
        collapsed ? "w-16" : "w-52"
      } min-h-screen bg-white border-r border-gray-200 flex flex-col flex-shrink-0 transition-all duration-200`}
    >

      {/* Logo */}
      <div className="px-4 py-5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-8 h-8 bg-green-600 rounded-md flex items-center justify-center flex-shrink-0">
            <Mail size={16} className="text-white" />
          </div>
          {!collapsed && (
            <div>
              <p className="text-sm font-bold text-gray-900 leading-none">DevStrong</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-0.5">
                Email Marketing
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={toggleCollapsed}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="flex items-center justify-center gap-2 mx-2 mt-2 py-1.5 text-xs text-gray-400 hover:bg-gray-50 hover:text-gray-700 rounded-md transition-colors"
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        {!collapsed && "Collapse"}
      </button>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2">
        {navItems.map(({ label, href, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md mb-0.5 text-sm transition-colors ${
                collapsed ? "justify-center" : ""
              } ${
                active
                  ? "bg-green-50 text-green-700 font-medium"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              <Icon size={16} className={active ? "text-green-600" : "text-gray-400"} />
              {!collapsed && label}
            </Link>
          );
        })}
      </nav>

      {/* App Status */}
      {!collapsed && (
        <div className="p-4 border-t border-gray-100">
          <div className="flex items-start gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 mt-1 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-gray-700">App Status</p>
              <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">
                Connect your Shopify store to activate subscriber syncing.
              </p>
            </div>
          </div>
        </div>
      )}

    </aside>
  );
}
