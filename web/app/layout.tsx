import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import { I18nProvider } from "@/lib/i18n";
import { MeProvider } from "@/lib/me";
import { ThemeProvider } from "@/lib/theme";
import { GoldenAtmosphere } from "@/components/GoldenAtmosphere";
import { CinematicIntroProvider } from "@/components/CinematicIntro";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display-face",
  weight: ["600", "700"],
  display: "swap",
});
const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-body-face",
  weight: ["500", "600", "700"],
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-face",
  weight: ["500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "NearSignet — AI-Verified Freelance Escrow on NEAR Protocol",
  description:
    "Non-custodial freelance escrow on NEAR Protocol with Orin Cyber-Inspector AI verification, Scoped Function-Call Access Key security, and immutable on-chain SEALED receipts.",
  openGraph: {
    type: "website",
    siteName: "NearSignet",
    title: "NearSignet — AI-Verified Freelance Escrow on NEAR Protocol",
    description:
      "Turn plain briefs into checkable rules, lock NEAR in nearsignet-protocol.testnet, verify files with Orin AI, and stamp your deal SEALED on-chain.",
  },
  twitter: {
    card: "summary_large_image",
    title: "NearSignet — AI-Verified Freelance Escrow on NEAR Protocol",
    description:
      "Programmable freelance escrow on NEAR with Scoped AI Verification & 72h trustless auto-release.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="obsidian"
      className={`${spaceGrotesk.variable} ${plusJakarta.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <ThemeProvider>
          <MeProvider>
            <I18nProvider>
              <GoldenAtmosphere />
              <CinematicIntroProvider>{children}</CinematicIntroProvider>
            </I18nProvider>
          </MeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
