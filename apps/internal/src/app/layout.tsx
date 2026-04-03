import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "strvx",
    template: "%s — strvx",
  },
  description: "Client Command Center",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`} style={{ colorScheme: "light" }}>
      <body className="min-h-full bg-[#f8f8f8] text-[#222]" style={{ fontFamily: "var(--font-inter), system-ui, -apple-system, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
