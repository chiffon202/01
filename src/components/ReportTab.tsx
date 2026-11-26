"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  CHANNEL_LABELS,
  LedgerEntry,
  LedgerSettings,
  PaymentChannel,
  formatBaht,
  formatThaiDateLabel,
  getLegacyBoothSummary,
  getThailandDateKey,
  roundCurrency,
} from "@/lib/storage";
import { evaluateMathExpression } from "@/lib/mathEval";

interface ReportTabProps {
  todayKey: string;
  entries: LedgerEntry[];
  settings: LedgerSettings;
  settingsOpen: boolean;
  onToggleSettingsOpen: (open: boolean) => void;
  onSaveSettings: (next: LedgerSettings) => void;
  onSettlePersonPending: (personName: string) => void;
  onExportJson: () => string;
  onImportJson: (raw: string) => { count: number };
  onImportLegacyBooth: () => number;
  onClearAllEntries: () => void;
  onOpenPrintPreview: (payload: {
    filteredEntries: LedgerEntry[];
    dateRangeLabel: string;
  }) => void;
}

type RangeMode = "all" | "thisMonth" | "custom";

export function ReportTab({
  todayKey,
  entries,
  settings,
  settingsOpen,
  onToggleSettingsOpen,
  onSaveSettings,
  onSettlePersonPending,
  onExportJson,
  onImportJson,
  onImportLegacyBooth,
  onClearAllEntries,
  onOpenPrintPreview,
}: ReportTabProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const effectiveToday = todayKey;
  const currentMonth = effectiveToday ? effectiveToday.slice(0, 7) : "";

  // Date range filters
  const [rangeMode, setRangeMode] = useState<RangeMode>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  // Feedback state
  const [copyStatus, setCopyStatus] = useState<string>("");
  const [backupFeedback, setBackupFeedback] = useState<string>("");

  // Settings draft state
  const [draftLedgerName, setDraftLedgerName] = useState(settings.ledgerName);
  const [draftOrgName, setDraftOrgName] = useState(settings.organizationName);
  const [draftBudgetExpr, setDraftBudgetExpr] = useState(
    String(settings.startingBudget)
  );
  const [newExpCat, setNewExpCat] = useState("");
  const [newIncCat, setNewIncCat] = useState("");
  const [settingsSavedMsg, setSettingsSavedMsg] = useState("");

  // Clear-all typed lock modal
  const [confirmClearModal, setConfirmClearModal] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState("");

  // Legacy booth detection (only reads localStorage on client via function call)
  const legacySummary = useMemo(() => {
    void entries.length;
    return getLegacyBoothSummary();
  }, [entries.length]);

  const { filteredEntries, dateRangeLabel } = useMemo(() => {
    if (rangeMode === "thisMonth") {
      const list = entries.filter((e) => e.dateKey.startsWith(currentMonth));
      return {
        filteredEntries: list,
        dateRangeLabel: `เดือน ${currentMonth}`,
      };
    }

    if (rangeMode === "custom" && (startDate || endDate)) {
      const list = entries.filter((e) => {
        if (startDate && e.dateKey < startDate) return false;
        if (endDate && e.dateKey > endDate) return false;
        return true;
      });
      const label = `${startDate ? formatThaiDateLabel(startDate) : "เริ่มต้น"} – ${
        endDate ? formatThaiDateLabel(endDate) : "ล่าสุด"
      }`;
      return { filteredEntries: list, dateRangeLabel: label };
    }

    return { filteredEntries: entries, dateRangeLabel: "ทั้งหมด" };
  }, [entries, rangeMode, currentMonth, startDate, endDate]);

  const analytics = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    let pendingAmount = 0;
    let pendingCount = 0;

    const expByCat = new Map<string, { amount: number; count: number }>();
    const incByCat = new Map<string, { amount: number; count: number }>();
    const pendingByPerson = new Map<string, { amount: number; count: number }>();
    const byChannel: Record<
      PaymentChannel,
      { income: number; expense: number }
    > = {
      make: { income: 0, expense: 0 },
      cash: { income: 0, expense: 0 },
      bank: { income: 0, expense: 0 },
      other: { income: 0, expense: 0 },
    };

    for (const e of filteredEntries) {
      if (e.type === "income") {
        totalIncome += e.amount;
        const c = incByCat.get(e.category) ?? { amount: 0, count: 0 };
        c.amount += e.amount;
        c.count += 1;
        incByCat.set(e.category, c);
        byChannel[e.channel].income += e.amount;
      } else {
        totalExpense += e.amount;
        const c = expByCat.get(e.category) ?? { amount: 0, count: 0 };
        c.amount += e.amount;
        c.count += 1;
        expByCat.set(e.category, c);
        byChannel[e.channel].expense += e.amount;
      }

      if (e.reimburseStatus === "pending") {
        pendingAmount += e.amount;
        pendingCount += 1;
        const pName = e.personName.trim() || "ไม่ระบุชื่อ";
        const p = pendingByPerson.get(pName) ?? { amount: 0, count: 0 };
        p.amount += e.amount;
        p.count += 1;
        pendingByPerson.set(pName, p);
      }
    }

    const totalPool = roundCurrency(settings.startingBudget + totalIncome);
    const netBalance = roundCurrency(totalPool - totalExpense);
    const spentPct =
      totalPool > 0
        ? Math.min(100, roundCurrency((totalExpense / totalPool) * 100))
        : totalExpense > 0
        ? 100
        : 0;

    return {
      totalIncome: roundCurrency(totalIncome),
      totalExpense: roundCurrency(totalExpense),
      totalPool,
      netBalance,
      spentPct,
      pendingAmount: roundCurrency(pendingAmount),
      pendingCount,
      expCategories: Array.from(expByCat.entries()).sort(
        (a, b) => b[1].amount - a[1].amount
      ),
      incCategories: Array.from(incByCat.entries()).sort(
        (a, b) => b[1].amount - a[1].amount
      ),
      pendingPersons: Array.from(pendingByPerson.entries()).sort(
        (a, b) => b[1].amount - a[1].amount
      ),
      byChannel,
    };
  }, [filteredEntries, settings.startingBudget]);

  async function handleCopySummary() {
    const lines: string[] = [
      `📒 สรุปบัญชี: ${settings.ledgerName}`,
      `📅 ช่วงข้อมูล: ${dateRangeLabel}`,
      `━━━━━━━━━━━━━━`,
      `🏦 งบตั้งต้น: ${formatBaht(settings.startingBudget)} บาท`,
      `➕ รายรับเพิ่มเติม: ${formatBaht(analytics.totalIncome)} บาท`,
      `➖ รายจ่ายรวม: ${formatBaht(analytics.totalExpense)} บาท (${
        filteredEntries.filter((e) => e.type === "expense").length
      } บิล)`,
      `💰 คงเหลือสุทธิ: ${analytics.netBalance < 0 ? "-" : ""}${formatBaht(
        Math.abs(analytics.netBalance)
      )} บาท`,
    ];

    if (analytics.expCategories.length > 0) {
      lines.push(`━━━━━━━━━━━━━━`, `📂 รายจ่ายแยกตามหมวด:`);
      for (const [cat, stat] of analytics.expCategories) {
        lines.push(
          `  • ${cat}: ${formatBaht(stat.amount)} บาท (${stat.count} บิล)`
        );
      }
    }

    if (analytics.pendingPersons.length > 0) {
      lines.push(
        `━━━━━━━━━━━━━━`,
        `⏳ ยอดสำรองจ่ายรอโอนคืน (${formatBaht(analytics.pendingAmount)} บาท):`
      );
      for (const [person, stat] of analytics.pendingPersons) {
        lines.push(
          `  • ${person}: ${formatBaht(stat.amount)} บาท (${stat.count} บิล)`
        );
      }
    }

    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("คัดลอกสรุปส่งแชทแล้ว!");
    } catch {
      setCopyStatus("คัดลอกไม่สำเร็จ (กรุณาอนุญาตสิทธิ์ Clipboard)");
    }
    setTimeout(() => setCopyStatus(""), 2500);
  }

  function handleExportCsv() {
    const header = [
      "วันที่",
      "ประเภท",
      "รายการ",
      "จำนวนเงิน",
      "สูตรคำนวณ",
      "หมวดหมู่",
      "ช่องทาง",
      "เลขที่บิล",
      "ผู้เบิก/ผู้จ่าย",
      "สถานะคืนเงิน",
      "หมายเหตุ",
    ];

    const escapeCsv = (val: string) => {
      const safe = val.replaceAll('"', '""');
      return `"${safe}"`;
    };

    const sortedAsc = [...filteredEntries].sort((a, b) =>
      a.dateKey.localeCompare(b.dateKey)
    );

    const rows = sortedAsc.map((e) =>
      [
        e.dateKey,
        e.type === "income" ? "รายรับ" : "รายจ่าย",
        e.title,
        String(e.amount),
        e.formula ?? "",
        e.category,
        CHANNEL_LABELS[e.channel],
        e.receiptRef,
        e.personName,
        e.reimburseStatus === "pending" ? "รอคืนเงิน" : "เคลียร์แล้ว",
        e.note,
      ]
        .map(escapeCsv)
        .join(",")
    );

    const csvContent = "\uFEFF" + [header.map(escapeCsv).join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `treasurer-report-${effectiveToday || getThailandDateKey()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleDownloadJson() {
    const json = onExportJson();
    const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `treasurer-backup-${effectiveToday || getThailandDateKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setBackupFeedback("ดาวน์โหลดไฟล์สำรอง JSON เรียบร้อย");
    setTimeout(() => setBackupFeedback(""), 2500);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const res = onImportJson(text);
      setBackupFeedback(`นำเข้าข้อมูลสำเร็จ (${res.count} รายการ)`);
    } catch (err) {
      setBackupFeedback(
        err instanceof Error ? err.message : "นำเข้าไฟล์ไม่สำเร็จ"
      );
    } finally {
      e.target.value = "";
    }
  }

  function handleSaveBasicSettings(e: React.FormEvent) {
    e.preventDefault();
    const budgetEval = evaluateMathExpression(draftBudgetExpr);
    if (!budgetEval.ok || budgetEval.value < 0) {
      setSettingsSavedMsg("กรุณากรอกงบตั้งต้นเป็นตัวเลขที่ถูกต้อง");
      return;
    }
    onSaveSettings({
      ...settings,
      ledgerName: draftLedgerName.trim() || "สมุดงบเหรัญญิก",
      organizationName: draftOrgName.trim(),
      startingBudget: budgetEval.value,
    });
    setDraftBudgetExpr(String(budgetEval.value));
    setSettingsSavedMsg("บันทึกการตั้งค่าแล้ว");
    setTimeout(() => setSettingsSavedMsg(""), 2200);
  }

  function handleAddCategory(kind: "expense" | "income") {
    const raw = kind === "expense" ? newExpCat : newIncCat;
    const trimmed = raw.trim();
    if (!trimmed) return;
    const targetList =
      kind === "expense"
        ? settings.expenseCategories
        : settings.incomeCategories;
    if (targetList.includes(trimmed)) {
      if (kind === "expense") setNewExpCat("");
      else setNewIncCat("");
      return;
    }

    onSaveSettings({
      ...settings,
      expenseCategories:
        kind === "expense"
          ? [...settings.expenseCategories, trimmed]
          : settings.expenseCategories,
      incomeCategories:
        kind === "income"
          ? [...settings.incomeCategories, trimmed]
          : settings.incomeCategories,
    });

    if (kind === "expense") setNewExpCat("");
    else setNewIncCat("");
  }

  function handleDeleteCategory(kind: "expense" | "income", cat: string) {
    const targetList =
      kind === "expense"
        ? settings.expenseCategories
        : settings.incomeCategories;
    if (targetList.length <= 1) return; // Keep at least 1 category

    onSaveSettings({
      ...settings,
      expenseCategories:
        kind === "expense"
          ? settings.expenseCategories.filter((c) => c !== cat)
          : settings.expenseCategories,
      incomeCategories:
        kind === "income"
          ? settings.incomeCategories.filter((c) => c !== cat)
          : settings.incomeCategories,
    });
  }

  return (
    <div className="mx-auto max-w-[1440px] px-3 sm:px-5 py-4 space-y-4">
      {/* Top Action & Date Filter Toolbar */}
      <div className="bg-white rounded-3xl border border-[#EDE6D8] p-4 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-[#57534E] mr-1">
            ช่วงรายงาน:
          </span>
          {(
            [
              { id: "all", label: "ทั้งหมด" },
              { id: "thisMonth", label: `เดือนนี้ (${currentMonth})` },
              { id: "custom", label: "กำหนดช่วงวันที่" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setRangeMode(item.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border cursor-pointer ${
                rangeMode === item.id
                  ? "bg-[#1C1917] border-[#1C1917] text-white"
                  : "bg-[#FBF8F1] border-[#EDE6D8] text-[#57534E] hover:bg-stone-100"
              }`}
            >
              {item.label}
            </button>
          ))}

          {rangeMode === "custom" && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1 sm:mt-0">
              <input
                type="date"
                aria-label="ตั้งแต่วันที่"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-xl border border-[#E7E0D2] bg-[#FBF8F1] px-2.5 py-1 text-xs tabular-nums"
              />
              <span className="text-xs text-stone-400">ถึง</span>
              <input
                type="date"
                aria-label="ถึงวันที่"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-xl border border-[#E7E0D2] bg-[#FBF8F1] px-2.5 py-1 text-xs tabular-nums"
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              onOpenPrintPreview({
                filteredEntries,
                dateRangeLabel,
              })
            }
            className="px-4 py-2 rounded-2xl bg-[#EA580C] hover:bg-[#C2410C] text-white text-xs sm:text-sm font-bold shadow-xs cursor-pointer"
          >
            🖨️ ดูตัวอย่าง &amp; พิมพ์ / บันทึก PDF
          </button>

          <button
            type="button"
            onClick={handleCopySummary}
            className="px-3.5 py-2 rounded-2xl bg-amber-100 hover:bg-amber-200 text-amber-950 text-xs sm:text-sm font-bold cursor-pointer"
          >
            📋 คัดลอกสรุปส่งแชท
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3.5 py-2 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs sm:text-sm font-semibold cursor-pointer"
          >
            📊 Export CSV
          </button>
        </div>
      </div>

      {copyStatus && (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs sm:text-sm font-semibold text-emerald-800">
          ✓ {copyStatus}
        </div>
      )}

      {/* Main 2-Column Analytical Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-6 space-y-4">
          {/* Budget Overview Card */}
          <div className="bg-white rounded-3xl border border-[#EDE6D8] p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#1C1917]">
                ภาพรวมงบประมาณ ({dateRangeLabel})
              </h2>
              <span className="text-xs font-semibold text-[#78716C] tabular-nums">
                {filteredEntries.length} บิล
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div className="rounded-2xl bg-[#FBF8F1] border border-[#EDE6D8] p-3">
                <div className="text-[11px] text-[#78716C]">งบตั้งต้น</div>
                <div className="text-base font-bold tabular-nums text-[#1C1917]">
                  ฿{formatBaht(settings.startingBudget)}
                </div>
              </div>
              <div className="rounded-2xl bg-emerald-50/70 border border-emerald-200 p-3">
                <div className="text-[11px] text-emerald-700">รายรับเพิ่ม</div>
                <div className="text-base font-bold tabular-nums text-emerald-800">
                  +฿{formatBaht(analytics.totalIncome)}
                </div>
              </div>
              <div className="rounded-2xl bg-rose-50/70 border border-rose-200 p-3 col-span-2 sm:col-span-1">
                <div className="text-[11px] text-rose-700">รายจ่ายรวม</div>
                <div className="text-base font-bold tabular-nums text-rose-800">
                  -฿{formatBaht(analytics.totalExpense)}
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-semibold text-[#57534E]">
                  สัดส่วนการใช้งบ (รวมงบตั้งต้น + รายรับ = ฿
                  {formatBaht(analytics.totalPool)})
                </span>
                <span className="font-bold tabular-nums text-[#1C1917]">
                  ใช้ไป {analytics.spentPct}%
                </span>
              </div>
              <div className="h-3 w-full rounded-full bg-stone-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    analytics.netBalance < 0
                      ? "bg-rose-500"
                      : analytics.spentPct > 80
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                  }`}
                  style={{ width: `${analytics.spentPct}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-[#57534E]">
                  ยอดคงเหลือสุทธิ:
                </span>
                <span
                  className={`text-lg font-bold tabular-nums ${
                    analytics.netBalance < 0
                      ? "text-rose-700"
                      : "text-emerald-700"
                  }`}
                >
                  {analytics.netBalance < 0 ? "-" : ""}฿
                  {formatBaht(Math.abs(analytics.netBalance))}
                </span>
              </div>
            </div>
          </div>

          {/* Expense Breakdown by Category */}
          <div className="bg-white rounded-3xl border border-[#EDE6D8] p-4 sm:p-5 shadow-xs space-y-3">
            <h2 className="text-base font-bold text-[#1C1917]">
              รายจ่ายแยกตามหมวดหมู่
            </h2>
            {analytics.expCategories.length === 0 ? (
              <p className="text-xs text-[#78716C]">
                ยังไม่มีรายจ่ายในช่วงข้อมูลที่เลือก
              </p>
            ) : (
              <div className="space-y-2.5">
                {analytics.expCategories.map(([cat, stat]) => {
                  const pct =
                    analytics.totalExpense > 0
                      ? Math.round((stat.amount / analytics.totalExpense) * 100)
                      : 0;
                  return (
                    <div key={cat}>
                      <div className="flex items-center justify-between text-xs sm:text-sm mb-1">
                        <span className="font-semibold text-[#1C1917]">
                          {cat}{" "}
                          <span className="text-xs font-normal text-[#78716C]">
                            ({stat.count} บิล)
                          </span>
                        </span>
                        <span className="font-bold tabular-nums text-[#1C1917]">
                          ฿{formatBaht(stat.amount)}{" "}
                          <span className="text-xs font-normal text-[#78716C]">
                            ({pct}%)
                          </span>
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-stone-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#EA580C]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {analytics.incCategories.length > 0 && (
              <div className="pt-3 border-t border-[#F4EFE6] space-y-2">
                <h3 className="text-sm font-bold text-emerald-800">
                  รายรับแยกตามหมวดหมู่
                </h3>
                {analytics.incCategories.map(([cat, stat]) => (
                  <div
                    key={cat}
                    className="flex items-center justify-between text-xs sm:text-sm"
                  >
                    <span className="text-[#44403C]">
                      {cat} ({stat.count} บิล)
                    </span>
                    <span className="font-bold tabular-nums text-emerald-700">
                      +฿{formatBaht(stat.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="lg:col-span-6 space-y-4">
          {/* Pending Reimbursements by Person */}
          <div className="bg-white rounded-3xl border border-[#EDE6D8] p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#1C1917]">
                สรุปยอดสำรองจ่ายรอโอนคืน (รายบุคคล)
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 tabular-nums">
                ฿{formatBaht(analytics.pendingAmount)}
              </span>
            </div>

            {analytics.pendingPersons.length === 0 ? (
              <p className="text-xs text-emerald-700 bg-emerald-50/70 border border-emerald-200 rounded-2xl px-3.5 py-2.5 font-medium">
                ✓ เคลียร์ยอดสำรองจ่ายครบทุกรายการแล้ว ไม่มีบิลค้างโอนคืน
              </p>
            ) : (
              <div className="space-y-2">
                {analytics.pendingPersons.map(([person, stat]) => (
                  <div
                    key={person}
                    className="flex items-center justify-between gap-2 rounded-2xl bg-amber-50/60 border border-amber-200 px-3.5 py-2.5"
                  >
                    <div>
                      <div className="text-sm font-bold text-[#1C1917]">
                        {person}
                      </div>
                      <div className="text-xs text-amber-800 tabular-nums">
                        รอโอนคืน {stat.count} บิล ·{" "}
                        <strong>฿{formatBaht(stat.amount)}</strong>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSettlePersonPending(person)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                    >
                      ✓ โอนคืนครบแล้ว
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Channel Breakdown */}
          <div className="bg-white rounded-3xl border border-[#EDE6D8] p-4 sm:p-5 shadow-xs space-y-2.5">
            <h2 className="text-base font-bold text-[#1C1917]">
              กระแสเงินแยกตามช่องทาง
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(Object.keys(CHANNEL_LABELS) as PaymentChannel[]).map((ch) => {
                const stat = analytics.byChannel[ch];
                const net = roundCurrency(stat.income - stat.expense);
                return (
                  <div
                    key={ch}
                    className="rounded-2xl bg-[#FBF8F1] border border-[#EDE6D8] p-3"
                  >
                    <div className="text-xs font-bold text-[#1C1917]">
                      {CHANNEL_LABELS[ch]}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-[#57534E] tabular-nums">
                      <span>รับ: +฿{formatBaht(stat.income)}</span>
                      <span>จ่าย: -฿{formatBaht(stat.expense)}</span>
                    </div>
                    <div className="mt-1 text-xs font-bold tabular-nums text-[#1C1917]">
                      สุทธิ: {net < 0 ? "-" : net > 0 ? "+" : ""}฿
                      {formatBaht(Math.abs(net))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Collapsible Settings & Categories Manager */}
          <div className="bg-white rounded-3xl border border-[#EDE6D8] shadow-xs overflow-hidden">
            <button
              type="button"
              onClick={() => onToggleSettingsOpen(!settingsOpen)}
              className="w-full px-4 sm:px-5 py-3.5 flex items-center justify-between text-left hover:bg-stone-50/70 cursor-pointer"
            >
              <div>
                <div className="text-sm sm:text-base font-bold text-[#1C1917]">
                  ⚙️ ตั้งค่างบประมาณ &amp; จัดการหมวดหมู่ (เพิ่ม/ลบได้)
                </div>
                <div className="text-xs text-[#78716C]">
                  แก้ชื่อสมุดงบ, งบตั้งต้น และหมวดหมู่รายรับ-รายจ่าย
                </div>
              </div>
              <span className="text-xs font-bold text-stone-500">
                {settingsOpen ? "▲ ซ่อน" : "▼ เปิดตั้งค่า"}
              </span>
            </button>

            {settingsOpen && (
              <div className="px-4 sm:px-5 pb-5 pt-2 border-t border-[#F4EFE6] space-y-5">
                {/* Basic Settings Form */}
                <form onSubmit={handleSaveBasicSettings} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-semibold text-[#57534E] mb-1">
                        ชื่อสมุดบัญชี / หัวรายงาน
                      </label>
                      <input
                        type="text"
                        value={draftLedgerName}
                        onChange={(e) => setDraftLedgerName(e.target.value)}
                        className="w-full rounded-xl border border-[#E7E0D2] bg-[#FFFDFA] px-3 py-2 text-xs text-[#1C1917]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#57534E] mb-1">
                        งบตั้งต้น / เงินกองกลางเริ่มแรก (บาท)
                      </label>
                      <input
                        type="text"
                        value={draftBudgetExpr}
                        onChange={(e) => setDraftBudgetExpr(e.target.value)}
                        placeholder="เช่น 3000 หรือ 1500+1500"
                        className="w-full rounded-xl border border-[#E7E0D2] bg-[#FFFDFA] px-3 py-2 text-xs font-bold tabular-nums text-[#1C1917]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#57534E] mb-1">
                      ชื่อฝ่าย / คำอธิบายใต้หัวรายงาน (ใช้แสดงบนใบ PDF)
                    </label>
                    <input
                      type="text"
                      value={draftOrgName}
                      onChange={(e) => setDraftOrgName(e.target.value)}
                      className="w-full rounded-xl border border-[#E7E0D2] bg-[#FFFDFA] px-3 py-2 text-xs text-[#1C1917]"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-[#1C1917] hover:bg-stone-800 text-white text-xs font-bold cursor-pointer"
                    >
                      บันทึกการตั้งค่า
                    </button>
                    {settingsSavedMsg && (
                      <span className="text-xs font-semibold text-emerald-700">
                        {settingsSavedMsg}
                      </span>
                    )}
                  </div>
                </form>

                {/* Expense Categories */}
                <div className="pt-3 border-t border-[#F4EFE6] space-y-2">
                  <div className="text-xs font-bold text-[#1C1917]">
                    หมวดหมู่รายจ่าย ({settings.expenseCategories.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {settings.expenseCategories.map((cat) => (
                      <span
                        key={cat}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-orange-50 border border-orange-200 text-xs font-medium text-orange-950"
                      >
                        {cat}
                        {settings.expenseCategories.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory("expense", cat)}
                            aria-label={`ลบหมวด ${cat}`}
                            className="text-orange-700 hover:text-rose-700 font-bold cursor-pointer"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newExpCat}
                      onChange={(e) => setNewExpCat(e.target.value)}
                      placeholder="เพิ่มหมวดหมู่รายจ่ายใหม่..."
                      className="flex-1 rounded-xl border border-[#E7E0D2] px-3 py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddCategory("expense")}
                      className="px-3 py-1.5 rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-950 text-xs font-bold cursor-pointer"
                    >
                      + เพิ่ม
                    </button>
                  </div>
                </div>

                {/* Income Categories */}
                <div className="pt-3 border-t border-[#F4EFE6] space-y-2">
                  <div className="text-xs font-bold text-[#1C1917]">
                    หมวดหมู่รายรับ ({settings.incomeCategories.length})
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {settings.incomeCategories.map((cat) => (
                      <span
                        key={cat}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-950"
                      >
                        {cat}
                        {settings.incomeCategories.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory("income", cat)}
                            aria-label={`ลบหมวด ${cat}`}
                            className="text-emerald-700 hover:text-rose-700 font-bold cursor-pointer"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newIncCat}
                      onChange={(e) => setNewIncCat(e.target.value)}
                      placeholder="เพิ่มหมวดหมู่รายรับใหม่..."
                      className="flex-1 rounded-xl border border-[#E7E0D2] px-3 py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddCategory("income")}
                      className="px-3 py-1.5 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-950 text-xs font-bold cursor-pointer"
                    >
                      + เพิ่ม
                    </button>
                  </div>
                </div>

                {/* Danger Zone */}
                <div className="pt-3 border-t border-rose-100">
                  <button
                    type="button"
                    onClick={() => {
                      setClearConfirmText("");
                      setConfirmClearModal(true);
                    }}
                    className="px-3.5 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold cursor-pointer"
                  >
                    🗑️ ล้างรายการบัญชีทั้งหมด (เริ่มสมุดใหม่)
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* JSON Backup Card */}
          <div
            aria-label="สำรองข้อมูล"
            className="bg-white rounded-3xl border border-[#EDE6D8] p-4 sm:p-5 shadow-xs space-y-3"
          >
            <div>
              <h2 className="text-sm sm:text-base font-bold text-[#1C1917]">
                💾 สำรองข้อมูลเก็บไว้ / ย้ายเครื่อง (JSON)
              </h2>
              <p className="text-xs text-[#78716C] mt-0.5">
                รองรับทั้งไฟล์ JSON ของ Treasurer Note และไฟล์สำรองเดิมจาก Booth Note
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleDownloadJson}
                className="px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold cursor-pointer"
              >
                ดาวน์โหลด JSON สำรอง
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold cursor-pointer"
              >
                นำเข้าจากไฟล์ JSON
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {legacySummary && (
              <div className="rounded-2xl bg-amber-50/80 border border-amber-200 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="text-xs text-amber-950">
                  <strong>พบข้อมูล Booth Note เดิมในเครื่องนี้:</strong> รายจ่าย{" "}
                  {legacySummary.expensesCount} รายการ (฿
                  {formatBaht(legacySummary.expensesTotal)}) และยอดขาย{" "}
                  {legacySummary.ordersCount} บิล (฿
                  {formatBaht(legacySummary.salesTotal)})
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const count = onImportLegacyBooth();
                    setBackupFeedback(
                      `ดึงข้อมูลจาก Booth Note เดิมเข้าสมุดบัญชีแล้ว (${count} รายการ)`
                    );
                  }}
                  className="shrink-0 px-3 py-1.5 rounded-xl bg-amber-200 hover:bg-amber-300 text-amber-950 text-xs font-bold cursor-pointer"
                >
                  นำเข้าจาก Booth Note เดิม
                </button>
              </div>
            )}

            {backupFeedback && (
              <div className="text-xs font-semibold text-emerald-700">
                ✓ {backupFeedback}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Clear All Confirmation Modal */}
      {confirmClearModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-modal-title"
            className="w-full max-w-md bg-white rounded-3xl border border-[#EDE6D8] p-5 shadow-xl space-y-3"
          >
            <h3
              id="clear-modal-title"
              className="text-base font-bold text-rose-700"
            >
              ยืนยันล้างรายการบัญชีทั้งหมด ({entries.length} รายการ)?
            </h3>
            <p className="text-xs text-[#57534E] leading-relaxed">
              การลบนี้จะล้างรายการบิลรายรับ-รายจ่ายทั้งหมดในสมุดบัญชีนี้ (หมวดหมู่และงบตั้งต้นจะยังอยู่)
              แนะนำให้กด &ldquo;ดาวน์โหลด JSON สำรอง&rdquo; ก่อนหากต้องการเก็บประวัติไว้
            </p>
            <div>
              <label
                htmlFor="confirm-clear-ledger-input"
                className="block text-xs font-semibold text-[#1C1917] mb-1"
              >
                พิมพ์คำว่า <span className="text-rose-600 font-bold">ลบ</span>{" "}
                เพื่อยืนยัน
              </label>
              <input
                id="confirm-clear-ledger-input"
                type="text"
                value={clearConfirmText}
                onChange={(e) => setClearConfirmText(e.target.value)}
                placeholder="พิมพ์ ลบ"
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmClearModal(false)}
                className="px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-xs font-bold text-stone-700 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={clearConfirmText.trim() !== "ลบ"}
                onClick={() => {
                  onClearAllEntries();
                  setConfirmClearModal(false);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
              >
                ยืนยันล้างรายการ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
