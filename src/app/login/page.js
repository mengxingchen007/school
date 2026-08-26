"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError("登录失败：" + error.message);
      return;
    }
    router.push("/schedule");
  }

  return (
    <div className="page" style={{ maxWidth: 380, paddingTop: 80 }}>
      <h2 style={{ textAlign: "center", marginBottom: 24 }}>🎓 拾光校园工具</h2>
      <form className="card" onSubmit={handleSubmit}>
        <div className="field">
          <label>邮箱</label>
          <input
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label>密码</label>
          <input
            className="input"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>{error}</div>
        )}
        <button className="btn" type="submit" disabled={busy} style={{ width: "100%" }}>
          {busy ? "登录中..." : "登录"}
        </button>
      </form>
      <p style={{ textAlign: "center", marginTop: 16, fontSize: 14, color: "var(--ink-soft)" }}>
        还没有账号？<Link href="/signup" style={{ color: "var(--teal)" }}>去注册</Link>
      </p>
    </div>
  );
}
