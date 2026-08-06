import type { Metadata } from "next";
import "./globals.css";
import "./story.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://parallax-fleet-tactics.baaraamyou.chatgpt.site"),
  title: "Parallax — 3D Fleet Tactics",
  description:
    "Steal a warship and escape through a 10-gate roguelite campaign of simultaneous-turn 3D fleet combat, salvage, and uncertain encounters.",
  openGraph: {
    title: "Parallax — Ten Gates to Freedom",
    description: "Steal a warship. Break ten blockades. Carry every scar, recruit, and uncertain decision toward freedom.",
    images: [{ url: "/og.png", width: 1200, height: 675, alt: "Parallax Story Mode — Ten Gates to Freedom" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Parallax — Ten Gates to Freedom",
    description: "A 10-gate roguelite campaign of 3D fleet combat, salvage, and uncertain encounters.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
