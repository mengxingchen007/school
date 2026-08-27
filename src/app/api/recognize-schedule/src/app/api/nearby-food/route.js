// 服务器端接口：浏览器把经纬度发到这里，由这里带着高德地图的密钥去查真实的周边餐饮地点，
// 这样密钥（AMAP_KEY）只会留在服务器上，不会暴露给浏览器里的任何人。
export const runtime = "nodejs";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get("lat");
    const lng = searchParams.get("lng");
    const radius = searchParams.get("radius") || "1000";

    if (!lat || !lng) {
      return Response.json({ error: "缺少位置信息" }, { status: 400 });
    }

    const key = process.env.AMAP_KEY;
    if (!key) {
      return Response.json(
        { error: "服务器还没配置地图服务的密钥（AMAP_KEY），请联系网站管理员" },
        { status: 500 }
      );
    }

    const url = new URL("https://restapi.amap.com/v3/place/around");
    url.searchParams.set("key", key);
    url.searchParams.set("location", `${lng},${lat}`); // 高德要求经度在前、纬度在后
    url.searchParams.set("types", "050000"); // 050000 = 餐饮服务大类
    url.searchParams.set("radius", radius);
    url.searchParams.set("sortrule", "distance");
    url.searchParams.set("offset", "25");
    url.searchParams.set("page", "1");
    url.searchParams.set("extensions", "all");

    const resp = await fetch(url.toString());
    const data = await resp.json();

    if (data.status !== "1") {
      return Response.json({ error: "地图服务查询失败：" + (data.info || "未知错误") }, { status: 500 });
    }

    const places = (data.pois || []).map((p) => ({
      id: p.id,
      name: p.name,
      address: p.address || p.adname || "",
      distance: p.distance ? Number(p.distance) : null,
      tel: p.tel || "",
      cost: p.biz_ext && p.biz_ext.cost ? Number(p.biz_ext.cost) : null,
      rating: p.biz_ext && p.biz_ext.rating ? p.biz_ext.rating : null,
    }));

    return Response.json({ places });
  } catch (e) {
    return Response.json({ error: "查询失败：" + e.message }, { status: 500 });
  }
}
