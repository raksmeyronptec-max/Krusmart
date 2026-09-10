import type { Metadata } from "next";
import { Hanuman, Moul } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

/*
 * The body face. Hanuman is a traditional Khmer text face — taller stacked
 * glyphs and heavier vertical rhythm than the Kantumruy Pro it replaces, which
 * is why `body` keeps a generous line-height.
 *
 * The same four weights the app already uses (300/400/600/700); Hanuman covers
 * 100–900, so nothing is synthesised. `latin` is loaded alongside `khmer`
 * because the UI mixes in numerals, class codes and English labels.
 */
const hanuman = Hanuman({
  variable: "--font-hanuman",
  subsets: ["khmer", "latin"],
  weight: ["300", "400", "600", "700"],
});

const moul = Moul({
  variable: "--font-moul",
  subsets: ["khmer"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "KruSmart - ជំនួយការគ្រូបង្រៀនឌីជីថល",
  description: "ប្រព័ន្ធគ្រប់គ្រងការបង្រៀនឌីជីថលងាយស្រួល និងរហ័ស។",
};

import { Toaster } from "react-hot-toast";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="km" suppressHydrationWarning>
      <body
        className={`${hanuman.variable} ${moul.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster position="bottom-center" />
        </ThemeProvider>
      </body>
    </html>
  );
}
