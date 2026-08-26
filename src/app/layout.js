import "./globals.css";

export const metadata = {
  title: "拾光校园工具",
  description: "课表、作业考试DDL提醒、吃饭抽签、分组抽签",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
