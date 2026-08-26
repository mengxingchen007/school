"use client";

import { useEffect, useMemo, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/lib/useUser";

export default function GroupPage() {
  return (
    <ProtectedShell>
      <GroupInner />
    </ProtectedShell>
  );
}

function GroupInner() {
  const { user, isAdmin } = useUser();
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [members, setMembers] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const [newGroupName, setNewGroupName] = useState("");
  const [newMemberName, setNewMemberName] = useState("");

  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (user) loadGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (selectedGroupId) loadGroupDetail(selectedGroupId);
  }, [selectedGroupId]);

  async function loadGroups() {
    setLoading(true);
    const { data } = await supabase.from("groups").select("*").order("created_at", { ascending: true });
    setGroups(data || []);
    if (data && data.length > 0 && !selectedGroupId) {
      setSelectedGroupId(data[0].id);
    }
    setLoading(false);
  }

  async function loadGroupDetail(groupId) {
    setResult(null);
    const [{ data: memberRows }, { data: historyRows }] = await Promise.all([
      supabase.from("group_members").select("*").eq("group_id", groupId).order("created_at", { ascending: true }),
      supabase
        .from("group_draw_history")
        .select("*")
        .eq("group_id", groupId)
        .order("drawn_at", { ascending: false })
        .limit(10),
    ]);
    setMembers(memberRows || []);
    setHistory(historyRows || []);
  }

  const selectedGroup = useMemo(() => groups.find((g) => g.id === selectedGroupId), [groups, selectedGroupId]);

  async function addGroup() {
    if (!newGroupName.trim()) return;
    setErrorMsg("");
    const { data, error } = await supabase
      .from("groups")
      .insert({ owner_id: user.id, name: newGroupName.trim() })
      .select()
      .single();
    if (error) {
      setErrorMsg("添加失败：" + error.message);
      return;
    }
    setNewGroupName("");
    await loadGroups();
    setSelectedGroupId(data.id);
  }

  async function deleteGroup() {
    if (!selectedGroup) return;
    await supabase.from("groups").delete().eq("id", selectedGroup.id);
    setSelectedGroupId(null);
    loadGroups();
  }

  async function addMember() {
    if (!newMemberName.trim() || !selectedGroupId) return;
    setErrorMsg("");
    const { error } = await supabase
      .from("group_members")
      .insert({ group_id: selectedGroupId, name: newMemberName.trim() });
    if (error) {
      setErrorMsg("添加失败：" + error.message);
      return;
    }
    setNewMemberName("");
    loadGroupDetail(selectedGroupId);
  }

  async function deleteMember(id) {
    await supabase.from("group_members").delete().eq("id", id);
    loadGroupDetail(selectedGroupId);
  }

  function draw() {
    if (members.length === 0 || spinning) return;
    setSpinning(true);
    setResult(null);
    let count = 0;
    const timer = setInterval(async () => {
      count += 1;
      const flash = members[Math.floor(Math.random() * members.length)];
      setResult(flash);
      if (count > 12) {
        clearInterval(timer);
        const picked = members[Math.floor(Math.random() * members.length)];
        setResult(picked);
        setSpinning(false);
        await supabase.from("group_draw_history").insert({
          owner_id: user.id,
          group_id: selectedGroupId,
          member_name_snapshot: picked.name,
        });
        loadGroupDetail(selectedGroupId);
      }
    }, 90);
  }

  return (
    <div>
      <h2 style={{ marginTop: 0 }}>分组抽签</h2>

      {loading ? (
        <div style={{ color: "var(--ink-soft)" }}>加载中...</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16 }}>
          <div className="card">
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>分组列表</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => setSelectedGroupId(g.id)}
                  className="btn"
                  style={{
                    justifyContent: "flex-start",
                    background: g.id === selectedGroupId ? "var(--teal)" : "var(--teal-soft)",
                    color: g.id === selectedGroupId ? "#fff" : "var(--teal)",
                  }}
                >
                  {g.name}
                </button>
              ))}
              {groups.length === 0 && <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>还没有分组</div>}
            </div>

            {isAdmin && (
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  className="input"
                  placeholder="新分组名"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                />
                <button className="btn secondary" onClick={addGroup}>
                  添加
                </button>
              </div>
            )}
          </div>

          <div>
            {!selectedGroup ? (
              <div className="card" style={{ textAlign: "center", color: "var(--ink-soft)", padding: 40 }}>
                {groups.length === 0
                  ? isAdmin
                    ? "先在左边添加一个分组吧"
                    : "还没有分组，请等管理员创建"
                  : "请选择左边的一个分组"}
              </div>
            ) : (
              <>
                <div className="card" style={{ textAlign: "center", marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: "var(--ink-soft)", marginBottom: 6 }}>
                    {selectedGroup.name} · 共 {members.length} 人
                  </div>
                  <div
                    style={{
                      fontSize: 28,
                      fontWeight: 800,
                      minHeight: 40,
                      color: "var(--teal)",
                      margin: "12px 0",
                    }}
                  >
                    {result ? result.name : "？"}
                  </div>
                  <button className="btn" disabled={members.length === 0 || spinning} onClick={draw}>
                    {spinning ? "抽签中..." : "开始抽签"}
                  </button>
                  {isAdmin && (
                    <div style={{ marginTop: 10 }}>
                      <button className="btn danger" onClick={deleteGroup}>
                        删除此分组
                      </button>
                    </div>
                  )}
                </div>

                <div className="card" style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>成员名单</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: isAdmin ? 12 : 0 }}>
                    {members.map((m) => (
                      <span
                        key={m.id}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 8,
                          background: "var(--teal-soft)",
                          color: "var(--teal)",
                          fontSize: 13,
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        {m.name}
                        {isAdmin && (
                          <span
                            onClick={() => deleteMember(m.id)}
                            style={{ cursor: "pointer", color: "var(--red)" }}
                          >
                            ×
                          </span>
                        )}
                      </span>
                    ))}
                    {members.length === 0 && (
                      <span style={{ fontSize: 13, color: "var(--ink-soft)" }}>还没有成员</span>
                    )}
                  </div>
                  {isAdmin && (
                    <div style={{ display: "flex", gap: 6 }}>
                      <input
                        className="input"
                        placeholder="新成员姓名"
                        value={newMemberName}
                        onChange={(e) => setNewMemberName(e.target.value)}
                      />
                      <button className="btn secondary" onClick={addMember}>
                        添加
                      </button>
                    </div>
                  )}
                </div>

                {history.length > 0 && (
                  <div className="card">
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>最近抽签记录</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {history.map((h) => (
                        <div key={h.id} style={{ fontSize: 13, color: "var(--ink-soft)" }}>
                          {new Date(h.drawn_at).toLocaleString("zh-CN")} · 抽中了 {h.member_name_snapshot}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {errorMsg && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 10 }}>{errorMsg}</div>}

      {!isAdmin && (
        <p style={{ fontSize: 12, color: "var(--ink-soft)", marginTop: 16 }}>
          分组名单只有管理员能添加/修改，其他同学可以查看和参与抽签。
        </p>
      )}
    </div>
  );
}
