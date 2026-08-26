"use client";

import { useEffect, useMemo, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/lib/useUser";
import { WEEKDAY_LABELS, TASK_TYPE_INFO } from "@/lib/constants";

function emptyDraft() {
  return {
    id: null,
    type: "assignment",
    title: "",
    courseId: "",
    week: 1,
    day: 0,
    timeNote: "",
    note: "",
  };
}

export default function TasksPage() {
  return (
    <ProtectedShell>
      <TasksInner />
    </ProtectedShell>
  );
}

function TasksInner() {
  const { user } = useUser();
  const [tasks, setTasks] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (user) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadAll() {
    setLoading(true);
    const [{ data: taskRows }, { data: courseRows }] = await Promise.all([
      supabase
        .from("tasks")
        .select("*")
        .eq("owner_id", user.id)
        .order("week_number", { ascending: true })
        .order("day_of_week", { ascending: true }),
      supabase.from("courses").select("*").eq("owner_id", user.id),
    ]);
    setTasks(taskRows || []);
    setCourses(courseRows || []);
    setLoading(false);
  }

  function courseName(id) {
    return courses.find((c) => c.id === id)?.name || "";
  }

  const pending = useMemo(() => tasks.filter((t) => !t.done), [tasks]);
  const done = useMemo(() => tasks.filter((t) => t.done), [tasks]);

  // 近期待办：还没完成的，按周次+星期排序，取前 3 条
  const upcoming = useMemo(() => pending.slice(0, 3), [pending]);

  function openAdd() {
    setErrorMsg("");
    setDraft(emptyDraft());
  }

  function openEdit(task) {
    setErrorMsg("");
    setDraft({
      id: task.id,
      type: task.type,
      title: task.title,
      courseId: task.course_id || "",
      week: task.week_number,
      day: task.day_of_week,
      timeNote: task.time_note || "",
      note: task.note || "",
    });
  }

  async function toggleDone(task) {
    await supabase.from("tasks").update({ done: !task.done }).eq("id", task.id);
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)));
  }

  async function saveDraft() {
    if (!draft.title.trim()) {
      setErrorMsg("请填写标题");
      return;
    }
    setSaving(true);
    setErrorMsg("");

    const payload = {
      type: draft.type,
      title: draft.title.trim(),
      course_id: draft.courseId || null,
      week_number: draft.week,
      day_of_week: draft.day,
      time_note: draft.timeNote.trim(),
      note: draft.note.trim(),
    };

    let error;
    if (draft.id) {
      ({ error } = await supabase.from("tasks").update(payload).eq("id", draft.id));
    } else {
      ({ error } = await supabase.from("tasks").insert({ ...payload, owner_id: user.id }));
    }

    setSaving(false);
    if (error) {
      setErrorMsg("保存失败：" + error.message);
      return;
    }
    setDraft(null);
    loadAll();
  }

  async function deleteDraft() {
    if (!draft?.id) return;
    setSaving(true);
    await supabase.from("tasks").delete().eq("id", draft.id);
    setSaving(false);
    setDraft(null);
    loadAll();
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>作业考试</h2>
        <button className="btn" onClick={openAdd}>
          + 添加
        </button>
      </div>

      {!loading && upcoming.length > 0 && (
        <div
          className="card"
          style={{ marginBottom: 16, background: "var(--amber-soft)", border: "1px solid transparent" }}
        >
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>近期待办</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {upcoming.map((t) => (
              <TaskChip key={t.id} task={t} courseName={courseName(t.courseId ?? t.course_id)} onToggle={() => toggleDone(t)} onClick={() => openEdit(t)} />
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ color: "var(--ink-soft)" }}>加载中...</div>
      ) : tasks.length === 0 ? (
        <div className="card" style={{ textAlign: "center", color: "var(--ink-soft)", padding: 40 }}>
          还没有记录，点右上角"+ 添加"来记一条作业或考试的 DDL 吧
        </div>
      ) : (
        <>
          <SectionList title="未完成" items={pending} courseName={courseName} onToggle={toggleDone} onEdit={openEdit} />
          <SectionList title="已完成" items={done} courseName={courseName} onToggle={toggleDone} onEdit={openEdit} dim />
        </>
      )}

      {draft && (
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
          onClick={() => !saving && setDraft(null)}
        >
          <div className="card" style={{ width: 380, maxWidth: "100%" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{draft.id ? "编辑记录" : "添加记录"}</h3>

            <div className="field">
              <label>类型</label>
              <div style={{ display: "flex", gap: 8 }}>
                {Object.entries(TASK_TYPE_INFO).map(([key, info]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setDraft({ ...draft, type: key })}
                    className="btn"
                    style={{
                      flex: 1,
                      background: draft.type === key ? `hsl(${info.hue}, 70%, 50%)` : "var(--teal-soft)",
                      color: draft.type === key ? "#fff" : "var(--ink)",
                    }}
                  >
                    {info.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>标题</label>
              <input
                className="input"
                placeholder={draft.type === "exam" ? "例如：高等数学期中考试" : "例如：第三章课后习题"}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </div>

            <div className="field">
              <label>关联课程（可选）</label>
              <select
                className="input"
                value={draft.courseId}
                onChange={(e) => setDraft({ ...draft, courseId: e.target.value })}
              >
                <option value="">不关联</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>第几周到期</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={draft.week}
                  onChange={(e) => setDraft({ ...draft, week: Number(e.target.value) })}
                />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>星期几到期</label>
                <select
                  className="input"
                  value={draft.day}
                  onChange={(e) => setDraft({ ...draft, day: Number(e.target.value) })}
                >
                  {WEEKDAY_LABELS.map((label, idx) => (
                    <option key={idx} value={idx}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label>具体时间备注（可选，比如"晚上11点前"）</label>
              <input
                className="input"
                value={draft.timeNote}
                onChange={(e) => setDraft({ ...draft, timeNote: e.target.value })}
              />
            </div>

            <div className="field">
              <label>备注（可选）</label>
              <textarea
                className="input"
                rows={2}
                value={draft.note}
                onChange={(e) => setDraft({ ...draft, note: e.target.value })}
              />
            </div>

            {errorMsg && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 10 }}>{errorMsg}</div>}

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {draft.id && (
                <button className="btn danger" disabled={saving} onClick={deleteDraft}>
                  删除
                </button>
              )}
              <div style={{ flex: 1 }} />
              <button className="btn secondary" disabled={saving} onClick={() => setDraft(null)}>
                取消
              </button>
              <button className="btn" disabled={saving} onClick={saveDraft}>
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionList({ title, items, courseName, onToggle, onEdit, dim }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink-soft)", marginBottom: 8 }}>
        {title}（{items.length}）
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((t) => (
          <div
            key={t.id}
            className="card"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              opacity: dim ? 0.55 : 1,
              cursor: "pointer",
            }}
            onClick={() => onEdit(t)}
          >
            <input
              type="checkbox"
              checked={t.done}
              onChange={(e) => {
                e.stopPropagation();
                onToggle(t);
              }}
              onClick={(e) => e.stopPropagation()}
              style={{ width: 18, height: 18 }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: 6,
                background: `hsl(${TASK_TYPE_INFO[t.type].hue}, 70%, 94%)`,
                color: `hsl(${TASK_TYPE_INFO[t.type].hue}, 60%, 40%)`,
              }}
            >
              {TASK_TYPE_INFO[t.type].label}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, textDecoration: t.done ? "line-through" : "none" }}>{t.title}</div>
              <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                {courseName(t.course_id) && courseName(t.course_id) + " · "}
                第{t.week_number}周 {WEEKDAY_LABELS[t.day_of_week]}
                {t.time_note ? " · " + t.time_note : ""}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TaskChip({ task, courseName, onToggle, onClick }) {
  const info = TASK_TYPE_INFO[task.type];
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "#fff",
        borderRadius: 8,
        padding: "6px 10px",
        cursor: "pointer",
        fontSize: 13,
      }}
    >
      <span
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: `hsl(${info.hue}, 70%, 55%)`,
          flexShrink: 0,
        }}
        title="点击标记完成"
      />
      <span style={{ fontWeight: 600 }}>{task.title}</span>
      <span style={{ color: "var(--ink-soft)" }}>
        {courseName && courseName + " · "}第{task.week_number}周 {WEEKDAY_LABELS[task.day_of_week]}
      </span>
    </div>
  );
}
