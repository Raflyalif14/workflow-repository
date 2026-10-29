import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";
import { AppFrame } from "@/components/auth/app-frame";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

const plusJakartaSans = localFont({
  src: "./fonts/PlusJakartaSans-Variable.ttf",
  weight: "200 800",
  style: "normal",
  display: "swap",
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  title: "Workflow Repository Management System",
  description: "Enterprise grade workflow and CI/CD pipeline repository management platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} /></head>
      <body className={plusJakartaSans.variable}>
        <Providers>
          <AppFrame>{children}</AppFrame>
        </Providers>
      </body>
    </html>
  );
}
