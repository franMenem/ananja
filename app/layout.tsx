import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import { NEGOCIO } from "@/lib/negocio";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: NEGOCIO.nombre,
  description: NEGOCIO.descripcion,
  icons: {
    icon: `${NEGOCIO.iconos}/favicon.ico`,
    apple: `${NEGOCIO.iconos}/apple-touch-icon.png`,
  },
  appleWebApp: {
    capable: true,
    title: NEGOCIO.nombre,
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: NEGOCIO.colores.primary,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es-AR"
      data-negocio={NEGOCIO.id}
      className={`${inter.variable} h-dvh antialiased`}
    >
      <body className="min-h-dvh flex flex-col bg-background text-text">
        {children}
      </body>
    </html>
  );
}
