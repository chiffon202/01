"use client";

import React, { useMemo, useState, useSyncExternalStore } from "react";
import {
  LedgerEntry,
  LedgerSettings,
  NewLedgerEntryInput,
  UpdateLedgerEntryPatch,
  addEntry,
  addProject,
  clearProjectEntries,
  deleteEntry,
  deleteProject,
  exportAllData,
  formatBaht,
  formatThaiDateFull,
  getEntriesSnapshot,
  getProjectsSnapshot,
  getServerEntriesSnapshot,
  getServerProjectsSnapshot,
  getServerSettingsSnapshot,
  getSettingsSnapshot,
  getThailandDateKey,
  importAllData,
  roundCurrency,
  saveSettings,
  setActiveProjectId,
  settlePersonPending,
  subscribeStorageChange,
  toggleEntryVerified,
  toggleReimburseStatus,
  updateEntry,
  updateProject,
} from "@/lib/storage";
import { evaluateMathExpression } from "@/lib/mathEval";
import { getReceiptImage } from "@/lib/imageStore";
import { LedgerTab } from "./LedgerTab";
import { ReportTab } from "./ReportTab";
import { PrintableReport } from "./PrintableReport";
import { ReceiptLightbox } from "./ReceiptLightbox";

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

  // New Activity Modal
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjName, setNewProjName] = useState("");
  const [newProjBudget, setNewProjBudget] = useState("");

  // Print Preview Modal
  const [printPreview, setPrintPreview] = useState<{
    filteredEntries: LedgerEntry[];
    dateRangeLabel: string;
  } | null>(null);

  // Receipt Image Lightbox
  const [lightboxState, setLightboxState] = useState<{
    entryId: string;
    imageSrc: string | null;
  } | null>(null);

  const projects = useSyncExternalStore(
    subscribeStorageChange,
    getProjectsSnapshot,
    getServerProjectsSnapshot
  );

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

  const activeProject = useMemo(() => {
    return (
      projects.find((p) => p.id === settings.activeProjectId) ?? projects[0]
    );
  }, [projects, settings.activeProjectId]);

  const projectEntries = useMemo(() => {
    return entries.filter((e) => e.projectId === activeProject.id);
  }, [entries, activeProject.id]);

  const topNetBalance = useMemo(() => {
    let inc = 0;
    let exp = 0;
    for (const e of projectEntries) {
      if (e.type === "income") inc += e.amount;
      else exp += e.amount;
    }
    return roundCurrency(activeProject.budgetLimit + inc - exp);
  }, [projectEntries, activeProject.budgetLimit]);

  const lightboxEntry = useMemo(() => {
    if (!lightboxState) return null;
    return entries.find((e) => e.id === lightboxState.entryId) ?? null;
  }, [lightboxState, entries]);

  async function handleOpenImageLightbox(entry: LedgerEntry) {
    const src = entry.imageId ? await getReceiptImage(entry.imageId) : null;
    setLightboxState({ entryId: entry.id, imageSrc: src });
  }

  function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newProjName.trim();
    if (!trimmed) return;
    let parsedBudget = 0;
    if (newProjBudget.trim()) {
      const ev = evaluateMathExpression(newProjBudget);
      if (ev.ok && ev.value > 0) parsedBudget = ev.value;
    }
    addProject({ name: trimmed, budgetLimit: parsedBudget });
    setNewProjName("");
    setNewProjBudget("");
    setNewProjectOpen(false);
    setActiveTab("ledger");
  }

  const generatedDateLabel = todayKey ? formatThaiDateFull(todayKey) : "";
  const activePrintEntries = printPreview
    ? printPreview.filteredEntries
    : projectEntries;
  const activePrintLabel = printPreview
    ? printPreview.dateRangeLabel
    : "ทั้งหมด";

  return (
    <>
      <div className="min-h-screen flex flex-col bg-[#FBF8F1] text-[#1C1917] print:hidden">
        {/* Clean Compact Sticky Top Bar */}
        <header className="sticky top-0 z-30 border-b border-[#EDE6D8] bg-[#FBF8F1]/95 backdrop-blur-md">
          <div className="mx-auto max-w-[1380px] px-3 sm:px-5 h-16 flex items-center justify-between gap-2">
            {/* Left: Activity Selector + Create Button + Net */}
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex items-center gap-1.5 bg-white border border-[#EDE6D8] rounded-2xl px-2.5 py-1.5 shadow-2xs min-w-0">
                <span className="text-sm shrink-0">📁</span>
                <select
                  aria-label="เลือกกิจกรรม"
                  value={activeProject.id}
                  onChange={(e) => setActiveProjectId(e.target.value)}
                  className="bg-transparent text-xs sm:text-sm font-bold text-[#1C1917] focus:outline-none max-w-[140px] sm:max-w-[220px] truncate cursor-pointer"
                >
                  {projects.map((proj) => (
                    <option key={proj.id} value={proj.id}>
                      {proj.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => setNewProjectOpen(true)}
                className="px-2.5 sm:px-3 py-2 rounded-2xl bg-amber-100 hover:bg-amber-200 text-amber-950 text-xs font-bold shrink-0 cursor-pointer"
              >
                + กิจกรรมใหม่
              </button>

              <span className="hidden md:inline-flex items-center gap-1 text-xs text-[#78716C] tabular-nums ml-1">
                คงเหลือ{" "}
                <strong
                  className={
                    topNetBalance < 0 ? "text-rose-700" : "text-[#1C1917]"
                  }
                >
                  {topNetBalance < 0 ? "-" : ""}฿
                  {formatBaht(Math.abs(topNetBalance))}
                </strong>
              </span>
            </div>

            {/* Right: 2 Clean Tabs */}
            <nav
              aria-label="เมนูหลัก"
              className="flex items-center gap-1 bg-white p-1 rounded-2xl border border-[#EDE6D8] shadow-2xs shrink-0"
            >
              <button
                type="button"
                onClick={() => setActiveTab("ledger")}
                className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
                  activeTab === "ledger"
                    ? "bg-[#EA580C] text-white"
                    : "text-[#57534E] hover:text-[#1C1917]"
                }`}
              >
                จดยอด &amp; บิล
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("report")}
                className={`px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
                  activeTab === "report"
                    ? "bg-[#1C1917] text-white"
                    : "text-[#57534E] hover:text-[#1C1917]"
                }`}
              >
                สรุป &amp; พิมพ์ PDF
              </button>
            </nav>
          </div>
        </header>

        {/* Main Workspace */}
        <main className="flex-1 pb-8">
          {activeTab === "ledger" ? (
            <LedgerTab
              key={activeProject.id}
              todayKey={todayKey}
              project={activeProject}
              entries={projectEntries}
              settings={settings}
              onAddEntry={(input: NewLedgerEntryInput) => addEntry(input)}
              onUpdateEntry={(id: string, patch: UpdateLedgerEntryPatch) =>
                updateEntry(id, patch)
              }
              onToggleVerified={(id: string) => toggleEntryVerified(id)}
              onToggleReimburse={(id: string) => toggleReimburseStatus(id)}
              onDeleteEntry={(id: string) => deleteEntry(id)}
              onOpenImageLightbox={handleOpenImageLightbox}
              onGoToSettings={() => {
                setSettingsOpen(true);
                setActiveTab("report");
              }}
            />
          ) : (
            <ReportTab
              key={activeProject.id}
              todayKey={todayKey}
              project={activeProject}
              projectsCount={projects.length}
              entries={projectEntries}
              settings={settings}
              settingsOpen={settingsOpen}
              onToggleSettingsOpen={setSettingsOpen}
              onUpdateProject={(patch) =>
                updateProject(activeProject.id, patch)
              }
              onDeleteProject={() => deleteProject(activeProject.id)}
              onSaveSettings={(next: LedgerSettings) => saveSettings(next)}
              onSettlePersonPending={(personName: string) =>
                settlePersonPending(activeProject.id, personName)
              }
              onExportJson={() => JSON.stringify(exportAllData(), null, 2)}
              onImportJson={(raw: string) => {
                const snap = importAllData(raw);
                return { count: snap.entries.length };
              }}
              onClearProjectEntries={() => clearProjectEntries(activeProject.id)}
              onOpenPrintPreview={(payload) => setPrintPreview(payload)}
            />
          )}
        </main>
      </div>

      {/* Create New Activity Modal */}
      {newProjectOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 print:hidden">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-proj-title"
            className="w-full max-w-md bg-white rounded-3xl border border-[#EDE6D8] p-5 shadow-xl space-y-4"
          >
            <div>
              <h3
                id="new-proj-title"
                className="text-base font-bold text-[#1C1917]"
              >
                สร้างกิจกรรม / แฟ้มบัญชีใหม่
              </h3>
              <p className="text-xs text-[#78716C] mt-0.5">
                แยกยอดและบิลของแต่ละงานคณะไม่ให้ปนกัน (เริ่มที่ 0 บาทสะอาด ๆ)
              </p>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-3">
              <div>
                <label
                  htmlFor="new-proj-name"
                  className="block text-xs font-semibold text-[#57534E] mb-1"
                >
                  ชื่อกิจกรรม <span className="text-rose-500">*</span>
                </label>
                <input
                  id="new-proj-name"
                  type="text"
                  autoFocus
                  value={newProjName}
                  onChange={(e) => setNewProjName(e.target.value)}
                  placeholder="เช่น ค่ายอาสา, งานรับน้อง, ออกบูธครั้งที่ 2"
                  className="w-full rounded-xl border border-[#E7E0D2] px-3.5 py-2.5 text-sm"
                />
              </div>

              <div>
                <label
                  htmlFor="new-proj-budget"
                  className="block text-xs font-semibold text-[#57534E] mb-1"
                >
                  งบตั้งต้นของกิจกรรมนี้ (ไม่บังคับ)
                </label>
                <input
                  id="new-proj-budget"
                  type="text"
                  value={newProjBudget}
                  onChange={(e) => setNewProjBudget(e.target.value)}
                  placeholder="ปล่อยว่างถ้าไม่มีงบตั้งต้น"
                  className="w-full rounded-xl border border-[#E7E0D2] px-3.5 py-2.5 text-sm tabular-nums"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setNewProjectOpen(false)}
                  className="px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-xs font-bold text-stone-700 cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={!newProjName.trim()}
                  className="px-4 py-2 rounded-xl bg-[#EA580C] hover:bg-[#C2410C] disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
                >
                  สร้างกิจกรรม
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Receipt Image Lightbox */}
      {lightboxEntry && lightboxState && (
        <ReceiptLightbox
          entry={lightboxEntry}
          imageSrc={lightboxState.imageSrc}
          onToggleVerified={(id) => toggleEntryVerified(id)}
          onClose={() => setLightboxState(null)}
        />
      )}

      {/* Print Preview Modal */}
      {printPreview && (
        <div className="fixed inset-0 z-50 bg-stone-900/75 backdrop-blur-xs overflow-y-auto print:hidden">
          <div className="sticky top-0 z-10 bg-stone-900 text-white px-4 py-3 flex items-center justify-between gap-3 border-b border-stone-700">
            <button
              type="button"
              onClick={() => setPrintPreview(null)}
              className="px-3.5 py-1.5 rounded-xl bg-stone-700 hover:bg-stone-600 text-xs sm:text-sm font-bold cursor-pointer"
            >
              ← กลับหน้าสรุป
            </button>
            <div className="text-xs text-stone-300 hidden sm:block">
              ตัวอย่างใบสรุปงบขนาด A4 ({activeProject.name})
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
                project={activeProject}
                entries={printPreview.filteredEntries}
                dateRangeLabel={printPreview.dateRangeLabel}
                generatedDateLabel={generatedDateLabel}
              />
            </div>
          </div>
        </div>
      )}

      {/* Actual A4 Printable Root */}
      <div className="hidden print:block">
        <PrintableReport
          project={activeProject}
          entries={activePrintEntries}
          dateRangeLabel={activePrintLabel}
          generatedDateLabel={generatedDateLabel}
        />
      </div>
    </>
  );
}
