import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "DevStrong Email Marketing",
  description: "Shopify email marketing app",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
      <script
        src="https://cdn.shopify.com/shopifycloud/app-bridge.js"
        data-api-key={process.env.NEXT_PUBLIC_SHOPIFY_API_KEY}
      />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}