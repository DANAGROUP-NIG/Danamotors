import type { Metadata } from "next";
import { Inter, Syne } from 'next/font/google';

import { Providers } from "@/providers";
import "./globals.css";

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const syne = Syne({
  subsets: ['latin'],
  variable: '--font-syne',
  weight: ['600', '700', '800'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Dana Motors | Car Service Platform",
  description:
    "Book car service, track repairs, approve estimates, and get pickup updates through the Dana Motors platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html 
    lang="en" 
    suppressHydrationWarning 
    data-scroll-behavior="smooth"
    className={`${inter.variable} ${syne.variable}`}
    >
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
