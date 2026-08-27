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
    <html lang="en" className="dark">
      <body>
        <Providers>
          <AppFrame>{children}</AppFrame>
        </Providers>
      </body>
    </html>
  );
}
