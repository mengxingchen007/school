"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function SignupPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    setBusy(false);
    if (error) {
      setError("注册失败：" + error.message);
      return;
    }
    if (data?.session) {
      router.push("/schedule");
    } else {
      setNotice("注册成功！请去邮箱里点确认链接，然后回来登录。");
    }
  }

  return (
    <div className="page" style={{ maxWidth: 380, paddingTop: 80 }}>
      <h2 style={{ textAlign: "center", marginBottom: 24 }}>注册账号</h2>
      <form className="card" onSubmit={handleSubmit}>
        <div className="field">
          <label>昵称</label>
          <input
            className="input"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
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
          <label>密码（至少6位）</label>
          <input
            className="input"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && (
          <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>{error}</div>
        )}
        {notice && (
          <div style={{ color: "var(--teal)", fontSize: 13, marginBottom: 12 }}>{notice}</div>
        )}
        <button className="btn" type="submit" disabled={busy} style={{ width: "100%" }}>
          {busy ? "注册中..." : "注册"}
        </button>
      </form>
      <p style={{ textAlign: "center", marginTop: 16, fontSize: 14, color: "var(--ink-soft)" }}>
        已有账号？<Link href="/login" style={{ color: "var(--teal)" }}>去登录</Link>
      </p>
    </div>
  );
}
