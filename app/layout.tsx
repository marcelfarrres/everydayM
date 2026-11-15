import type { Metadata } from "next";
import { Bricolage_Grotesque, Cabin_Sketch, Geist, Geist_Mono, Kalam } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
});

// Chalk on the board (computer view): sketchy titles and a handwritten list.
const chalkTitle = Cabin_Sketch({
  variable: "--font-chalk-title",
  weight: "700",
  subsets: ["latin"],
});

const chalk = Kalam({
  variable: "--font-chalk",
  weight: ["400", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Everyday M | Entrena cada día",
  description: "Entrenamientos para moverte cada día, juntos.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} ${chalkTitle.variable} ${chalk.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
