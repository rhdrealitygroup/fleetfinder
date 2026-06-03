import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";

// Same font choices as the Base44 site for visual continuity. Inter for body,
// Poppins for headings.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://fleetfinder.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "FleetFinder — Cross-brand lease inventory search",
    template: "%s · FleetFinder",
  },
  description:
    "Search live new-car inventory across every dealer your leasing customers are buying from. Built for leasing agents who close deals.",
  openGraph: {
    title: "FleetFinder",
    description:
      "Search live new-car inventory across every dealer your leasing customers are buying from.",
    siteName: "FleetFinder",
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
      className={`${inter.variable} ${poppins.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {children}
      </body>
    </html>
  );
}
