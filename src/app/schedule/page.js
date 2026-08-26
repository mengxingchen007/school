"use client";

import { Fragment, useEffect, useState } from "react";
import ProtectedShell from "@/components/ProtectedShell";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/lib/useUser";
import {
  WEEKDAY_LABELS,
  DEFAULT_PERIOD_TIMES,
  COLOR_HUE_PRESETS,
  WEEK_PATTERN_LABELS,
  courseActiveOnWeek,
} from "@/lib/constants";

function emptyDraft(day, period) {
  return {
    id: null,
    slotId: null,
    name: "",
    teacher: "",
    hue: COLOR_HUE_PRESETS[0],
    weekPattern: "all",
    day,
    periodStart: period,
    periodCount: 1,
  };
}

export default function SchedulePage() {
  return (
    <ProtectedShell>
      <ScheduleInner />
    </ProtectedShell>
  );
}

function ScheduleInner() {
  const { user } = useUser();
  const [courses, setCourses] = useState([]);
  const [slots, setSlots] = useState([]);
  const [week, setWeek] = useState(1);
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
    const [{ data: courseRows }, { data: slotRows }] = await Promise.all([
      supabase.from("courses").select("*").eq("owner_id", user.id),
      supabase.from("schedule_slots").select("*").eq("owner_id", user.id),
    ]);
    setCourses(courseRows || []);
    setSlots(slotRows || []);
    setLoading(false);
  }

  function slotAt(day, period) {
    return slots.find((s) => {
      if (s.day_of_week !== day) return false;
      if (period < s.period_start || period >= s.period_start + s.period_count) return false;
      const course = courses.find((c) => c.id === s.course_id);
      if (!course) return false;
      return courseActiveOnWeek(course, week);
    });
  }

  function openAddAt(day, period) {
    setErrorMsg("");
    setDraft(emptyDraft(day, period));
  }

  function openEdit(slot) {
    const course = courses.find((c) => c.id === slot.course_id);
    if (!course) return;
    setErrorMsg("");
    setDraft({
      id: course.id,
      slotId: slot.id,
      name: course.name,
      teacher: course.teacher || "",
      hue: course.color_hue,
      weekPattern: course.week_pattern,
      day: slot.day_of_week,
      periodStart: slot.period_start,
      periodCount: slot.period_count,
    });
  }

  async function saveDraft() {
    if (!draft.name.trim()) {
      setErrorMsg("请填写课程名称");
      return;
    }
    setSaving(true);
    setErrorMsg("");

    if (draft.id) {
      // 编辑已有课程
      const { error: cErr } = await supabase
        .from("courses")
        .update({
          name: draft.name.trim(),
          teacher: draft.teacher.trim(),
          color_hue: draft.hue,
          week_pattern: draft.weekPattern,
        })
        .eq("id", draft.id);
      const { error: sErr } = await supabase
        .from("schedule_slots")
        .update({
          day_of_week: draft.day,
          period_start: draft.periodStart,
          period_count: draft.periodCount,
        })
        .eq("id", draft.slotId);
      if (cErr || sErr) {
        setErrorMsg("保存失败：" + (cErr?.message || sErr?.message));
        setSaving(false);
        return;
      }
    } else {
      // 新建课程 + 新建格子
      const { data: newCourse, error: cErr } = await supabase
        .from("courses")
        .insert({
          owner_id: user.id,
          name: draft.name.trim(),
          teacher: draft.teacher.trim(),
          color_hue: draft.hue,
          week_pattern: draft.weekPattern,
        })
        .select()
        .single();
      if (cErr) {
        setErrorMsg("保存失败：" + cErr.message);
        setSaving(false);
        return;
      }
      const { error: sErr } = await supabase.from("schedule_slots").insert({
        owner_id: user.id,
        course_id: newCourse.id,
        day_of_week: draft.day,
        period_start: draft.periodStart,
        period_count: draft.periodCount,
      });
      if (sErr) {
        setErrorMsg("保存失败：" + sErr.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setDraft(null);
    loadAll();
  }

  async function deleteDraft() {
    if (!draft?.id) return;
    setSaving(true);
    await supabase.from("courses").delete().eq("id", draft.id); // 级联删除对应的 schedule_slots
    setSaving(false);
    setDraft(null);
    loadAll();
  }

  const periods = DEFAULT_PERIOD_TIMES;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ margin: 0 }}>课表</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="btn secondary" onClick={() => setWeek((w) => Math.max(1, w - 1))}>
            上一周
          </button>
          <span style={{ fontWeight: 600 }}>第 {week} 周</span>
          <button className="btn secondary" onClick={() => setWeek((w) => w + 1)}>
            下一周
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ color: "var(--ink-soft)" }}>加载中...</div>
      ) : (
        <div className="card" style={{ overflowX: "auto", padding: 0 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "56px repeat(7, minmax(96px, 1fr))",
              minWidth: 760,
            }}
          >
            <div />
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                style={{
                  padding: "10px 4px",
                  textAlign: "center",
                  fontWeight: 600,
                  fontSize: 13,
                  borderBottom: "1px solid var(--border)",
                  borderLeft: "1px solid var(--border)",
                }}
              >
                {label}
              </div>
            ))}

            {periods.map((p) => (
              <Fragment key={p.period}>
                <div
                  style={{
                    padding: "8px 4px",
                    textAlign: "center",
                    fontSize: 11,
                    color: "var(--ink-soft)",
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <div>{p.period}</div>
                  <div>{p.start}</div>
                </div>
                {WEEKDAY_LABELS.map((_, dayIdx) => {
                  const slot = slotAt(dayIdx, p.period);
                  const isStart = slot && slot.period_start === p.period;
                  if (slot && !isStart) return null; // 被上面的格子合并占用了
                  const course = slot ? courses.find((c) => c.id === slot.course_id) : null;
                  return (
                    <div
                      key={dayIdx + "-" + p.period}
                      onClick={() => (slot ? openEdit(slot) : openAddAt(dayIdx, p.period))}
                      style={{
                        gridRow: slot ? `span ${slot.period_count}` : undefined,
                        minHeight: 56,
                        borderTop: "1px solid var(--border)",
                        borderLeft: "1px solid var(--border)",
                        padding: 4,
                        cursor: "pointer",
                      }}
                    >
                      {course && (
                        <div
                          style={{
                            height: "100%",
                            borderRadius: 8,
                            padding: "6px 8px",
                            background: `hsl(${course.color_hue}, 60%, 92%)`,
                            color: `hsl(${course.color_hue}, 55%, 30%)`,
                            fontSize: 12,
                          }}
                        >
                          <div style={{ fontWeight: 700 }}>{course.name}</div>
                          {course.teacher && <div>{course.teacher}</div>}
                          {course.week_pattern !== "all" && (
                            <div style={{ opacity: 0.8 }}>{WEEK_PATTERN_LABELS[course.week_pattern]}</div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      )}

      <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 12 }}>
        点空格子可以添加新课程，点已有的课程格子可以编辑或删除。
      </p>

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
          <div className="card" style={{ width: 360, maxWidth: "100%" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>{draft.id ? "编辑课程" : "添加课程"}</h3>

            <div className="field">
              <label>课程名称</label>
              <input
                className="input"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="field">
              <label>任课老师（可选）</label>
              <input
                className="input"
                value={draft.teacher}
                onChange={(e) => setDraft({ ...draft, teacher: e.target.value })}
              />
            </div>
            <div className="field">
              <label>颜色</label>
              <div style={{ display: "flex", gap: 8 }}>
                {COLOR_HUE_PRESETS.map((hue) => (
                  <div
                    key={hue}
                    onClick={() => setDraft({ ...draft, hue })}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      background: `hsl(${hue}, 60%, 60%)`,
                      cursor: "pointer",
                      border: draft.hue === hue ? "2px solid #333" : "2px solid transparent",
                    }}
                  />
                ))}
              </div>
            </div>
            <div className="field">
              <label>上课周次</label>
              <select
                className="input"
                value={draft.weekPattern}
                onChange={(e) => setDraft({ ...draft, weekPattern: e.target.value })}
              >
                <option value="all">每周</option>
                <option value="odd">单周</option>
                <option value="even">双周</option>
              </select>
            </div>
            <div className="field">
              <label>星期</label>
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
            <div style={{ display: "flex", gap: 10 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>第几节开始</label>
                <select
                  className="input"
                  value={draft.periodStart}
                  onChange={(e) => setDraft({ ...draft, periodStart: Number(e.target.value) })}
                >
                  {DEFAULT_PERIOD_TIMES.map((p) => (
                    <option key={p.period} value={p.period}>
                      第{p.period}节
                    </option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>连续几节</label>
                <select
                  className="input"
                  value={draft.periodCount}
                  onChange={(e) => setDraft({ ...draft, periodCount: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n} 节
                    </option>
                  ))}
                </select>
              </div>
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
