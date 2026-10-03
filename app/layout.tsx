import type { Metadata, Viewport } from "next";
import { DM_Sans, Instrument_Serif } from "next/font/google";
import "./globals.css";

import { NEGOCIO } from "@/lib/negocio";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
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
      className={`${dmSans.variable} ${instrumentSerif.variable} h-dvh antialiased`}
    >
      <body className="min-h-dvh flex flex-col bg-background text-text">
        {children}
      </body>
    </html>
  );
}
