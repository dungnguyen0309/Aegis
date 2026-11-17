import type { Metadata, Viewport } from "next";
import { Instrument_Sans } from "next/font/google";
import { THEME_SCRIPT, ThemeProvider } from "@/lib/theme";
import { cn } from "@/lib/utils";
import "./globals.css";

// Variable font (400-700): running text in Regular, headings and the verdict in Bold.
// Latin Extended covers names such as "Türkiye"; it has no Cyrillic, so names such as "ООО Радиоавтоматика"
// fall back to the size-matched system face next/font adds.
const instrument = Instrument_Sans({ subsets: ["latin", "latin-ext"], variable: "--font-instrument", display: "swap" });

const TITLE = "Aegis · Export sanctions and route screening";
const DESCRIPTION =
  "Screens buyers against sanctions lists and flags unusual EU exports of battlefield items through third countries.";
// Absolute URLs for the share image: the deployment's own address on Vercel, localhost otherwise
const SITE = process.env.NEXT_PUBLIC_SITE_URL
  ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, type: "website", siteName: "Aegis" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0d1014" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn("h-full antialiased", instrument.variable)} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
