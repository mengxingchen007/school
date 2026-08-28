"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedShell from "@/components/ProtectedShell";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/lib/useUser";
import {
  WEEKDAY_LABELS,
  DEFAULT_PERIOD_TIMES,
  COLOR_HUE_PRESETS,
  WEEK_PATTERN_LABELS,
  TASK_TYPE_INFO,
  courseActiveOnWeek,
} from "@/lib/constants";

const ALL_WEEK_NUMBERS = Array.from({ length: 20 }, (_, i) => i + 1);
const ODD_WEEK_NUMBERS = ALL_WEEK_NUMBERS.filter((w) => w % 2 === 1);
const EVEN_WEEK_NUMBERS = ALL_WEEK_NUMBERS.filter((w) => w % 2 === 0);

// 把旧数据（week_pattern 是 all/odd/even/custom）换算成具体的周数列表，方便在勾选格里显示
function weeksFromCourse(course) {
  if (course.week_pattern === "odd") return [...ODD_WEEK_NUMBERS];
  if (course.week_pattern === "even") return [...EVEN_WEEK_NUMBERS];
  if (course.week_pattern === "custom") return course.custom_weeks || [];
  return [...ALL_WEEK_NUMBERS];
}

function emptyDraft(day, period) {
  return {
    id: null,
    slotId: null,
    name: "",
    teacher: "",
    location: "",
    hue: COLOR_HUE_PRESETS[0],
    customWeeks: [...ALL_WEEK_NUMBERS],
    day,
    periodStart: period,
    periodCount: 1,
  };
}

// 把用户选的图片压缩到一个合理的尺寸再转成 base64，避免手机拍照的原图太大（上传慢、也可能超出后端处理上限）
function resizeImageForRecognition(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("图片解析失败，换一张试试"));
      img.onload = () => {
        const maxDim = 1600;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
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
  const router = useRouter();
  const [courses, setCourses] = useState([]);
  const [slots, setSlots] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [periodTimes, setPeriodTimes] = useState(DEFAULT_PERIOD_TIMES);
  const [week, setWeek] = useState(1);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const dragRef = useRef({ active: false, target: true });

  // ↓↓↓ 拍照识别课表功能用到的状态，独立于上面已有的逻辑
  const [showRecognize, setShowRecognize] = useState(false);
  const [recognizeImage, setRecognizeImage] = useState(null);
  const [recognizing, setRecognizing] = useState(false);
  const [recognizeError, setRecognizeError] = useState("");
  const [recognizedCourses, setRecognizedCourses] = useState([]);
  const [importing, setImporting] = useState(false);
  const recognizeFileInputRef = useRef(null);

  useEffect(() => {
    function endDrag() {
      dragRef.current.active = false;
    }
    window.addEventListener("mouseup", endDrag);
    window.addEventListener("touchend", endDrag);
    return () => {
      window.removeEventListener("mouseup", endDrag);
      window.removeEventListener("touchend", endDrag);
    };
  }, []);

  useEffect(() => {
    if (user) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadAll() {
    setLoading(true);
    const [{ data: courseRows }, { data: slotRows }, { data: taskRows }, { data: periodRows }] = await Promise.all([
      supabase.from("courses").select("*").eq("owner_id", user.id),
      supabase.from("schedule_slots").select("*").eq("owner_id", user.id),
      supabase.from("tasks").select("*").eq("owner_id", user.id),
      supabase.from("period_times").select("*").eq("owner_id", user.id),
    ]);
    setCourses(courseRows || []);
    setSlots(slotRows || []);
    setTasks(taskRows || []);
    // 如果用户在"设置"页面自定义过某一节课的时间，就用自定义的；没设置过的节次照旧用默认时间
    const mergedPeriodTimes = DEFAULT_PERIOD_TIMES.map((p) => {
      const custom = (periodRows || []).find((r) => r.period_number === p.period);
      return custom
        ? { period: p.period, start: custom.start_time.slice(0, 5), duration: custom.duration_minutes }
        : p;
    });
    setPeriodTimes(mergedPeriodTimes);
    setLoading(false);
  }

  // 某门课在当前查看的这一周，有没有关联的、还没完成的作业/考试
  function pendingTasksForCourse(courseId) {
    return tasks.filter((t) => t.course_id === courseId && t.week_number === week && !t.done);
  }

  // 当前查看的这一周，某一天有哪些还没完成的作业/考试（不管这天有没有课）
  function pendingTasksForDay(dayIdx) {
    return tasks.filter((t) => t.week_number === week && t.day_of_week === dayIdx && !t.done);
  }

  async function toggleTaskDone(task) {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: true } : t)));
    await supabase.from("tasks").update({ done: true }).eq("id", task.id);
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
      location: course.location || "",
      hue: course.color_hue,
      customWeeks: weeksFromCourse(course),
      day: slot.day_of_week,
      periodStart: slot.period_start,
      periodCount: slot.period_count,
    });
  }

  function setWeekChecked(w, checked) {
    setDraft((prev) => {
      const has = prev.customWeeks.includes(w);
      if (has === checked) return prev;
      const next = checked ? [...prev.customWeeks, w] : prev.customWeeks.filter((x) => x !== w);
      return { ...prev, customWeeks: next };
    });
  }

  function handleWeekDown(w) {
    const isChecked = draft.customWeeks.includes(w);
    const target = !isChecked;
    dragRef.current = { active: true, target };
    setWeekChecked(w, target);
  }

  function handleWeekEnter(w) {
    if (!dragRef.current.active) return;
    setWeekChecked(w, dragRef.current.target);
  }

  function handleWeekTouchMove(e) {
    if (!dragRef.current.active) return;
    const touch = e.touches[0];
    if (!touch) return;
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const w = el?.getAttribute?.("data-week");
    if (w) {
      e.preventDefault();
      setWeekChecked(Number(w), dragRef.current.target);
    }
  }

  function applyWeekPreset(list) {
    setDraft((prev) => ({ ...prev, customWeeks: [...list] }));
  }

  async function saveDraft() {
    if (!draft.name.trim()) {
      setErrorMsg("请填写课程名称");
      return;
    }
    if (draft.customWeeks.length === 0) {
      setErrorMsg("请至少选一个上课周");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    const isAllWeeks = draft.customWeeks.length === ALL_WEEK_NUMBERS.length;
    const weekPatternToSave = isAllWeeks ? "all" : "custom";
    const customWeeksToSave = isAllWeeks ? null : [...draft.customWeeks].sort((a, b) => a - b);

    if (draft.id) {
      // 编辑已有课程
      const { error: cErr } = await supabase
        .from("courses")
        .update({
          name: draft.name.trim(),
          teacher: draft.teacher.trim(),
          location: draft.location.trim(),
          color_hue: draft.hue,
          week_pattern: weekPatternToSave,
          custom_weeks: customWeeksToSave,
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
          location: draft.location.trim(),
          color_hue: draft.hue,
          week_pattern: weekPatternToSave,
          custom_weeks: customWeeksToSave,
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

  // ↓↓↓ 拍照识别课表：全部是新增的功能，不会调用/影响上面已有的添加课程逻辑
  function openRecognize() {
    setRecognizeError("");
    setRecognizeImage(null);
    setRecognizedCourses([]);
    setShowRecognize(true);
  }

  async function handleRecognizeFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setRecognizeError("");
    setRecognizedCourses([]);
    try {
      const dataUrl = await resizeImageForRecognition(file);
      setRecognizeImage(dataUrl);
    } catch (err) {
      setRecognizeError("图片处理失败：" + err.message);
    }
  }

  async function runRecognition() {
    if (!recognizeImage) return;
    setRecognizing(true);
    setRecognizeError("");
    try {
      const base64 = recognizeImage.split(",")[1];
      const res = await fetch("/api/recognize-schedule", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType: "image/jpeg" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRecognizeError(data.error || "识别失败，请重试");
        setRecognizing(false);
        return;
      }
      const drafts = (data.courses || []).map((c, idx) => ({
        include: true,
        name: c.name || "",
        teacher: c.teacher || "",
        location: c.location || "",
        day: typeof c.day_of_week === "number" ? c.day_of_week : 0,
        periodStart: c.period_start || 1,
        periodCount: c.period_count || 1,
        weekPattern: ["all", "odd", "even"].includes(c.week_pattern) ? c.week_pattern : "all",
        hue: COLOR_HUE_PRESETS[idx % COLOR_HUE_PRESETS.length],
      }));
      setRecognizedCourses(drafts);
      if (drafts.length === 0) {
        setRecognizeError("没识别出课程，换一张更清晰、更完整的课表图片再试试");
      }
    } catch (err) {
      setRecognizeError("识别失败：" + err.message);
    }
    setRecognizing(false);
  }

  function updateRecognizedCourse(idx, patch) {
    setRecognizedCourses((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }

  function removeRecognizedRow(idx) {
    setRecognizedCourses((prev) => prev.filter((_, i) => i !== idx));
  }

  async function confirmImport() {
    const toImport = recognizedCourses.filter((c) => c.include && c.name.trim());
    if (toImport.length === 0) {
      setRecognizeError("请至少保留一门课程再导入");
      return;
    }
    setImporting(true);
    setRecognizeError("");
    for (const c of toImport) {
      const { data: newCourse, error: cErr } = await supabase
        .from("courses")
        .insert({
          owner_id: user.id,
          name: c.name.trim(),
          teacher: c.teacher.trim(),
          location: (c.location || "").trim(),
          color_hue: c.hue,
          week_pattern: c.weekPattern,
          custom_weeks: null,
        })
        .select()
        .single();
      if (cErr) {
        setRecognizeError("导入「" + c.name + "」失败：" + cErr.message);
        setImporting(false);
        return;
      }
      const { error: sErr } = await supabase.from("schedule_slots").insert({
        owner_id: user.id,
        course_id: newCourse.id,
        day_of_week: c.day,
        period_start: c.periodStart,
        period_count: c.periodCount,
      });
      if (sErr) {
        setRecognizeError("导入「" + c.name + "」失败：" + sErr.message);
        setImporting(false);
        return;
      }
    }
    setImporting(false);
    setShowRecognize(false);
    loadAll();
  }

  const periods = periodTimes;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ margin: 0 }}>课表</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <button className="btn secondary" onClick={openRecognize}>
            拍照识别课表
          </button>
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
              // 用 minmax(0, 1fr) 让每一列可以缩到比内容还窄，整周 7 天能在手机屏幕宽度内完整显示，不用左右滑动
              gridTemplateColumns: "30px repeat(7, minmax(0, 1fr))",
            }}
          >
            <div />
            {WEEKDAY_LABELS.map((label) => (
              <div
                key={label}
                style={{
                  padding: "8px 4px",
                  textAlign: "center",
                  fontWeight: 600,
                  fontSize: 11,
                  borderBottom: "1px solid var(--border)",
                  borderLeft: "1px solid var(--border)",
                }}
              >
                {label}
              </div>
            ))}

            <div style={{ borderTop: "1px solid var(--border)" }} />
            {WEEKDAY_LABELS.map((_, dayIdx) => {
              const dayTasks = pendingTasksForDay(dayIdx);
              return (
                <div
                  key={"ddl-" + dayIdx}
                  style={{
                    borderTop: "1px solid var(--border)",
                    borderLeft: "1px solid var(--border)",
                    minHeight: 26,
                    padding: "3px 4px",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 3,
                    alignContent: "flex-start",
                  }}
                >
                  {dayTasks.map((t) => {
                    const course = courses.find((c) => c.id === t.course_id);
                    const label = course ? course.name.slice(0, 2) : TASK_TYPE_INFO[t.type].initial;
                    const bgHue = course ? course.color_hue : TASK_TYPE_INFO[t.type].hue;
                    return (
                      <div
                        key={t.id}
                        onClick={() => toggleTaskDone(t)}
                        title={`${course ? course.name + " · " : ""}${t.title}（点击标记完成）`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 3,
                          padding: "1px 5px",
                          borderRadius: 6,
                          fontSize: 9,
                          fontWeight: 600,
                          cursor: "pointer",
                          background: `hsl(${bgHue}, 65%, 90%)`,
                          color: `hsl(${bgHue}, 55%, 32%)`,
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: `hsl(${TASK_TYPE_INFO[t.type].hue}, 75%, 50%)`,
                            flexShrink: 0,
                          }}
                        />
                        {label}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {periods.map((p) => (
              <Fragment key={p.period}>
                <div
                  style={{
                    padding: "6px 2px",
                    textAlign: "center",
                    color: "var(--ink-soft)",
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 700 }}>{p.period}</div>
                  <div style={{ fontSize: 7 }}>{p.start}</div>
                </div>
                {WEEKDAY_LABELS.map((_, dayIdx) => {
                  const slot = slotAt(dayIdx, p.period);
                  const isStart = slot && slot.period_start === p.period;
                  if (slot && !isStart) return null; // 被上面的格子合并占用了
                  const course = slot ? courses.find((c) => c.id === slot.course_id) : null;
                  const pendingCourseTasks = course ? pendingTasksForCourse(course.id) : [];
                  return (
                    <div
                      key={dayIdx + "-" + p.period}
                      onClick={() => (slot ? openEdit(slot) : openAddAt(dayIdx, p.period))}
                      style={{
                        gridRow: slot ? `span ${slot.period_count}` : undefined,
                        minHeight: 56,
                        borderTop: "1px solid var(--border)",
                        borderLeft: "1px solid var(--border)",
                        padding: 2,
                        cursor: "pointer",
                        overflow: "hidden",
                      }}
                    >
                      {course && (
                        <div
                          style={{
                            position: "relative",
                            height: "100%",
                            borderRadius: 8,
                            padding: "4px 3px",
                            background: `hsl(${course.color_hue}, 60%, 92%)`,
                            color: `hsl(${course.color_hue}, 55%, 30%)`,
                            fontSize: 10,
                            wordBreak: "break-word",
                          }}
                        >
                          {pendingCourseTasks.length > 0 && (
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push("/tasks");
                              }}
                              title={pendingCourseTasks.map((t) => t.title).join("、")}
                              style={{
                                position: "absolute",
                                top: -6,
                                right: -6,
                                display: "flex",
                                gap: 2,
                                cursor: "pointer",
                              }}
                            >
                              {pendingCourseTasks.slice(0, 3).map((t) => (
                                <span
                                  key={t.id}
                                  style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: "50%",
                                    display: "block",
                                    background: `hsl(${TASK_TYPE_INFO[t.type].hue}, 75%, 50%)`,
                                    border: "1.5px solid #fff",
                                    boxShadow: "0 0 0 1px rgba(0,0,0,0.1)",
                                  }}
                                />
                              ))}
                            </div>
                          )}
                          <div style={{ fontWeight: 700 }}>{course.name}</div>
                          {course.teacher && <div style={{ fontSize: 9 }}>{course.teacher}</div>}
                          {course.location && <div style={{ fontSize: 9 }}>{course.location}</div>}
                          {course.week_pattern !== "all" && (
                            <div style={{ opacity: 0.8, fontSize: 9 }}>{WEEK_PATTERN_LABELS[course.week_pattern]}</div>
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
        点空格子可以添加新课程，点已有的课程格子可以编辑或删除。课程右上角的小圆点表示这门课本周有还没完成的作业/考试，点小圆点可以直接跳到"作业考试"页面查看。日期下面单独一行的小标签是这一天要交的所有作业/考试（不管是不是这天上课都会显示），标签的底色对应课程颜色、里面的小圆点颜色区分作业（黄）还是考试（红），同一天有好几门课的作业时会分别显示、方便区分，点标签可以直接标记完成。
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
              <label>上课地点（可选）</label>
              <input
                className="input"
                placeholder="例如：3号楼302"
                value={draft.location}
                onChange={(e) => setDraft({ ...draft, location: e.target.value })}
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
              <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                <button type="button" className="btn secondary" onClick={() => applyWeekPreset(ALL_WEEK_NUMBERS)}>
                  全选
                </button>
                <button type="button" className="btn secondary" onClick={() => applyWeekPreset(ODD_WEEK_NUMBERS)}>
                  单周
                </button>
                <button type="button" className="btn secondary" onClick={() => applyWeekPreset(EVEN_WEEK_NUMBERS)}>
                  双周
                </button>
                <button type="button" className="btn secondary" onClick={() => applyWeekPreset([])}>
                  清空
                </button>
              </div>
              <div
                style={{ fontSize: 12, color: "var(--ink-soft)", marginBottom: 6 }}
              >
                先点上面的快捷按钮选一个基础模式，再按住鼠标（手机上按住手指）划过下面的格子，可以连续勾选/取消某几周（比如"单周"基础上再去掉提前结课的那几周）
              </div>
              <div
                style={{ display: "flex", flexWrap: "wrap", gap: 6, userSelect: "none", touchAction: "none" }}
                onTouchMove={handleWeekTouchMove}
              >
                {ALL_WEEK_NUMBERS.map((w) => {
                  const checked = draft.customWeeks.includes(w);
                  return (
                    <div
                      key={w}
                      data-week={w}
                      onMouseDown={() => handleWeekDown(w)}
                      onMouseEnter={() => handleWeekEnter(w)}
                      onTouchStart={() => handleWeekDown(w)}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 6,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        cursor: "pointer",
                        background: checked ? "var(--teal)" : "var(--teal-soft)",
                        color: checked ? "#fff" : "var(--teal)",
                      }}
                    >
                      {w}
                    </div>
                  );
                })}
              </div>
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

      {showRecognize && (
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
          onClick={() => !recognizing && !importing && setShowRecognize(false)}
        >
          <div
            className="card"
            style={{ width: 480, maxWidth: "100%", maxHeight: "88vh", overflowY: "auto" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0 }}>拍照识别课表</h3>
            <p style={{ fontSize: 13, color: "var(--ink-soft)" }}>
              选一张课表的照片或截图，AI 会自动识别里面的课程。识别完你可以先检查、修改每一条，确认没问题了再点"确认导入"，不会自动覆盖你已经添加好的课程。
            </p>

            <input
              ref={recognizeFileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={handleRecognizeFileChange}
            />

            {!recognizeImage ? (
              <button className="btn" onClick={() => recognizeFileInputRef.current?.click()}>
                选择图片 / 拍照
              </button>
            ) : (
              <div>
                <img
                  src={recognizeImage}
                  alt="课表预览"
                  style={{ maxWidth: "100%", borderRadius: 8, marginBottom: 10, display: "block" }}
                />
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <button
                    className="btn secondary"
                    disabled={recognizing || importing}
                    onClick={() => {
                      setRecognizeImage(null);
                      setRecognizedCourses([]);
                      setRecognizeError("");
                    }}
                  >
                    重新选择
                  </button>
                  <button className="btn" disabled={recognizing || importing} onClick={runRecognition}>
                    {recognizing ? "识别中..." : "开始识别"}
                  </button>
                </div>
              </div>
            )}

            {recognizeError && (
              <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 10 }}>{recognizeError}</div>
            )}

            {recognizedCourses.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  识别到 {recognizedCourses.length} 门课，检查一下再导入：
                </div>
                {recognizedCourses.map((c, idx) => (
                  <div key={idx} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 8 }}>
                    <div style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={c.include}
                        onChange={(e) => updateRecognizedCourse(idx, { include: e.target.checked })}
                      />
                      <input
                        className="input"
                        style={{ flex: 1 }}
                        value={c.name}
                        placeholder="课程名称"
                        onChange={(e) => updateRecognizedCourse(idx, { name: e.target.value })}
                      />
                      <button className="btn danger" onClick={() => removeRecognizedRow(idx)}>
                        删除
                      </button>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <input
                        className="input"
                        style={{ width: 100 }}
                        value={c.teacher}
                        placeholder="老师（可选）"
                        onChange={(e) => updateRecognizedCourse(idx, { teacher: e.target.value })}
                      />
                      <input
                        className="input"
                        style={{ width: 100 }}
                        value={c.location}
                        placeholder="地点（可选）"
                        onChange={(e) => updateRecognizedCourse(idx, { location: e.target.value })}
                      />
                      <select
                        className="input"
                        style={{ width: 80 }}
                        value={c.day}
                        onChange={(e) => updateRecognizedCourse(idx, { day: Number(e.target.value) })}
                      >
                        {WEEKDAY_LABELS.map((label, i) => (
                          <option key={i} value={i}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <select
                        className="input"
                        style={{ width: 90 }}
                        value={c.periodStart}
                        onChange={(e) => updateRecognizedCourse(idx, { periodStart: Number(e.target.value) })}
                      >
                        {DEFAULT_PERIOD_TIMES.map((p) => (
                          <option key={p.period} value={p.period}>
                            第{p.period}节
                          </option>
                        ))}
                      </select>
                      <select
                        className="input"
                        style={{ width: 80 }}
                        value={c.periodCount}
                        onChange={(e) => updateRecognizedCourse(idx, { periodCount: Number(e.target.value) })}
                      >
                        {[1, 2, 3, 4].map((n) => (
                          <option key={n} value={n}>
                            {n} 节
                          </option>
                        ))}
                      </select>
                      <select
                        className="input"
                        style={{ width: 80 }}
                        value={c.weekPattern}
                        onChange={(e) => updateRecognizedCourse(idx, { weekPattern: e.target.value })}
                      >
                        <option value="all">每周</option>
                        <option value="odd">单周</option>
                        <option value="even">双周</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <div style={{ flex: 1 }} />
              <button
                className="btn secondary"
                disabled={recognizing || importing}
                onClick={() => setShowRecognize(false)}
              >
                取消
              </button>
              {recognizedCourses.length > 0 && (
                <button className="btn" disabled={importing} onClick={confirmImport}>
                  {importing ? "导入中..." : `确认导入（${recognizedCourses.filter((c) => c.include).length} 门）`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
