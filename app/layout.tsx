import type { Metadata } from "next";
import { Kantumruy_Pro, Moul } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import "./globals.css";

const kantumruyPro = Kantumruy_Pro({
  variable: "--font-kantumruy",
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
        className={`${kantumruyPro.variable} ${moul.variable} antialiased`}
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
