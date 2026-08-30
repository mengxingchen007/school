export const WEEKDAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

// 默认的每节课时间（用户以后可以在设置里改，这里先给一套常见的默认值）
export const DEFAULT_PERIOD_TIMES = [
  { period: 1, start: "08:00", duration: 45 },
  { period: 2, start: "08:55", duration: 45 },
  { period: 3, start: "10:00", duration: 45 },
  { period: 4, start: "10:55", duration: 45 },
  { period: 5, start: "14:00", duration: 45 },
  { period: 6, start: "14:55", duration: 45 },
  { period: 7, start: "16:00", duration: 45 },
  { period: 8, start: "16:55", duration: 45 },
  { period: 9, start: "18:30", duration: 45 },
  { period: 10, start: "19:25", duration: 45 },
  { period: 11, start: "20:20", duration: 45 },
  { period: 12, start: "21:15", duration: 45 },
  { period: 13, start: "22:10", duration: 45 },
];

export const COLOR_HUE_PRESETS = [175, 35, 210, 280, 340, 90];

export const TASK_TYPE_INFO = {
  assignment: { label: "作业", hue: 42, initial: "作" },
  exam: { label: "考试", hue: 0, initial: "考" },
};

export const WEEK_PATTERN_LABELS = {
  all: "每周",
  odd: "单周",
  even: "双周",
  custom: "自定义周次",
};

export const BUDGET_LEVELS = [
  { value: 1, label: "¥15内" },
  { value: 2, label: "¥15-30" },
  { value: 3, label: "¥30以上" },
];

// 某门课在第 week 周是否上课，根据 week_pattern 判断
export function courseActiveOnWeek(course, week) {
  if (course.week_pattern === "odd") return week % 2 === 1;
  if (course.week_pattern === "even") return week % 2 === 0;
  if (course.week_pattern === "custom") {
    return Array.isArray(course.custom_weeks) && course.custom_weeks.includes(week);
  }
  return true;
}
