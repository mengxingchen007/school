"use client";

import { useEffect, useMemo, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/lib/useUser";
import { BUDGET_LEVELS } from "@/lib/constants";

function emptyDraft(isPublic) {
  return {
    name: "",
    budgetLevel: 1,
    isOpen: true,
    waitMinutes: 0,
    distanceMeters: 500,
    isPublic,
  };
}

export default function FoodPage() {
  return (
    <ProtectedShell>
      <FoodInner />
    </ProtectedShell>
  );
}

function FoodInner() {
  const { user } = useUser();
  const [tab, setTab] = useState("personal"); // personal | public
  const [personalList, setPersonalList] = useState([]);
  const [publicList, setPublicList] = useState([]);
  const [loading, setLoading] = useState(true);

  const [budgetFilter, setBudgetFilter] = useState(null);
  const [openOnly, setOpenOnly] = useState(false);

  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (user) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadAll() {
    setLoading(true);
    const [{ data: personalRows }, { data: publicRows }, { data: historyRows }] = await Promise.all([
      supabase.from("food_places").select("*").eq("owner_id", user.id).eq("is_public", false),
      supabase.from("food_places").select("*").eq("is_public", true),
      supabase
        .from("food_draw_history")
        .select("*")
        .eq("owner_id", user.id)
        .order("drawn_at", { ascending: false })
        .limit(8),
    ]);
    setPersonalList(personalRows || []);
    setPublicList(publicRows || []);
    setHistory(historyRows || []);
    setLoading(false);
  }

  const currentList = tab === "personal" ? personalList : publicList;

  const filteredList = useMemo(() => {
    return currentList.filter((f) => {
      if (budgetFilter && f.budget_level !== budgetFilter) return false;
      if (openOnly && !f.is_open) return false;
      return true;
    });
  }, [currentList, budgetFilter, openOnly]);

  function openAdd() {
    setErrorMsg("");
    setDraft(emptyDraft(tab === "public"));
    setShowAdd(true);
  }

  async function saveDraft() {
    if (!draft.name.trim()) {
      setErrorMsg("请填写地点名称");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    const { error } = await supabase.from("food_places").insert({
      owner_id: user.id,
      name: draft.name.trim(),
      is_public: draft.isPublic,
      budget_level: draft.budgetLevel,
      is_open: draft.isOpen,
      wait_minutes: draft.waitMinutes,
      distance_meters: draft.distanceMeters,
    });
    setSaving(false);
    if (error) {
      setErrorMsg("保存失败：" + error.message);
      return;
    }
    setShowAdd(false);
    loadAll();
  }

  async function deleteItem(id) {
    await supabase.from("food_places").delete().eq("id", id);
    loadAll();
  }

  function draw() {
    if (filteredList.length === 0 || spinning) return;
    setSpinning(true);
    setResult(null);
    let count = 0;
    const timer = setInterval(async () => {
      count += 1;
      const flash = filteredList[Math.floor(Math.random() * filteredList.length)];
      setResult(flash);
      if (count > 12) {
        clearInterval(timer);
        const picked = filteredList[Math.floor(Math.random() * filteredList.length)];
        setResult(picked);
        setSpinning(false);
        await supabase.from("food_draw_history").insert({
          owner_id: user.id,
          food_place_id: picked.id,
          food_name_snapshot: picked.name,
        });
        loadAll();
      }
    }, 90);
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ margin: 0 }}>吃饭抽签</h2>
        <button className="btn" onClick={openAdd}>
          + 添加吃饭地点
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          className="btn"
          onClick={() => {
            setTab("personal");
            setResult(null);
          }}
          style={{
            background: tab === "personal" ? "var(--teal)" : "var(--teal-soft)",
            color: tab === "personal" ? "#fff" : "var(--teal)",
          }}
        >
          我的清单
        </button>
        <button
          className="btn"
          onClick={() => {
            setTab("public");
            setResult(null);
          }}
          style={{
            background: tab === "public" ? "var(--teal)" : "var(--teal-soft)",
            color: tab === "public" ? "#fff" : "var(--teal)",
          }}
        >
          公共清单
        </button>
      </div>

      {tab === "public" && (
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {BUDGET_LEVELS.map((b) => (
            <button
              key={b.value}
              className="btn secondary"
              onClick={() => setBudgetFilter(budgetFilter === b.value ? null : b.value)}
              style={{
                background: budgetFilter === b.value ? "var(--coral)" : "var(--coral-soft)",
                color: budgetFilter === b.value ? "#fff" : "var(--coral)",
              }}
            >
              {b.label}
            </button>
          ))}
          <button
            className="btn secondary"
            onClick={() => setOpenOnly((v) => !v)}
            style={{
              background: openOnly ? "var(--coral)" : "var(--coral-soft)",
              color: openOnly ? "#fff" : "var(--coral)",
            }}
          >
            只看营业中
          </button>
          {(budgetFilter || openOnly) && (
            <button
              className="btn secondary"
              onClick={() => {
                setBudgetFilter(null);
                setOpenOnly(false);
              }}
            >
              清除筛选
            </button>
          )}
        </div>
      )}

      <div className="card" style={{ textAlign: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 6 }}>
          当前可抽 {filteredList.length} 个地点
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, minHeight: 36, color: "var(--teal)", margin: "10px 0" }}>
          {result ? result.name : "？"}
        </div>
        <button className="btn" disabled={filteredList.length === 0 || spinning} onClick={draw}>
          {spinning ? "抽签中..." : "开始抽签"}
        </button>
      </div>

      {loading ? (
        <div style={{ color: "var(--ink-soft)" }}>加载中...</div>
      ) : filteredList.length === 0 ? (
        <div className="card" style={{ textAlign: "center", color: "var(--ink-soft)", padding: 30 }}>
          这里还没有地点，点上面"+ 添加吃饭地点"加一个吧
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filteredList.map((f) => (
            <div key={f.id} className="card" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{f.name}</div>
                <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                  {BUDGET_LEVELS.find((b) => b.value === f.budget_level)?.label || "预算未填"} ·{" "}
                  {f.is_open ? "营业中" : "已打烊"} · 约 {f.distance_meters}m · 等位 {f.wait_minutes} 分钟
                </div>
              </div>
              {f.owner_id === user.id && (
                <button className="btn danger" onClick={() => deleteItem(f.id)}>
                  删除
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>最近抽签记录</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {history.map((h) => (
              <div key={h.id} style={{ fontSize: 13, color: "var(--ink-soft)" }}>
                {new Date(h.drawn_at).toLocaleString("zh-CN")} · 抽中了 {h.food_name_snapshot}
              </div>
            ))}
          </div>
        </div>
      )}

      {showAdd && draft && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: 16,
          }}
          onClick={() => !saving && setShowAdd(false)}
        >
          <div className="card" style={{ width: 360, maxWidth: "100%" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>添加吃饭地点</h3>

            <div className="field">
              <label>加到哪个清单</label>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setDraft({ ...draft, isPublic: false })}
                  style={{
                    flex: 1,
                    background: !draft.isPublic ? "var(--teal)" : "var(--teal-soft)",
                    color: !draft.isPublic ? "#fff" : "var(--teal)",
                  }}
                >
                  我的清单
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setDraft({ ...draft, isPublic: true })}
                  style={{
                    flex: 1,
                    background: draft.isPublic ? "var(--teal)" : "var(--teal-soft)",
                    color: draft.isPublic ? "#fff" : "var(--teal)",
                  }}
                >
                  公共清单
                </button>
              </div>
            </div>

            <div className="field">
              <label>地点名称</label>
              <input
                className="input"
                placeholder="例如：南门烤肉"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>

            <div className="field">
              <label>预算</label>
              <select
                className="input"
                value={draft.budgetLevel}
                onChange={(e) => setDraft({ ...draft, budgetLevel: Number(e.target.value) })}
              >
                {BUDGET_LEVELS.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>大概距离（米）</label>
                <input
                  className="input"
                  type="number"
                  value={draft.distanceMeters}
                  onChange={(e) => setDraft({ ...draft, distanceMeters: Number(e.target.value) })}
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>等位时间（分钟）</label>
                <input
                  className="input"
                  type="number"
                  value={draft.waitMinutes}
                  onChange={(e) => setDraft({ ...draft, waitMinutes: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="field">
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={draft.isOpen}
                  onChange={(e) => setDraft({ ...draft, isOpen: e.target.checked })}
                />
                目前营业中
              </label>
            </div>

            {errorMsg && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 10 }}>{errorMsg}</div>}

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <div style={{ flex: 1 }} />
              <button className="btn secondary" disabled={saving} onClick={() => setShowAdd(false)}>
                取消
              </button>
              <button className="btn" disabled={saving} onClick={saveDraft}>
                {saving ? "保存中..." : "确认添加"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
