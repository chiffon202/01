"use client";

import React, { useMemo, useState, useSyncExternalStore } from "react";
import {
  LedgerEntry,
  LedgerSettings,
  NewLedgerEntryInput,
  UpdateLedgerEntryPatch,
  addEntry,
  clearAllEntries,
  deleteEntry,
  exportAllData,
  formatBaht,
  formatThaiDateFull,
  getEntriesSnapshot,
  getServerEntriesSnapshot,
  getServerSettingsSnapshot,
  getSettingsSnapshot,
  getThailandDateKey,
  importAllData,
  importLegacyBoothFromDevice,
  roundCurrency,
  saveSettings,
  settlePersonPending,
  subscribeStorageChange,
  toggleReimburseStatus,
  updateEntry,
} from "@/lib/storage";
import { LedgerTab } from "./LedgerTab";
import { ReportTab } from "./ReportTab";
import { PrintableReport } from "./PrintableReport";

type ActiveTab = "ledger" | "report";

function subscribeThailandDayChange(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const check = () => callback();
  window.addEventListener("focus", check);
  document.addEventListener("visibilitychange", check);
  const timer = window.setInterval(check, 30_000);
  return () => {
    window.removeEventListener("focus", check);
    document.removeEventListener("visibilitychange", check);
    window.clearInterval(timer);
  };
}

export function TreasurerApp() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("ledger");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [printPreview, setPrintPreview] = useState<{
    filteredEntries: LedgerEntry[];
    dateRangeLabel: string;
  } | null>(null);

  const entries = useSyncExternalStore(
    subscribeStorageChange,
    getEntriesSnapshot,
    getServerEntriesSnapshot
  );

  const settings = useSyncExternalStore(
    subscribeStorageChange,
    getSettingsSnapshot,
    getServerSettingsSnapshot
  );

  const todayKey = useSyncExternalStore(
    subscribeThailandDayChange,
    getThailandDateKey,
    () => ""
  );

  const topStats = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    let pendingCount = 0;
    for (const e of entries) {
      if (e.type === "income") totalIncome += e.amount;
      else totalExpense += e.amount;
      if (e.reimburseStatus === "pending") pendingCount += 1;
    }
    const netBalance = roundCurrency(
      settings.startingBudget + totalIncome - totalExpense
    );
    return {
      totalExpense: roundCurrency(totalExpense),
      netBalance,
      pendingCount,
    };
  }, [entries, settings.startingBudget]);

  function handleAddEntry(input: NewLedgerEntryInput) {
    addEntry(input);
  }

  function handleUpdateEntry(id: string, patch: UpdateLedgerEntryPatch) {
    updateEntry(id, patch);
  }

  function handleToggleReimburse(id: string) {
    toggleReimburseStatus(id);
  }

  function handleDeleteEntry(id: string) {
    deleteEntry(id);
  }

  function handleSaveSettings(next: LedgerSettings) {
    saveSettings(next);
  }

  function handleSettlePersonPending(personName: string) {
    settlePersonPending(personName);
  }

  function handleExportJson(): string {
    return JSON.stringify(exportAllData(), null, 2);
  }

  function handleImportJson(raw: string): { count: number } {
    const snap = importAllData(raw);
    return { count: snap.entries.length };
  }

  function handleImportLegacyBooth(): number {
    return importLegacyBoothFromDevice();
  }

  function handleClearAllEntries() {
    clearAllEntries();
  }

  const generatedDateLabel = todayKey ? formatThaiDateFull(todayKey) : "";
  const activePrintEntries = printPreview ? printPreview.filteredEntries : entries;
  const activePrintLabel = printPreview
    ? printPreview.dateRangeLabel
    : "ทั้งหมด";

  return (
    <>
      {/* Interactive App Shell (hidden when printing) */}
      <div className="min-h-screen flex flex-col bg-[#FBF8F1] text-[#1C1917] print:hidden">
        {/* Compact Sticky Top Navigation Bar */}
        <header className="sticky top-0 z-30 border-b border-[#EDE6D8] bg-[#FBF8F1]/95 backdrop-blur-md">
          <div className="mx-auto max-w-[1440px] px-3 sm:px-5 h-16 flex items-center justify-between gap-2">
            {/* Left: App Name + Live Summary */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-10 w-10 rounded-2xl bg-[#EA580C] text-white flex items-center justify-center text-lg font-bold shadow-xs shrink-0">
                📒
              </div>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-base font-bold text-[#1C1917] truncate">
                  {settings.ledgerName}
                </h1>
                <div className="flex flex-wrap items-center gap-x-2 text-[11px] sm:text-xs text-[#57534E] tabular-nums">
                  <span>
                    คงเหลือ:{" "}
                    <strong
                      className={
                        topStats.netBalance < 0
                          ? "text-rose-700"
                          : "text-emerald-700"
                      }
                    >
                      {topStats.netBalance < 0 ? "-" : ""}฿
                      {formatBaht(Math.abs(topStats.netBalance))}
                    </strong>
                  </span>
                  <span className="text-stone-300">|</span>
                  <span>
                    จ่ายรวม: <strong>฿{formatBaht(topStats.totalExpense)}</strong>
                  </span>
                  {topStats.pendingCount > 0 && (
                    <>
                      <span className="text-stone-300 hidden sm:inline">|</span>
                      <span className="hidden sm:inline text-amber-800 font-semibold">
                        รอคืน {topStats.pendingCount} บิล
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Right: 2 Primary Navigation Buttons */}
            <nav
              aria-label="เมนูหลัก"
              className="flex items-center gap-1.5 bg-white p-1 rounded-2xl border border-[#EDE6D8] shadow-2xs shrink-0"
            >
              <button
                type="button"
                onClick={() => setActiveTab("ledger")}
                className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
                  activeTab === "ledger"
                    ? "bg-[#EA580C] text-white shadow-xs"
                    : "text-[#57534E] hover:text-[#1C1917] hover:bg-stone-50"
                }`}
              >
                จดบิล &amp; บัญชี
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("report")}
                className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
                  activeTab === "report"
                    ? "bg-[#1C1917] text-white shadow-xs"
                    : "text-[#57534E] hover:text-[#1C1917] hover:bg-stone-50"
                }`}
              >
                สรุปงบ &amp; พิมพ์รายงาน
              </button>
            </nav>
          </div>
        </header>

        {/* Tab Body */}
        <main className="flex-1 pb-8">
          {activeTab === "ledger" ? (
            <LedgerTab
              todayKey={todayKey}
              entries={entries}
              settings={settings}
              onAddEntry={handleAddEntry}
              onUpdateEntry={handleUpdateEntry}
              onToggleReimburse={handleToggleReimburse}
              onDeleteEntry={handleDeleteEntry}
              onGoToCategories={() => {
                setSettingsOpen(true);
                setActiveTab("report");
              }}
            />
          ) : (
            <ReportTab
              todayKey={todayKey}
              entries={entries}
              settings={settings}
              settingsOpen={settingsOpen}
              onToggleSettingsOpen={setSettingsOpen}
              onSaveSettings={handleSaveSettings}
              onSettlePersonPending={handleSettlePersonPending}
              onExportJson={handleExportJson}
              onImportJson={handleImportJson}
              onImportLegacyBooth={handleImportLegacyBooth}
              onClearAllEntries={handleClearAllEntries}
              onOpenPrintPreview={(payload) => setPrintPreview(payload)}
            />
          )}
        </main>
      </div>

      {/* Print Preview Modal (screen only) */}
      {printPreview && (
        <div className="fixed inset-0 z-50 bg-stone-900/75 backdrop-blur-xs overflow-y-auto print:hidden">
          <div className="sticky top-0 z-10 bg-stone-900 text-white px-4 py-3 flex items-center justify-between gap-3 border-b border-stone-700">
            <button
              type="button"
              onClick={() => setPrintPreview(null)}
              className="px-3.5 py-1.5 rounded-xl bg-stone-700 hover:bg-stone-600 text-xs sm:text-sm font-bold cursor-pointer"
            >
              ← กลับหน้าสรุปงบ
            </button>
            <div className="text-xs text-stone-300 hidden sm:block">
              ตัวอย่างใบสรุปงบขนาด A4 (กดปุ่มด้านขวาเพื่อพิมพ์หรือ Save as PDF)
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-4 py-2 rounded-xl bg-[#EA580C] hover:bg-[#C2410C] text-white text-xs sm:text-sm font-bold cursor-pointer"
            >
              🖨️ สั่งพิมพ์ / Save as PDF
            </button>
          </div>

          <div className="max-w-[900px] mx-auto my-6 px-3 sm:px-6 pb-12">
            <div className="rounded-xl overflow-hidden shadow-2xl border border-stone-300 bg-white">
              <PrintableReport
                settings={settings}
                entries={printPreview.filteredEntries}
                dateRangeLabel={printPreview.dateRangeLabel}
                generatedDateLabel={generatedDateLabel}
              />
            </div>
          </div>
        </div>
      )}

      {/* Actual A4 Printable Content (only visible in @media print) */}
      <div className="hidden print:block">
        <PrintableReport
          settings={settings}
          entries={activePrintEntries}
          dateRangeLabel={activePrintLabel}
          generatedDateLabel={generatedDateLabel}
        />
      </div>
    </>
  );
}
