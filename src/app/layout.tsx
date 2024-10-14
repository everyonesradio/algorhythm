import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Algorhythm",
  description: "AI image recognition app for vinyls",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en'>
      <body>{children}</body>
    </html>
  );
}
