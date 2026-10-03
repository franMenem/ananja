import type { MetadataRoute } from "next";

import { NEGOCIO } from "@/lib/negocio";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: NEGOCIO.nombre,
    short_name: NEGOCIO.nombre,
    description: NEGOCIO.descripcion,
    start_url: "/",
    display: "standalone",
    background_color: NEGOCIO.colores.background,
    theme_color: NEGOCIO.colores.primary,
    lang: "es-AR",
    icons: [
      {
        src: `${NEGOCIO.iconos}/icon-192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${NEGOCIO.iconos}/icon-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${NEGOCIO.iconos}/icon-maskable-192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: `${NEGOCIO.iconos}/icon-maskable-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
