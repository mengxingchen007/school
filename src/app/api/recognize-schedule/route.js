// 这是一个"服务器端"接口：浏览器把课表图片发到这里，由这里用带密钥的方式去调用 AI 识别服务，
// 这样密钥（ANTHROPIC_API_KEY）只会留在服务器上，不会暴露给浏览器里的任何人。
export const runtime = "nodejs";

const RECOGNIZE_PROMPT = `你是一个课表识别助手。下面这张图片是一张大学/中学的课程表截图或拍照照片。请你仔细识别图片里的每一门课程，按下面的 JSON 格式输出一个数组，不要输出任何其他文字、不要用 markdown 代码块包裹，只输出纯 JSON：

[
  {
    "name": "课程名称",
    "teacher": "任课老师，没有就填空字符串",
    "day_of_week": 0到6的数字，0=周一，1=周二，2=周三，3=周四，4=周五，5=周六，6=周日,
    "period_start": 这门课从第几节课开始上（数字，从1开始）,
    "period_count": 这门课连续上几节课（数字，通常是1到4）,
    "week_pattern": "all" 表示每周都上，"odd" 表示单周上，"even" 表示双周上，如果图片上没有标注单双周信息就填 "all"
  }
]

如果同一门课在一周内出现多次（比如周一和周三都有），请把它拆成多条记录。如果图片模糊、识别不清楚某一格，就跳过那一格，不要瞎编。如果整张图完全看不出是课表，返回空数组 []。`;

export async function POST(request) {
  try {
    const { imageBase64, mediaType } = await request.json();
    if (!imageBase64 || !mediaType) {
      return Response.json({ error: "缺少图片数据" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "服务器还没配置识别服务的密钥（ANTHROPIC_API_KEY），请联系网站管理员" },
        { status: 500 }
      );
    }

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
              { type: "text", text: RECOGNIZE_PROMPT },
            ],
          },
        ],
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return Response.json(
        { error: "识别服务出错：" + (data?.error?.message || resp.statusText) },
        { status: 500 }
      );
    }

    const textBlock = (data.content || []).find((b) => b.type === "text");
    let raw = textBlock ? textBlock.text : "[]";
    raw = raw.trim();
    if (raw.startsWith("```")) {
      raw = raw.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
    }

    let courses;
    try {
      courses = JSON.parse(raw);
    } catch (e) {
      return Response.json(
        { error: "识别结果解析失败，换一张更清晰、更完整的课表图片再试一次" },
        { status: 500 }
      );
    }

    if (!Array.isArray(courses)) {
      return Response.json({ error: "识别结果格式不对，换一张图片再试一次" }, { status: 500 });
    }

    return Response.json({ courses });
  } catch (e) {
    return Response.json({ error: "识别失败：" + e.message }, { status: 500 });
  }
}
