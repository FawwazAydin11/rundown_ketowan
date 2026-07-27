import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rundownku",
  description: "Buat dan atur rundown dengan mudah",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className="min-h-screen bg-slate-50 text-slate-950 antialiased"
      >
        {children}
      </body>
    </html>
  );
}