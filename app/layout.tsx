import type { Metadata, Viewport } from "next";
import { Caveat, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// One clean family for the whole app (headings, numbers, buttons).
const display = Geist({
  variable: "--font-display",
  subsets: ["latin"],
});

// Handwriting, only for what is written in chalk on the board (computer view).
const chalk = Caveat({
  variable: "--font-chalk",
  weight: ["500", "700"],
  subsets: ["latin"],
});

// viewport-fit=cover: the iPhone app and the home-screen web app draw edge to edge; pages keep
// their content clear of the notch with env(safe-area-inset-*).
export const viewport: Viewport = {
  viewportFit: 'cover',
  themeColor: '#e9e9e7',
};

export const metadata: Metadata = {
  title: "Everyday M | Entrena cada día",
  description: "Entrenamientos para moverte cada día, juntos.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} ${chalk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
