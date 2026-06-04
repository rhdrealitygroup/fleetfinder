import type { Metadata } from "next";
import { Inter, Poppins, Newsreader, Bebas_Neue, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Body + heading fonts (default landing + product UI).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

// Additional fonts used by the /preview design options.
// Newsreader — editorial / trade-journal direction (serif).
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});
// Bebas Neue — automotive / industrial direction (heavy condensed display).
const bebas = Bebas_Neue({
  variable: "--font-bebas",
  subsets: ["latin"],
  weight: ["400"],
});
// JetBrains Mono — monospace details (VINs, prices) across all directions.
const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://fleetfinder.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "LotCompas — Cross-brand lease inventory search",
    template: "%s · LotCompas",
  },
  description:
    "Search live new-car inventory across every dealer your leasing customers are buying from. Built for leasing agents who close deals.",
  openGraph: {
    title: "LotCompas",
    description:
      "Search live new-car inventory across every dealer your leasing customers are buying from.",
    siteName: "LotCompas",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${poppins.variable} ${newsreader.variable} ${bebas.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
