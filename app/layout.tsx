import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://randomcam.kaz-creative-studio0.workers.dev";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "RandomCam — Random Video Chat for Global Conversations",
    template: "%s | RandomCam",
  },
  description: "Meet a new person for a respectful one-to-one video conversation. For adults, friendship, culture, and language practice.",
  alternates: {
    canonical: "/",
    languages: { en: "/en", ja: "/ja", "x-default": "/en" },
  },
  openGraph: {
    type: "website",
    siteName: "RandomCam",
    url: "/",
    title: "RandomCam — Random Video Chat for Global Conversations",
    description: "Respectful one-to-one video conversations for adults, friendship, culture, and language practice.",
  },
  twitter: {
    card: "summary",
    title: "RandomCam — Random Video Chat for Global Conversations",
    description: "Respectful one-to-one video conversations for adults, friendship, culture, and language practice.",
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true } },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "RandomCam",
              url: siteUrl,
              description: "Random video chat for respectful one-to-one conversations between adults.",
              inLanguage: ["en", "ja"],
            }),
          }}
        />
        {children}
      </body>
    </html>
  );
}
