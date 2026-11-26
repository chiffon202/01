import type { Metadata, Viewport } from "next";
import { Noto_Sans_Thai, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

const notoSansThai = Noto_Sans_Thai({
  variable: "--font-thai",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Treasurer Note — สมุดงบเหรัญญิก & บันทึกบิล",
  description:
    "สมุดบัญชีรายรับ-รายจ่ายสำหรับเหรัญญิก จดบิล เลขที่อ้างอิง คนเบิก คิดเลขด่วนในตัว และพิมพ์ใบสรุปงบเป็น PDF ได้ทันทีแบบออฟไลน์ 100%",
  applicationName: "Treasurer Note",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Treasurer Note",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#FBF8F1",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      className={`${notoSansThai.variable} ${plusJakarta.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[#FBF8F1] text-[#1C1917] flex flex-col">
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
