import type { Metadata } from "next";
import { Space_Grotesk, Inter, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { MotionProvider } from "./motion-provider";
import { PostHogProvider } from "./posthog-provider";
import Header from "../components/Header";

const spaceGrotesk = Space_Grotesk({ variable: "--font-heading", subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });
const inter = Inter({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://strvx.com"),
  title: {
    default: "strvx | We Build Internal AI Tools That Actually Work",
    template: "%s | strvx",
  },
  description:
    "AI consulting in San Diego. We build internal AI tools, document pipelines, data extraction, and automated reporting. Fixed scope, fixed price. Book a free call.",
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "strvx",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "strvx - AI Consulting" }],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} ${spaceGrotesk.variable} ${geistMono.variable} bg-[#050505] text-[#fafafa] antialiased`}>
        <PostHogProvider>
          <Header />
          <MotionProvider>{children}</MotionProvider>
        </PostHogProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
