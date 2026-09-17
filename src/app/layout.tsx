import type { Metadata, Viewport } from "next";
import { connection } from "next/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shoply",
  description: "The shared shopping list for your household.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Shoply",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/icons/icon-180.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f1115",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await connection();
  const fontAwesomeStylesheet = process.env.FONTAWESOME_HOST?.trim();

  return (
    <html lang="en">
      <body>
        {fontAwesomeStylesheet ? (
          <link
            rel="stylesheet"
            href={fontAwesomeStylesheet}
            precedence="default"
          />
        ) : null}
        {children}
      </body>
    </html>
  );
}
