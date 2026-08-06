import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Parallax — 3D Fleet Tactics",
  description:
    "Command a fleet in simultaneous-turn 3D space combat where movement, prediction, and armour facing decide every volley.",
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
