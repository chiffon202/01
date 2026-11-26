"use client";

import React, { useState } from "react";
import {
  CHANNEL_LABELS,
  LedgerEntry,
  formatBaht,
  formatThaiDateLabel,
} from "@/lib/storage";

interface ReceiptLightboxProps {
  entry: LedgerEntry;
  imageSrc: string | null;
  onToggleVerified: (id: string) => void;
  onClose: () => void;
}

export function ReceiptLightbox({
  entry,
  imageSrc,
  onToggleVerified,
  onClose,
}: ReceiptLightboxProps) {
  const [zoomed, setZoomed] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-950/85 backdrop-blur-xs flex flex-col print:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="ดูรูปใบเสร็จ / สลิป"
    >
      {/* Top Bar */}
      <div className="px-4 py-3 bg-stone-900/95 border-b border-stone-800 text-white flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm sm:text-base truncate">
              {entry.title}
            </span>
            <span
              className={`text-sm sm:text-base font-bold tabular-nums ${
                entry.type === "income" ? "text-emerald-400" : "text-amber-300"
              }`}
            >
              {entry.type === "income" ? "+" : "-"}฿{formatBaht(entry.amount)}
            </span>
          </div>
          <div className="text-xs text-stone-400 flex flex-wrap gap-x-3">
            <span>{formatThaiDateLabel(entry.dateKey)}</span>
            <span>{CHANNEL_LABELS[entry.channel]}</span>
            {entry.receiptRef && <span>บิล: {entry.receiptRef}</span>}
            {entry.personName && <span>คนเบิก: {entry.personName}</span>}
            {entry.formula && <span>สูตร: {entry.formula}</span>}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {imageSrc && (
            <button
              type="button"
              onClick={() => setZoomed((z) => !z)}
              className="px-3 py-1.5 rounded-xl bg-stone-700 hover:bg-stone-600 text-xs font-semibold cursor-pointer"
            >
              {zoomed ? "🔍 ย่อภาพ" : "🔍 ซูมอ่านตัวเลข"}
            </button>
          )}
          <button
            type="button"
            onClick={() => onToggleVerified(entry.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
              entry.verified
                ? "bg-emerald-600 text-white"
                : "bg-amber-400 text-stone-950 hover:bg-amber-300"
            }`}
          >
            {entry.verified ? "✓ เช็กยอดตรงแล้ว" : "○ กดยืนยันว่าเช็กยอดแล้ว"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl bg-stone-700 hover:bg-stone-600 text-xs font-bold cursor-pointer"
          >
            ปิด ✕
          </button>
        </div>
      </div>

      {/* Image Viewport */}
      <div
        className="flex-1 overflow-auto flex items-center justify-center p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc}
            alt={`ใบเสร็จ ${entry.title}`}
            onClick={() => setZoomed((z) => !z)}
            className={`rounded-xl shadow-2xl transition-transform cursor-zoom-in ${
              zoomed
                ? "max-w-none w-[150%] sm:w-[125%] cursor-zoom-out"
                : "max-h-full max-w-full object-contain"
            }`}
          />
        ) : (
          <div className="bg-stone-900 border border-stone-700 rounded-2xl p-6 text-center text-stone-300 text-sm">
            ไม่พบรูปภาพในเครื่องนี้ (อาจถูกลบแคชหรือนำเข้าจากเครื่องอื่น)
          </div>
        )}
      </div>
    </div>
  );
}
