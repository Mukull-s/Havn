import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Havn — Clinic Operations & Voice Receptionist",
  description:
    "Care, in conversation. AI-powered voice receptionist and live clinic scheduling desk.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${instrumentSerif.variable} ${geistMono.variable}`}
    >
      <body className="min-h-screen bg-[var(--bg-canvas)] font-sans text-[var(--ink-primary)] antialiased selection:bg-[var(--accent-sage-bg)] selection:text-[var(--accent-sage-ink)]">
        {children}
      </body>
    </html>
  );
}
