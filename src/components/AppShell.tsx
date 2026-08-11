"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const TABS = [
  { href: "/", label: "Dashboard" },
  { href: "/holdings", label: "Holdings" },
  { href: "/contribute", label: "Contribute" },
  { href: "/import", label: "Import" },
  { href: "/alerts", label: "Alerts" },
  { href: "/exposure", label: "Exposure" },
  { href: "/news", label: "News" },
  { href: "/history", label: "History" },
  { href: "/projections", label: "Projections" },
  { href: "/settings", label: "Settings" },
];

export default function AppShell({
  children,
  unreadAlertCount = 0,
}: {
  children: React.ReactNode;
  unreadAlertCount?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 dark:bg-neutral-950">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
        <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
          Portfolio Discipline
        </span>
        <button onClick={signOut} className="text-xs text-neutral-500 hover:underline">
          Sign out
        </button>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 z-10 flex overflow-x-auto border-t border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        {TABS.map((t) => {
          const active = pathname === t.href;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex-1 min-w-[72px] px-2 py-2.5 text-center text-[11px] font-medium ${
                active
                  ? "text-neutral-900 dark:text-neutral-50"
                  : "text-neutral-400 dark:text-neutral-500"
              }`}
            >
              <span className="relative inline-block">
                {t.label}
                {t.href === "/alerts" && unreadAlertCount > 0 && (
                  <span className="absolute -right-3 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-semibold text-white">
                    {unreadAlertCount > 99 ? "99+" : unreadAlertCount}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
