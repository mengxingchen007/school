"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/lib/useUser";
import NavBar from "./NavBar";

// 包一层：没登录就跳去登录页；登录了就显示顶部导航 + 具体页面内容
export default function ProtectedShell({ children }) {
  const { user, loading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="page" style={{ paddingTop: 80, textAlign: "center", color: "var(--ink-soft)" }}>
        加载中...
      </div>
    );
  }

  return (
    <>
      <NavBar />
      <div className="page">{children}</div>
    </>
  );
}
