import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Booth Note — จดออเดอร์ & คุมงบบูธ",
    short_name: "Booth Note",
    description:
      "แอปจดออเดอร์ คิวหน้าร้าน และคุมงบประมาณบูธขายของ ใช้งานออฟไลน์ได้ 100%",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F6F5F2",
    theme_color: "#F6F5F2",
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
