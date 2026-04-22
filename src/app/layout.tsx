import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Longevity Resources",
  description: "A minimalist longevity resources database with optional social features."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
