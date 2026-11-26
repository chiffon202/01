import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Treasurer Note — สมุดงบเหรัญญิก & บันทึกบิล",
    short_name: "Treasurer Note",
    description:
      "สมุดบัญชีรายรับ-รายจ่ายและคุมงบเหรัญญิก คิดเลขด่วนในตัว จดบิล และพิมพ์รายงาน PDF ได้แบบออฟไลน์ 100%",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#FBF8F1",
    theme_color: "#FBF8F1",
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
