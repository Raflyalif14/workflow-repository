import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { AppFrame } from "@/components/auth/app-frame";

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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <Providers>
          <AppFrame>{children}</AppFrame>
        </Providers>
      </body>
    </html>
  );
}
