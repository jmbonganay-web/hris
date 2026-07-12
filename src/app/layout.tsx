import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Northstar HRIS",
  description: "Secure HRIS MVP for employee operations",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
