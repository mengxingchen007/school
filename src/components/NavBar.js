"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/lib/useUser";

const TABS = [
  { href: "/schedule", label: "课表" },
  { href: "/tasks", label: "作业考试" },
  { href: "/food", label: "吃饭抽签" },
  { href: "/group", label: "分组抽签" },
  { href: "/settings", label: "设置" },
];

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile } = useUser();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <div
      style={{
        borderBottom: "1px solid var(--border)",
        background: "#fff",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div
        style={{
          maxWidth: 960,
          margin: "0 auto",
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <strong style={{ fontSize: 16 }}>🎓 拾光校园工具</strong>
          <div style={{ display: "flex", gap: 6 }}>
            {TABS.map((t) => {
              const active = pathname?.startsWith(t.href);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 8,
                    fontSize: 14,
                    background: active ? "var(--teal-soft)" : "transparent",
                    color: active ? "var(--teal)" : "var(--ink-soft)",
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {t.label}
                </Link>
              );
            })}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {profile?.is_admin && (
            <span style={{ fontSize: 12, color: "var(--coral)" }}>管理员</span>
          )}
          <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>
            {profile?.display_name || user?.email}
          </span>
          <button className="btn secondary" onClick={handleLogout}>
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
}
