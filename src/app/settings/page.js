"use client";

import { useEffect, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/lib/useUser";
import { DEFAULT_PERIOD_TIMES } from "@/lib/constants";

function toRows(list) {
  return list.map((p) => ({ period: p.period, start: p.start, duration: p.duration }));
}

export default function SettingsPage() {
  return (
    <ProtectedShell>
      <SettingsInner />
    </ProtectedShell>
  );
}

function SettingsInner() {
  const { user } = useUser();
  const [rows, setRows] = useState(toRows(DEFAULT_PERIOD_TIMES));
  const [termStartDate, setTermStartDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function load() {
    setLoading(true);
    const [{ data }, { data: profileRow }] = await Promise.all([
      supabase.from("period_times").select("*").eq("owner_id", user.id),
      supabase.from("profiles").select("term_start_date").eq("id", user.id).single(),
    ]);
    const merged = DEFAULT_PERIOD_TIMES.map((p) => {
      const custom = (data || []).find((r) => r.period_number === p.period);
      return custom
        ? { period: p.period, start: custom.start_time.slice(0, 5), duration: custom.duration_minutes }
        : { period: p.period, start: p.start, duration: p.duration };
    });
    setRows(merged);
    setTermStartDate(profileRow?.term_start_date || "");
    setLoading(false);
  }

  function updateRow(period, patch) {
    setMessage("");
    setRows((prev) => prev.map((r) => (r.period === period ? { ...r, ...patch } : r)));
  }

  function resetDefaults() {
    setRows(toRows(DEFAULT_PERIOD_TIMES));
    setMessage("");
  }

  async function save() {
    setSaving(true);
    setMessage("");
    const payload = rows.map((r) => ({
      owner_id: user.id,
      period_number: r.period,
      start_time: r.start,
      duration_minutes: Number(r.duration) || 45,
    }));
    const { error } = await supabase.from("period_times").upsert(payload, { onConflict: "owner_id,period_number" });
    const { error: profileErr } = await supabase
      .from("profiles")
      .update({ term_start_date: termStartDate || null })
      .eq("id", user.id);
    setSaving(false);
    if (error || profileErr) {
      setMessage("保存失败：" + (error?.message || profileErr?.message));
      return;
    }
    setMessage("保存成功，回课表页面就能看到新的时间了");
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>每节课时间设置</h2>
      <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
        这里设置的是你自己每节课的开始时间和时长，只会改变课表页面上显示的时间标签，不影响你已经添加好的课程安排（星期几、第几节都不变）。
      </p>

      {loading ? (
        <div style={{ color: "var(--ink-soft)" }}>加载中...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>开学日期</h3>
            <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
              填一下"第1周星期一"是几号，课表页面就会显示每天具体的日期，并且自动高亮今天、打开课表时自动跳到今天所在的那一周。不填的话课表照旧正常使用，只是不显示日期。
            </p>
            <div className="field" style={{ marginBottom: 0, maxWidth: 220 }}>
              <label>第1周周一的日期</label>
              <input
                className="input"
                type="date"
                value={termStartDate}
                onChange={(e) => {
                  setMessage("");
                  setTermStartDate(e.target.value);
                }}
              />
            </div>
          </div>

          <div className="card">
          <h3 style={{ marginTop: 0 }}>每节课时间</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.map((r) => (
              <div key={r.period} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <div style={{ width: 50, fontWeight: 600 }}>第{r.period}节</div>
                <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 120 }}>
                  <label>开始时间</label>
                  <input
                    className="input"
                    type="time"
                    value={r.start}
                    onChange={(e) => updateRow(r.period, { start: e.target.value })}
                  />
                </div>
                <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 120 }}>
                  <label>时长（分钟）</label>
                  <input
                    className="input"
                    type="number"
                    value={r.duration}
                    onChange={(e) => updateRow(r.period, { duration: Number(e.target.value) })}
                  />
                </div>
              </div>
            ))}
          </div>

          {message && (
            <div
              style={{
                fontSize: 13,
                marginTop: 12,
                color: message.startsWith("保存失败") ? "var(--red)" : "var(--teal)",
              }}
            >
              {message}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button className="btn secondary" disabled={saving} onClick={resetDefaults}>
              恢复默认时间
            </button>
            <div style={{ flex: 1 }} />
            <button className="btn" disabled={saving} onClick={save}>
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
