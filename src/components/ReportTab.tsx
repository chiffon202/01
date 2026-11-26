"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  ActivityProject,
  CHANNEL_LABELS,
  LedgerEntry,
  LedgerSettings,
  PaymentChannel,
  formatBaht,
  formatThaiDateLabel,
  getThailandDateKey,
  roundCurrency,
} from "@/lib/storage";
import { evaluateMathExpression } from "@/lib/mathEval";

interface ReportTabProps {
  todayKey: string;
  project: ActivityProject;
  projectsCount: number;
  entries: LedgerEntry[];
  settings: LedgerSettings;
  settingsOpen: boolean;
  onToggleSettingsOpen: (open: boolean) => void;
  onUpdateProject: (patch: {
    name: string;
    organizationName: string;
    budgetLimit: number;
  }) => void;
  onDeleteProject: () => void;
  onSaveSettings: (next: LedgerSettings) => void;
  onSettlePersonPending: (personName: string) => void;
  onExportJson: () => string;
  onImportJson: (raw: string) => { count: number };
  onClearProjectEntries: () => void;
  onOpenPrintPreview: (payload: {
    filteredEntries: LedgerEntry[];
    dateRangeLabel: string;
  }) => void;
}

type RangeMode = "all" | "thisMonth" | "custom";

export function ReportTab({
  todayKey,
  project,
  projectsCount,
  entries,
  settings,
  settingsOpen,
  onToggleSettingsOpen,
  onUpdateProject,
  onDeleteProject,
  onSaveSettings,
  onSettlePersonPending,
  onExportJson,
  onImportJson,
  onClearProjectEntries,
  onOpenPrintPreview,
}: ReportTabProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const currentMonth = todayKey ? todayKey.slice(0, 7) : "";

  const [rangeMode, setRangeMode] = useState<RangeMode>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const [copyStatus, setCopyStatus] = useState<string>("");
  const [backupFeedback, setBackupFeedback] = useState<string>("");

  // Project & Category Settings draft state (reset cleanly via key={project.id})
  const [draftName, setDraftName] = useState(project.name);
  const [draftOrgName, setDraftOrgName] = useState(project.organizationName);
  const [draftBudgetExpr, setDraftBudgetExpr] = useState(
    project.budgetLimit > 0 ? String(project.budgetLimit) : ""
  );
  const [newExpCat, setNewExpCat] = useState("");
  const [newIncCat, setNewIncCat] = useState("");
  const [settingsSavedMsg, setSettingsSavedMsg] = useState("");

  const [confirmClearModal, setConfirmClearModal] = useState(false);
  const [clearConfirmText, setClearConfirmText] = useState("");

  const { filteredEntries, dateRangeLabel } = useMemo(() => {
    if (rangeMode === "thisMonth" && currentMonth) {
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
    let verifiedCount = 0;

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
      if (e.verified) verifiedCount += 1;
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

    const totalPool = roundCurrency(project.budgetLimit + totalIncome);
    const netBalance = roundCurrency(totalPool - totalExpense);
    const spentPct =
      totalPool > 0
        ? Math.min(100, roundCurrency((totalExpense / totalPool) * 100))
        : 0;

    return {
      totalIncome: roundCurrency(totalIncome),
      totalExpense: roundCurrency(totalExpense),
      totalPool,
      netBalance,
      spentPct,
      pendingAmount: roundCurrency(pendingAmount),
      pendingCount,
      verifiedCount,
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
  }, [filteredEntries, project.budgetLimit]);

  async function handleCopySummary() {
    const lines: string[] = [
      `📒 สรุปยอด: ${project.name}`,
      `📅 ช่วงข้อมูล: ${dateRangeLabel}`,
      `━━━━━━━━━━━━━━`,
    ];
    if (project.budgetLimit > 0) {
      lines.push(`🏦 งบตั้งต้น: ${formatBaht(project.budgetLimit)} บาท`);
    }
    lines.push(
      `➕ รายรับรวม: ${formatBaht(analytics.totalIncome)} บาท`,
      `➖ รายจ่ายรวม: ${formatBaht(analytics.totalExpense)} บาท (${
        filteredEntries.filter((e) => e.type === "expense").length
      } บิล)`,
      `💰 คงเหลือสุทธิ: ${analytics.netBalance < 0 ? "-" : ""}${formatBaht(
        Math.abs(analytics.netBalance)
      )} บาท`
    );

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
        `⏳ รอโอนคืน (${formatBaht(analytics.pendingAmount)} บาท):`
      );
      for (const [person, stat] of analytics.pendingPersons) {
        lines.push(
          `  • ${person}: ${formatBaht(stat.amount)} บาท (${stat.count} บิล)`
        );
      }
    }

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
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
      "เช็กยอดแล้ว",
      "สถานะคืนเงิน",
      "หมายเหตุ",
    ];
    const escapeCsv = (val: string) => `"${val.replaceAll('"', '""')}"`;

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
        e.verified ? "เช็กแล้ว" : "ยังไม่เช็ก",
        e.reimburseStatus === "pending" ? "รอคืนเงิน" : "เคลียร์แล้ว",
        e.note,
      ]
        .map(escapeCsv)
        .join(",")
    );

    const csvContent =
      "\uFEFF" + [header.map(escapeCsv).join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `treasurer-${project.name}-${todayKey || getThailandDateKey()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleDownloadJson() {
    const json = onExportJson();
    const blob = new Blob([json], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `treasurer-backup-${todayKey || getThailandDateKey()}.json`;
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

  function handleSaveProjectSettings(e: React.FormEvent) {
    e.preventDefault();
    let parsedBudget = 0;
    if (draftBudgetExpr.trim()) {
      const budgetEval = evaluateMathExpression(draftBudgetExpr);
      if (!budgetEval.ok || budgetEval.value < 0) {
        setSettingsSavedMsg("กรุณากรอกงบตั้งต้นเป็นตัวเลขที่ถูกต้อง");
        return;
      }
      parsedBudget = budgetEval.value;
    }

    onUpdateProject({
      name: draftName.trim() || project.name,
      organizationName: draftOrgName.trim(),
      budgetLimit: parsedBudget,
    });
    setDraftBudgetExpr(parsedBudget > 0 ? String(parsedBudget) : "");
    setSettingsSavedMsg("บันทึกการตั้งค่ากิจกรรมแล้ว");
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
    if (!targetList.includes(trimmed)) {
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
    }
    if (kind === "expense") setNewExpCat("");
    else setNewIncCat("");
  }

  function handleDeleteCategory(kind: "expense" | "income", cat: string) {
    const targetList =
      kind === "expense"
        ? settings.expenseCategories
        : settings.incomeCategories;
    if (targetList.length <= 1) return;

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
    <div className="mx-auto max-w-[1380px] px-3 sm:px-5 py-4 space-y-4">
      {/* Top Action & Range Bar */}
      <div className="bg-white rounded-3xl border border-[#EDE6D8] p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-[#57534E] mr-1">
            ช่วงข้อมูล ({project.name}):
          </span>
          {(
            [
              { id: "all", label: "ทั้งหมด" },
              ...(currentMonth
                ? [{ id: "thisMonth" as const, label: `เดือนนี้ (${currentMonth})` }]
                : []),
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
            <div className="flex flex-wrap items-center gap-1.5">
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-6 space-y-4">
          {/* Clean Summary Card */}
          <div className="bg-white rounded-3xl border border-[#EDE6D8] p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-[#1C1917]">
                สรุปยอด ({project.name})
              </h2>
              <span className="text-xs text-[#78716C] tabular-nums">
                เช็กยอดแล้ว {analytics.verifiedCount}/{filteredEntries.length} บิล
              </span>
            </div>

            <div
              className={`grid grid-cols-1 ${
                project.budgetLimit > 0 ? "sm:grid-cols-3" : "sm:grid-cols-2"
              } gap-2.5`}
            >
              {project.budgetLimit > 0 && (
                <div className="rounded-2xl bg-[#FBF8F1] border border-[#EDE6D8] p-3">
                  <div className="text-[11px] text-[#78716C]">งบตั้งต้น</div>
                  <div className="text-base font-bold tabular-nums text-[#1C1917]">
                    ฿{formatBaht(project.budgetLimit)}
                  </div>
                </div>
              )}
              <div className="rounded-2xl bg-emerald-50/70 border border-emerald-200 p-3">
                <div className="text-[11px] text-emerald-700">รายรับรวม</div>
                <div className="text-base font-bold tabular-nums text-emerald-800">
                  +฿{formatBaht(analytics.totalIncome)}
                </div>
              </div>
              <div className="rounded-2xl bg-rose-50/70 border border-rose-200 p-3">
                <div className="text-[11px] text-rose-700">รายจ่ายรวม</div>
                <div className="text-base font-bold tabular-nums text-rose-800">
                  −฿{formatBaht(analytics.totalExpense)}
                </div>
              </div>
            </div>

            {project.budgetLimit > 0 && analytics.totalPool > 0 && (
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[#57534E]">
                    ใช้งบไปแล้ว (จากทั้งหมด ฿{formatBaht(analytics.totalPool)})
                  </span>
                  <span className="font-bold tabular-nums">
                    {analytics.spentPct}%
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-stone-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      analytics.netBalance < 0
                        ? "bg-rose-500"
                        : "bg-emerald-500"
                    }`}
                    style={{ width: `${analytics.spentPct}%` }}
                  />
                </div>
              </div>
            )}

            <div className="pt-2 border-t border-[#F4EFE6] flex items-center justify-between text-sm">
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

          {/* Category Breakdown */}
          <div className="bg-white rounded-3xl border border-[#EDE6D8] p-4 sm:p-5 space-y-3">
            <h2 className="text-base font-bold text-[#1C1917]">
              แยกตามหมวดหมู่
            </h2>
            {analytics.expCategories.length === 0 ? (
              <p className="text-xs text-[#78716C]">
                ยังไม่มีรายจ่ายในกิจกรรมนี้
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
                            ({stat.count})
                          </span>
                        </span>
                        <span className="font-bold tabular-nums">
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
              <div className="pt-3 border-t border-[#F4EFE6] space-y-1.5">
                <h3 className="text-xs font-bold text-emerald-800">
                  รายรับแยกหมวด
                </h3>
                {analytics.incCategories.map(([cat, stat]) => (
                  <div
                    key={cat}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-[#57534E]">
                      {cat} ({stat.count})
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
          {/* Pending Reimbursements (only loud if there are pending bills) */}
          {analytics.pendingPersons.length > 0 && (
            <div className="bg-white rounded-3xl border border-amber-300 p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-bold text-[#1C1917]">
                  ยอดสำรองจ่ายรอโอนคืน
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 tabular-nums">
                  ฿{formatBaht(analytics.pendingAmount)}
                </span>
              </div>
              <div className="space-y-2">
                {analytics.pendingPersons.map(([person, stat]) => (
                  <div
                    key={person}
                    className="flex items-center justify-between gap-2 rounded-2xl bg-amber-50/70 border border-amber-200 px-3.5 py-2.5"
                  >
                    <div>
                      <div className="text-sm font-bold text-[#1C1917]">
                        {person}
                      </div>
                      <div className="text-xs text-amber-800 tabular-nums">
                        {stat.count} บิล ·{" "}
                        <strong>฿{formatBaht(stat.amount)}</strong>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSettlePersonPending(person)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                    >
                      ✓ คืนเงินครบแล้ว
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Collapsible Project Settings & Categories */}
          <div className="bg-white rounded-3xl border border-[#EDE6D8] overflow-hidden">
            <button
              type="button"
              onClick={() => onToggleSettingsOpen(!settingsOpen)}
              className="w-full px-4 sm:px-5 py-3.5 flex items-center justify-between text-left hover:bg-stone-50/70 cursor-pointer"
            >
              <div>
                <div className="text-sm sm:text-base font-bold text-[#1C1917]">
                  ⚙️ ตั้งค่ากิจกรรม &amp; หมวดหมู่
                </div>
                <div className="text-xs text-[#78716C]">
                  แก้ชื่อกิจกรรม, งบตั้งต้น (ถ้ามี) และเพิ่ม/ลบหมวดหมู่
                </div>
              </div>
              <span className="text-xs font-bold text-stone-500">
                {settingsOpen ? "▲ ซ่อน" : "▼ เปิด"}
              </span>
            </button>

            {settingsOpen && (
              <div className="px-4 sm:px-5 pb-5 pt-3 border-t border-[#F4EFE6] space-y-5">
                <form onSubmit={handleSaveProjectSettings} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-semibold text-[#57534E] mb-1">
                        ชื่อกิจกรรม / แฟ้มงาน
                      </label>
                      <input
                        type="text"
                        value={draftName}
                        onChange={(e) => setDraftName(e.target.value)}
                        className="w-full rounded-xl border border-[#E7E0D2] bg-[#FFFDFA] px-3 py-2 text-xs text-[#1C1917]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#57534E] mb-1">
                        งบตั้งต้น (ปล่อยว่างถ้าไม่มี)
                      </label>
                      <input
                        type="text"
                        value={draftBudgetExpr}
                        onChange={(e) => setDraftBudgetExpr(e.target.value)}
                        placeholder="0 (ไม่มีงบตั้งต้น)"
                        className="w-full rounded-xl border border-[#E7E0D2] bg-[#FFFDFA] px-3 py-2 text-xs font-bold tabular-nums text-[#1C1917]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[#57534E] mb-1">
                      ฝ่าย / คำอธิบายใต้หัวรายงาน PDF (ไม่บังคับ)
                    </label>
                    <input
                      type="text"
                      value={draftOrgName}
                      onChange={(e) => setDraftOrgName(e.target.value)}
                      placeholder="เช่น ฝ่ายเหรัญญิก สโมสรนักศึกษา..."
                      className="w-full rounded-xl border border-[#E7E0D2] bg-[#FFFDFA] px-3 py-2 text-xs text-[#1C1917]"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="submit"
                      className="px-4 py-2 rounded-xl bg-[#1C1917] hover:bg-stone-800 text-white text-xs font-bold cursor-pointer"
                    >
                      บันทึกข้อมูลกิจกรรม
                    </button>
                    {projectsCount > 1 && (
                      <button
                        type="button"
                        onClick={onDeleteProject}
                        className="px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold cursor-pointer"
                      >
                        ลบกิจกรรมนี้
                      </button>
                    )}
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
                      placeholder="เพิ่มหมวดรายจ่าย..."
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
                      placeholder="เพิ่มหมวดรายรับ..."
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
                    🗑️ ล้างรายการทั้งหมดในกิจกรรมนี้
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* JSON Backup */}
          <div className="bg-white rounded-3xl border border-[#EDE6D8] p-4 sm:p-5 space-y-2.5">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-[#1C1917]">
                💾 สำรองข้อมูล / ย้ายเครื่อง (JSON)
              </h2>
              <p className="text-xs text-[#78716C]">
                บันทึกข้อมูลทุกกิจกรรมและหมวดหมู่เก็บไว้เป็นไฟล์สำรองได้
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleDownloadJson}
                className="px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold cursor-pointer"
              >
                ดาวน์โหลด JSON
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold cursor-pointer"
              >
                นำเข้า JSON
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
            {backupFeedback && (
              <div className="text-xs font-semibold text-emerald-700">
                ✓ {backupFeedback}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Clear Project Confirmation Modal */}
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
              ล้างรายการทั้งหมดใน &ldquo;{project.name}&rdquo; ({entries.length}{" "}
              รายการ)?
            </h3>
            <p className="text-xs text-[#57534E]">
              รายการและรูปใบเสร็จในกิจกรรมนี้จะถูกลบออกทั้งหมด (กิจกรรมอื่น ๆ จะยังอยู่ครบ)
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
                  onClearProjectEntries();
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
