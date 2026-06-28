import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "불멸의 연대기 · Immortal Chronicle",
  description:
    "고대 농경 시대부터 끝없는 초미래까지, 불멸의 캐릭터가 성향에 따라 성장하는 모습을 관전하는 라이프 시뮬레이션.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
