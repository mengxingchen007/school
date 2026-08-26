import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // 提醒：Vercel 项目设置里没有填 Supabase 的两个环境变量
  console.warn(
    "缺少 NEXT_PUBLIC_SUPABASE_URL 或 NEXT_PUBLIC_SUPABASE_ANON_KEY，请在部署平台的环境变量里设置。"
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
