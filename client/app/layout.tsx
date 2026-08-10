import type { Metadata } from "next";

import { Providers } from "@/providers";
import "./globals.css";

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
    <html lang="en" suppressHydrationWarning data-scroll-behavior="smooth">
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
