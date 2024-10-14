// ** React/Next.js Imports
import type { Metadata } from "next";

// ** Styles
import "./globals.css";
import "react-toastify/dist/ReactToastify.css";

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
