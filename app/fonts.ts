import { Geist, Geist_Mono } from "next/font/google";

// Shared across both route-group root layouts so fonts stay identical.
export const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});
