import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { MotionProvider } from "@/components/shared/motion-provider";
import { QueryProvider } from "@/components/shared/query-provider";
import { Toaster } from "@/components/ui/sonner";
import { ThemePreference } from "@/lib/theme-preference";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Lively",
    template: "%s | Lively",
  },
  description: "Uptime monitoring for the endpoints you own.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The boot script adds `dark` before React hydrates, which React would otherwise
    // report as a mismatch on this element.
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* beforeInteractive: in the initial HTML, ahead of every Next.js module. */}
        <Script id="theme-boot" strategy="beforeInteractive">
          {ThemePreference.bootScript}
        </Script>
      </head>
      <body className="min-h-full flex flex-col">
        <MotionProvider>
          <QueryProvider>{children}</QueryProvider>
        </MotionProvider>
        <Toaster />
      </body>
    </html>
  );
}
