import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { PwaProvider } from "@/components/pwa/pwa-register";
import { OfflineNotice } from "@/components/pwa/offline-notice";
import { ThemeProvider } from "@/components/providers/theme-provider";

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
    default: "AlphaFlow",
    template: "%s · AlphaFlow",
  },
  description: "Intelligent Danish bookkeeping — Skat & Moms for moderne virksomheder",
  keywords: ["Accounting", "Bookkeeping", "VAT", "Moms", "Small Business", "Denmark", "Peppol", "E-invoicing", "OCR", "Receipt Scanning"],
  authors: [{ name: "AlphaFlow" }],
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AlphaFlow",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d9488",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <OfflineNotice />
          <PwaProvider>
            {children}
          </PwaProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
