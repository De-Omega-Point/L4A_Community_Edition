import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Loyalty4All — Community Edition",
  description: "A free, local-first loyalty app for independent businesses. Reward returning customers and install directly from the web.",
  icons: {
    icon: "/community/assets/icon-192.png",
    shortcut: "/community/assets/icon-192.png",
    apple: "/community/assets/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
