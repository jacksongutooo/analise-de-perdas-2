"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/cx";

export function AdminNav() {
  const pathname = usePathname();
  const items = [
    { href: "/admin", label: "Painel", active: pathname === "/admin" },
    { href: "/admin/casos", label: "Casos", active: pathname.startsWith("/admin/casos") },
  ];
  return (
    <nav className="flex gap-1" aria-label="Administração">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cx(
            "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            item.active ? "bg-navy-50 text-navy-900" : "text-ink-soft hover:bg-paper hover:text-ink",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
