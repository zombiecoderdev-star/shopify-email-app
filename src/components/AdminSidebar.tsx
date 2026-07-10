"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  Mail, LayoutDashboard, Store, Users,
  CreditCard, Settings, LogOut, ChevronDown,
  ChevronRight, ChevronLeft, CheckCircle, XCircle,
} from "lucide-react";

const STORAGE_KEY = "admin-sidebar-collapsed";

type Shop = {
  id: string;
  shop_domain: string;
  is_active: boolean;
  contact_count: number;
};

const NAV = [
  { label: "Dashboard",    href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "All Shops",    href: "/admin/shops",     icon: Store },
  { label: "Contacts",     href: "/admin/contacts",  icon: Users },
  { label: "Billing",      href: "/admin/billing",   icon: CreditCard },
  { label: "Settings",     href: "/admin/settings",  icon: Settings },
];

export default function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopsOpen, setShopsOpen] = useState(true);
  const [adminEmail, setAdminEmail] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    supabaseBrowser.auth.getUser().then(({ data }) => {
      setAdminEmail(data.user?.email || "");
    });
    fetch("/api/admin/shops")
      .then((r) => r.json())
      .then((d) => setShops(d.shops || []));
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  async function handleLogout() {
    await supabaseBrowser.auth.signOut();
    // Clear the auth cookie
    const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL!
      .split("//")[1].split(".")[0];
    document.cookie = `sb-${projectRef}-auth-token=; path=/; max-age=0`;
    router.push("/admin/login");
  }

  return (
    <aside
      className={`${
        collapsed ? "w-16" : "w-56"
      } min-h-screen bg-gray-900 border-r border-gray-800 flex flex-col flex-shrink-0 transition-all duration-200`}
    >

      {/* Logo */}
      <div className="px-4 py-4 border-b border-gray-800">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-7 h-7 bg-green-600 rounded-md flex items-center justify-center flex-shrink-0">
            <Mail size={14} className="text-white" />
          </div>
          {!collapsed && (
            <div>
              <p className="text-sm font-bold text-white leading-none">DevStrong</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-0.5">
                Admin Panel
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={toggleCollapsed}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="flex items-center justify-center gap-2 mx-2 mt-2 py-1.5 text-xs text-gray-500 hover:bg-gray-800 hover:text-gray-300 rounded-lg transition-colors"
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        {!collapsed && "Collapse"}
      </button>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 overflow-auto">

        {/* Main nav items */}
        {NAV.map(({ label, href, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg mb-0.5 text-sm transition-colors ${
                collapsed ? "justify-center" : ""
              } ${
                active
                  ? "bg-green-600/20 text-green-400 font-medium"
                  : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
              }`}
            >
              <Icon size={15} className={active ? "text-green-400" : "text-gray-500"} />
              {!collapsed && label}
            </Link>
          );
        })}

        {/* Installed shops section */}
        {!collapsed && (
          <div className="mt-4">
            <button
              onClick={() => setShopsOpen((o) => !o)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider hover:text-gray-400 transition-colors"
            >
              <span>Installed Shops</span>
              {shopsOpen
                ? <ChevronDown size={12} />
                : <ChevronRight size={12} />
              }
            </button>

            {shopsOpen && (
              <div className="mt-1 space-y-0.5">
                {shops.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-600">No shops yet</p>
                ) : (
                  shops.map((shop) => {
                    const active = pathname === `/admin/shops/${shop.id}`;
                    return (
                      <Link
                        key={shop.id}
                        href={`/admin/shops/${shop.id}`}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
                          active
                            ? "bg-gray-700 text-white"
                            : "text-gray-500 hover:bg-gray-800 hover:text-gray-300"
                        }`}
                      >
                        {/* Status dot */}
                        {shop.is_active
                          ? <CheckCircle size={11} className="text-green-500 flex-shrink-0" />
                          : <XCircle size={11} className="text-red-400 flex-shrink-0" />
                        }
                        <span className="truncate">{shop.shop_domain.replace(".myshopify.com", "")}</span>
                        <span className="ml-auto text-[10px] bg-gray-700 text-gray-400 px-1.5 py-0.5 rounded-full flex-shrink-0">
                          {shop.contact_count}
                        </span>
                      </Link>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}
      </nav>

      {/* Admin user + logout */}
      <div className="px-3 py-3 border-t border-gray-800">
        {!collapsed && (
          <div className="flex items-center gap-2 mb-2 px-1">
            <div className="w-6 h-6 rounded-full bg-green-600/20 flex items-center justify-center flex-shrink-0">
              <span className="text-[10px] font-bold text-green-400">
                {adminEmail[0]?.toUpperCase() || "A"}
              </span>
            </div>
            <p className="text-xs text-gray-400 truncate">{adminEmail}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          title={collapsed ? "Sign Out" : undefined}
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <LogOut size={13} />
          {!collapsed && "Sign Out"}
        </button>
      </div>
    </aside>
  );
}