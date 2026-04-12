import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { AppShell } from "@/components/app-shell";
import { AuthProvider } from "@/components/auth-context";

import "bootstrap/dist/css/bootstrap.min.css";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"]
});

export const metadata: Metadata = {
  title: "FSL Learning Hub",
  description: "Web-based capstone for Filipino Sign Language learning"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} bg-base text-slate-900`}>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
