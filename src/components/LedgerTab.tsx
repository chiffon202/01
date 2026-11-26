"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  CHANNEL_LABELS,
  EntryType,
  LedgerEntry,
  LedgerSettings,
  NewLedgerEntryInput,
  PaymentChannel,
  ReimburseStatus,
  UpdateLedgerEntryPatch,
  formatBaht,
  formatThaiDateLabel,
  getThailandDateKey,
  roundCurrency,
} from "@/lib/storage";
import { evaluateMathExpression } from "@/lib/mathEval";

interface LedgerTabProps {
  todayKey: string;
  entries: LedgerEntry[];
  settings: LedgerSettings;
  onAddEntry: (input: NewLedgerEntryInput) => void;
  onUpdateEntry: (id: string, patch: UpdateLedgerEntryPatch) => void;
  onToggleReimburse: (id: string) => void;
  onDeleteEntry: (id: string) => void;
  onGoToCategories: () => void;
}

type TypeFilter = "all" | "expense" | "income" | "pending";

const MATH_KEYS = [
  { label: "+", insert: "+" },
  { label: "−", insert: "-" },
  { label: "×", insert: "*" },
  { label: "÷", insert: "/" },
  { label: "(", insert: "(" },
  { label: ")", insert: ")" },
];

export function LedgerTab({
  todayKey,
  entries,
  settings,
  onAddEntry,
  onUpdateEntry,
  onToggleReimburse,
  onDeleteEntry,
  onGoToCategories,
}: LedgerTabProps) {
  const formRef = useRef<HTMLDivElement | null>(null);
  const amountInputRef = useRef<HTMLInputElement | null>(null);

  const effectiveToday = todayKey;

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState<EntryType>("expense");
  const [title, setTitle] = useState("");
  const [amountExpr, setAmountExpr] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>(
    settings.expenseCategories[0] ?? "ค่าวัสดุ/อุปกรณ์"
  );
  const [channel, setChannel] = useState<PaymentChannel>("make");
  const [receiptRef, setReceiptRef] = useState("");
  const [personName, setPersonName] = useState("");
  const [reimburseStatus, setReimburseStatus] =
    useState<ReimburseStatus>("settled");
  const [note, setNote] = useState("");
  const [dateKey, setDateKey] = useState<string>("");
  const [formError, setFormError] = useState<string>("");
  const [toastMsg, setToastMsg] = useState<string>("");

  // Filter / Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
  const [dateFilter, setDateFilter] = useState<string>("ALL"); // "ALL" | "TODAY" | YYYY-MM
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const categoriesForCurrentType =
    type === "expense"
      ? settings.expenseCategories
      : settings.incomeCategories;

  const activeCategory = categoriesForCurrentType.includes(selectedCategory)
    ? selectedCategory
    : categoriesForCurrentType[0] ?? "";

  const activeDateKey = dateKey || effectiveToday;

  // Live math evaluation
  const mathEval = useMemo(
    () => evaluateMathExpression(amountExpr),
    [amountExpr]
  );

  // Frequent person names from history
  const frequentPeople = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      const p = e.personName.trim();
      if (!p) continue;
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name]) => name);
  }, [entries]);

  // Available months for date filter dropdown
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    for (const e of entries) {
      if (e.dateKey && e.dateKey.length >= 7) {
        months.add(e.dateKey.slice(0, 7));
      }
    }
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [entries]);

  // All-time KPI summary
  const summary = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    let pendingAmount = 0;
    let pendingCount = 0;

    for (const e of entries) {
      if (e.type === "income") totalIncome += e.amount;
      else totalExpense += e.amount;
      if (e.reimburseStatus === "pending") {
        pendingAmount += e.amount;
        pendingCount += 1;
      }
    }

    const totalPool = roundCurrency(settings.startingBudget + totalIncome);
    const netBalance = roundCurrency(totalPool - totalExpense);
    return {
      totalIncome: roundCurrency(totalIncome),
      totalExpense: roundCurrency(totalExpense),
      totalPool,
      netBalance,
      pendingAmount: roundCurrency(pendingAmount),
      pendingCount,
    };
  }, [entries, settings.startingBudget]);

  // Filtered list + filtered subtotal
  const { filteredEntries, filteredIncome, filteredExpense } = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const sorted = [...entries].sort((a, b) => {
      const dateCmp = b.dateKey.localeCompare(a.dateKey);
      if (dateCmp !== 0) return dateCmp;
      return b.createdAt.localeCompare(a.createdAt);
    });

    const list: LedgerEntry[] = [];
    let fInc = 0;
    let fExp = 0;

    for (const e of sorted) {
      if (typeFilter === "expense" && e.type !== "expense") continue;
      if (typeFilter === "income" && e.type !== "income") continue;
      if (typeFilter === "pending" && e.reimburseStatus !== "pending") continue;
      if (categoryFilter !== "ALL" && e.category !== categoryFilter) continue;

      if (dateFilter === "TODAY" && e.dateKey !== effectiveToday) continue;
      if (
        dateFilter !== "ALL" &&
        dateFilter !== "TODAY" &&
        !e.dateKey.startsWith(dateFilter)
      ) {
        continue;
      }

      if (q) {
        const haystack = [
          e.title,
          e.category,
          e.receiptRef,
          e.personName,
          e.note,
          e.formula ?? "",
          CHANNEL_LABELS[e.channel],
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) continue;
      }

      list.push(e);
      if (e.type === "income") fInc += e.amount;
      else fExp += e.amount;
    }

    return {
      filteredEntries: list,
      filteredIncome: roundCurrency(fInc),
      filteredExpense: roundCurrency(fExp),
    };
  }, [
    entries,
    searchQuery,
    typeFilter,
    categoryFilter,
    dateFilter,
    effectiveToday,
  ]);

  const allCategoryOptions = useMemo(() => {
    const set = new Set<string>([
      ...settings.expenseCategories,
      ...settings.incomeCategories,
      ...entries.map((e) => e.category),
    ]);
    return Array.from(set);
  }, [settings.expenseCategories, settings.incomeCategories, entries]);

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? "" : prev));
    }, 2600);
  }

  function handleSwitchType(nextType: EntryType) {
    setType(nextType);
    const list =
      nextType === "expense"
        ? settings.expenseCategories
        : settings.incomeCategories;
    setSelectedCategory(list[0] ?? "");
    if (nextType === "income") {
      setReimburseStatus("settled");
    }
  }

  function appendMathToken(token: string) {
    setAmountExpr((prev) => `${prev}${token}`);
    amountInputRef.current?.focus();
  }

  function handleApplyEvaluated() {
    if (!mathEval.ok) {
      setFormError(mathEval.error);
      return;
    }
    setAmountExpr(String(mathEval.value));
    setFormError("");
    amountInputRef.current?.focus();
  }

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setAmountExpr("");
    setReceiptRef("");
    setPersonName("");
    setReimburseStatus("settled");
    setNote("");
    setDateKey("");
    setFormError("");
  }

  function handleStartEdit(entry: LedgerEntry) {
    setEditingId(entry.id);
    setType(entry.type);
    setTitle(entry.title);
    setAmountExpr(entry.formula ? entry.formula : String(entry.amount));
    setSelectedCategory(entry.category);
    setChannel(entry.channel);
    setReceiptRef(entry.receiptRef);
    setPersonName(entry.personName);
    setReimburseStatus(entry.reimburseStatus);
    setNote(entry.note);
    setDateKey(entry.dateKey);
    setFormError("");
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError("กรุณาระบุชื่อรายการหรือรายละเอียดบิล");
      return;
    }

    if (!mathEval.ok) {
      setFormError(mathEval.error);
      return;
    }

    if (mathEval.value <= 0) {
      setFormError("จำนวนเงินต้องมากกว่า 0 บาท");
      return;
    }

    const formulaToStore = mathEval.isFormula
      ? mathEval.normalizedExpr
      : undefined;

    if (editingId) {
      onUpdateEntry(editingId, {
        type,
        title: trimmedTitle,
        amount: mathEval.value,
        formula: formulaToStore,
        category: activeCategory || "อื่น ๆ",
        channel,
        receiptRef,
        personName,
        reimburseStatus,
        note,
        dateKey: activeDateKey || getThailandDateKey(),
      });
      showToast(`อัปเดต "${trimmedTitle}" (฿${formatBaht(mathEval.value)}) แล้ว`);
      resetForm();
    } else {
      onAddEntry({
        type,
        title: trimmedTitle,
        amount: mathEval.value,
        formula: formulaToStore,
        category: activeCategory || "อื่น ๆ",
        channel,
        receiptRef,
        personName,
        reimburseStatus,
        note,
        dateKey: activeDateKey || getThailandDateKey(),
      });
      showToast(
        `บันทึก "${trimmedTitle}" (${type === "income" ? "+" : "-"}฿${formatBaht(
          mathEval.value
        )}) เรียบร้อย`
      );
      resetForm();
    }
  }

  return (
    <div className="mx-auto max-w-[1440px] px-3 sm:px-5 py-4">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* ============================================================ */}
        {/* LEFT COLUMN (42%): Quick Add / Edit Bill Form + Calculator   */}
        {/* ============================================================ */}
        <div
          ref={formRef}
          className="lg:col-span-5 bg-white rounded-3xl border border-[#EDE6D8] shadow-sm p-4 sm:p-5 lg:sticky lg:top-[76px]"
        >
          <div className="flex items-center justify-between gap-2 mb-3.5">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#1C1917]">
                {editingId ? "แก้ไขรายการบิล" : "จดบิล / บันทึกบัญชี"}
              </h2>
              <p className="text-xs text-[#78716C]">
                พิมพ์บวก-ลบเลขในช่องจำนวนเงินได้ทันที เช่น{" "}
                <span className="font-mono text-[#57534E]">120+45*2</span>
              </p>
            </div>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-stone-100 hover:bg-stone-200 text-stone-700 cursor-pointer"
              >
                ยกเลิกแก้ไข
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Type Switcher */}
            <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-[#FBF8F1] border border-[#EDE6D8]">
              <button
                type="button"
                onClick={() => handleSwitchType("expense")}
                className={`py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                  type === "expense"
                    ? "bg-[#EA580C] text-white shadow-sm"
                    : "text-[#78716C] hover:text-[#1C1917]"
                }`}
              >
                − รายจ่าย
              </button>
              <button
                type="button"
                onClick={() => handleSwitchType("income")}
                className={`py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                  type === "income"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-[#78716C] hover:text-[#1C1917]"
                }`}
              >
                + รายรับ
              </button>
            </div>

            {/* Title */}
            <div>
              <label
                htmlFor="tx-title"
                className="block text-xs font-semibold text-[#57534E] mb-1"
              >
                ชื่อรายการ / รายละเอียดบิล <span className="text-rose-500">*</span>
              </label>
              <input
                id="tx-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  type === "expense"
                    ? "เช่น ค่าอุปกรณ์ตกแต่ง, ค่าข้าวทีมงาน, ค่ารถ"
                    : "เช่น เงินงบโครงการ, ค่าสมทบทีม, รายรับกิจกรรม"
                }
                className="w-full rounded-2xl border border-[#E7E0D2] bg-[#FFFDFA] px-3.5 py-2.5 text-sm text-[#1C1917] placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            {/* Amount + Live Math Expression Evaluator */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="tx-amount"
                  className="text-xs font-semibold text-[#57534E]"
                >
                  จำนวนเงิน (บาท) <span className="text-rose-500">*</span>
                </label>
                {amountExpr.trim() && mathEval.ok && (
                  <button
                    type="button"
                    onClick={handleApplyEvaluated}
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 tabular-nums cursor-pointer"
                    title="กดเพื่อแทนที่สูตรด้วยผลลัพธ์"
                  >
                    = ฿{formatBaht(mathEval.value)}
                    {mathEval.isFormula && (
                      <span className="text-[10px] font-medium opacity-75">
                        (กดแทนค่า)
                      </span>
                    )}
                  </button>
                )}
                {amountExpr.trim() && !mathEval.ok && (
                  <span className="text-[11px] font-medium text-amber-700">
                    {mathEval.error}
                  </span>
                )}
              </div>

              <div className="relative">
                <input
                  ref={amountInputRef}
                  id="tx-amount"
                  type="text"
                  value={amountExpr}
                  onChange={(e) => setAmountExpr(e.target.value)}
                  placeholder="พิมพ์ตัวเลข หรือสูตร เช่น 120+45*2"
                  className="w-full rounded-2xl border border-[#E7E0D2] bg-[#FFFDFA] px-3.5 py-2.5 pr-16 text-base font-bold text-[#1C1917] tabular-nums placeholder:text-sm placeholder:font-normal placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <button
                  type="button"
                  onClick={handleApplyEvaluated}
                  disabled={!amountExpr.trim()}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 disabled:opacity-40 text-amber-900 font-bold text-xs cursor-pointer"
                >
                  = คำนวณ
                </button>
              </div>

              {/* Tactile Quick Calculator Strip for iPad/Mobile */}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {MATH_KEYS.map((k) => (
                  <button
                    key={k.label}
                    type="button"
                    onClick={() => appendMathToken(k.insert)}
                    className="min-w-[38px] h-8 px-2.5 rounded-xl bg-[#FBF8F1] hover:bg-amber-100 active:scale-95 border border-[#EDE6D8] text-sm font-bold text-[#44403C] cursor-pointer"
                  >
                    {k.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setAmountExpr((prev) => prev.slice(0, Math.max(0, prev.length - 1)))
                  }
                  className="h-8 px-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-xs font-semibold text-stone-700 cursor-pointer"
                >
                  ⌫ ลบ
                </button>
                <button
                  type="button"
                  onClick={() => setAmountExpr("")}
                  className="h-8 px-2.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-xs font-semibold text-stone-600 cursor-pointer"
                >
                  C
                </button>
              </div>
            </div>

            {/* Category Pills */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-[#57534E]">
                  หมวดหมู่
                </span>
                <button
                  type="button"
                  onClick={onGoToCategories}
                  className="text-[11px] font-semibold text-amber-700 hover:underline cursor-pointer"
                >
                  + จัดการหมวดหมู่
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {categoriesForCurrentType.map((cat) => {
                  const active = activeCategory === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                        active
                          ? type === "expense"
                            ? "bg-orange-100 border-orange-400 text-orange-950"
                            : "bg-emerald-100 border-emerald-400 text-emerald-950"
                          : "bg-[#FFFDFA] border-[#EDE6D8] text-[#57534E] hover:bg-stone-50"
                      }`}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Receipt Ref & Person Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label
                  htmlFor="tx-ref"
                  className="block text-xs font-semibold text-[#57534E] mb-1"
                >
                  เลขที่บิล / อ้างอิง
                </label>
                <input
                  id="tx-ref"
                  type="text"
                  value={receiptRef}
                  onChange={(e) => setReceiptRef(e.target.value)}
                  placeholder="เช่น INV-001, สลิป #14:20"
                  className="w-full rounded-xl border border-[#E7E0D2] bg-[#FFFDFA] px-3 py-2 text-xs text-[#1C1917] placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div>
                <label
                  htmlFor="tx-person"
                  className="block text-xs font-semibold text-[#57534E] mb-1"
                >
                  ชื่อคนเบิก / ผู้จ่าย
                </label>
                <input
                  id="tx-person"
                  type="text"
                  value={personName}
                  onChange={(e) => setPersonName(e.target.value)}
                  placeholder="เช่น มิ้น, ก้อง, ร้านค้า..."
                  className="w-full rounded-xl border border-[#E7E0D2] bg-[#FFFDFA] px-3 py-2 text-xs text-[#1C1917] placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            </div>

            {/* Frequent Person Chips */}
            {frequentPeople.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 -mt-1">
                <span className="text-[11px] text-[#78716C]">ใช้บ่อย:</span>
                {frequentPeople.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setPersonName(name)}
                    className={`px-2 py-0.5 rounded-lg text-[11px] font-medium border cursor-pointer ${
                      personName === name
                        ? "bg-amber-100 border-amber-300 text-amber-900"
                        : "bg-stone-50 border-stone-200 text-stone-600 hover:bg-stone-100"
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}

            {/* Date & Channel */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label
                  htmlFor="tx-date"
                  className="block text-xs font-semibold text-[#57534E] mb-1"
                >
                  วันที่บิล
                </label>
                <input
                  id="tx-date"
                  type="date"
                  value={activeDateKey}
                  onChange={(e) => setDateKey(e.target.value)}
                  className="w-full rounded-xl border border-[#E7E0D2] bg-[#FFFDFA] px-3 py-2 text-xs text-[#1C1917] tabular-nums focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div>
                <label
                  htmlFor="tx-channel"
                  className="block text-xs font-semibold text-[#57534E] mb-1"
                >
                  ช่องทางเงิน
                </label>
                <select
                  id="tx-channel"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as PaymentChannel)}
                  className="w-full rounded-xl border border-[#E7E0D2] bg-[#FFFDFA] px-3 py-2 text-xs font-medium text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <option value="make">📲 โอน (MAKE)</option>
                  <option value="cash">💵 เงินสด</option>
                  <option value="bank">🏦 บัญชีธนาคาร</option>
                  <option value="other">📌 อื่น ๆ</option>
                </select>
              </div>
            </div>

            {/* Reimbursement Status */}
            {type === "expense" && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setReimburseStatus("settled")}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                    reimburseStatus === "settled"
                      ? "bg-emerald-50 border-emerald-400 text-emerald-900"
                      : "bg-[#FFFDFA] border-[#EDE6D8] text-stone-600"
                  }`}
                >
                  ✓ จ่ายจากกองกลางแล้ว
                </button>
                <button
                  type="button"
                  onClick={() => setReimburseStatus("pending")}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-semibold transition-colors cursor-pointer ${
                    reimburseStatus === "pending"
                      ? "bg-amber-100 border-amber-400 text-amber-950"
                      : "bg-[#FFFDFA] border-[#EDE6D8] text-stone-600"
                  }`}
                >
                  ⏳ สำรองจ่าย (รอคืนเงิน)
                </button>
              </div>
            )}

            {/* Note */}
            <div>
              <label
                htmlFor="tx-note"
                className="block text-xs font-semibold text-[#57534E] mb-1"
              >
                โน้ตช่วยจำ
              </label>
              <input
                id="tx-note"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="เช่น ซื้อเพิ่มรอบ 2 / รอส่งสลิปในไลน์กลุ่ม"
                className="w-full rounded-xl border border-[#E7E0D2] bg-[#FFFDFA] px-3 py-2 text-xs text-[#1C1917] placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            {formError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700">
                {formError}
              </div>
            )}

            {toastMsg && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-800">
                ✓ {toastMsg}
              </div>
            )}

            <button
              type="submit"
              className={`w-full py-3 rounded-2xl text-sm font-bold text-white shadow-sm transition-transform active:scale-[0.99] cursor-pointer ${
                type === "expense"
                  ? "bg-[#EA580C] hover:bg-[#C2410C]"
                  : "bg-emerald-600 hover:bg-emerald-700"
              }`}
            >
              {editingId
                ? "บันทึกการแก้ไขบิล"
                : mathEval.ok && mathEval.value > 0
                ? `บันทึก${type === "expense" ? "รายจ่าย" : "รายรับ"} (฿${formatBaht(
                    mathEval.value
                  )})`
                : `บันทึก${type === "expense" ? "รายจ่าย" : "รายรับ"}`}
            </button>
          </form>
        </div>

        {/* ============================================================ */}
        {/* RIGHT COLUMN (58%): KPI Cards + Search + Bill Ledger List    */}
        {/* ============================================================ */}
        <div className="lg:col-span-7 space-y-3.5">
          {/* 4 Summary KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-white rounded-2xl border border-[#EDE6D8] p-3 shadow-xs">
              <div className="text-[11px] font-semibold text-[#78716C]">
                งบตั้งต้น + รายรับ
              </div>
              <div className="text-base sm:text-lg font-bold text-emerald-700 tabular-nums mt-0.5">
                ฿{formatBaht(summary.totalPool)}
              </div>
              <div className="text-[10.5px] text-[#A8A29E] tabular-nums">
                งบ {formatBaht(settings.startingBudget)} + รับ{" "}
                {formatBaht(summary.totalIncome)}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#EDE6D8] p-3 shadow-xs">
              <div className="text-[11px] font-semibold text-[#78716C]">
                รายจ่ายรวม
              </div>
              <div className="text-base sm:text-lg font-bold text-rose-700 tabular-nums mt-0.5">
                ฿{formatBaht(summary.totalExpense)}
              </div>
              <div className="text-[10.5px] text-[#A8A29E] tabular-nums">
                ทั้งหมด {entries.filter((e) => e.type === "expense").length} บิล
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#EDE6D8] p-3 shadow-xs">
              <div className="text-[11px] font-semibold text-[#78716C]">
                คงเหลือสุทธิ
              </div>
              <div
                className={`text-base sm:text-lg font-bold tabular-nums mt-0.5 ${
                  summary.netBalance < 0 ? "text-rose-700" : "text-[#1C1917]"
                }`}
              >
                {summary.netBalance < 0 ? "-" : ""}฿
                {formatBaht(Math.abs(summary.netBalance))}
              </div>
              <div className="text-[10.5px] text-[#A8A29E]">
                {summary.netBalance >= 0 ? "อยู่ในงบ" : "เกินงบ"}
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                setTypeFilter((prev) => (prev === "pending" ? "all" : "pending"))
              }
              className={`text-left rounded-2xl border p-3 shadow-xs transition-colors cursor-pointer ${
                typeFilter === "pending"
                  ? "bg-amber-100 border-amber-400"
                  : summary.pendingCount > 0
                  ? "bg-amber-50/70 border-amber-300 hover:bg-amber-100/70"
                  : "bg-white border-[#EDE6D8] hover:bg-stone-50"
              }`}
            >
              <div className="text-[11px] font-semibold text-amber-900">
                รอโอนคืน {typeFilter === "pending" ? "(กำลังกรอง)" : ""}
              </div>
              <div className="text-base sm:text-lg font-bold text-amber-800 tabular-nums mt-0.5">
                ฿{formatBaht(summary.pendingAmount)}
              </div>
              <div className="text-[10.5px] text-amber-700 tabular-nums">
                {summary.pendingCount > 0
                  ? `${summary.pendingCount} บิล · กดเพื่อดู`
                  : "ไม่มีบิลค้างคืน"}
              </div>
            </button>
          </div>

          {/* Search & Filter Bar */}
          <div className="bg-white rounded-3xl border border-[#EDE6D8] p-3.5 sm:p-4 shadow-xs space-y-2.5">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ค้นหาบิล: ชื่อรายการ, เลขที่บิล, ชื่อคนเบิก, โน้ต..."
                  className="w-full rounded-2xl border border-[#E7E0D2] bg-[#FBF8F1] px-3.5 py-2 text-xs sm:text-sm text-[#1C1917] placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>

              <div className="flex gap-2">
                <select
                  aria-label="กรองตามหมวดหมู่"
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="rounded-xl border border-[#E7E0D2] bg-[#FBF8F1] px-2.5 py-2 text-xs font-medium text-[#1C1917]"
                >
                  <option value="ALL">ทุกหมวดหมู่</option>
                  {allCategoryOptions.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="กรองตามช่วงเวลา"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="rounded-xl border border-[#E7E0D2] bg-[#FBF8F1] px-2.5 py-2 text-xs font-medium text-[#1C1917]"
                >
                  <option value="ALL">ทุกวัน</option>
                  <option value="TODAY">วันนี้</option>
                  {availableMonths.map((ym) => (
                    <option key={ym} value={ym}>
                      เดือน {ym}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: "all", label: "ทั้งหมด" },
                    { id: "expense", label: "รายจ่าย" },
                    { id: "income", label: "รายรับ" },
                    { id: "pending", label: `รอคืนเงิน (${summary.pendingCount})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setTypeFilter(tab.id)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                      typeFilter === tab.id
                        ? "bg-[#1C1917] border-[#1C1917] text-white"
                        : "bg-[#FFFDFA] border-[#EDE6D8] text-[#57534E] hover:bg-stone-50"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="text-xs text-[#78716C] tabular-nums">
                แสดง{" "}
                <span className="font-bold text-[#1C1917]">
                  {filteredEntries.length}
                </span>{" "}
                รายการ · รับ{" "}
                <span className="font-semibold text-emerald-700">
                  +฿{formatBaht(filteredIncome)}
                </span>{" "}
                / จ่าย{" "}
                <span className="font-semibold text-rose-700">
                  -฿{formatBaht(filteredExpense)}
                </span>
              </div>
            </div>
          </div>

          {/* Ledger Entries List */}
          {filteredEntries.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-[#DFD5C3] p-8 text-center">
              <p className="text-sm font-semibold text-[#57534E]">
                {entries.length === 0
                  ? "ยังไม่มีรายการบิลในสมุดบัญชี"
                  : "ไม่พบรายการบิลที่ตรงกับตัวกรอง"}
              </p>
              <p className="text-xs text-[#78716C] mt-1">
                {entries.length === 0
                  ? "เริ่มจดบิลแรกทางฝั่งซ้ายได้เลย รองรับพิมพ์บวก-ลบเลขในช่องจำนวนเงินทันที"
                  : "ลองล้างคำค้นหาหรือเปลี่ยนตัวกรองด้านบน"}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredEntries.map((entry) => {
                const isPending = entry.reimburseStatus === "pending";
                const isEditingThis = editingId === entry.id;
                return (
                  <div
                    key={entry.id}
                    className={`bg-white rounded-2xl border p-3.5 shadow-xs transition-colors ${
                      isEditingThis
                        ? "border-amber-500 ring-2 ring-amber-200"
                        : isPending
                        ? "border-amber-300 bg-amber-50/25"
                        : "border-[#EDE6D8]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-bold ${
                              entry.type === "income"
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {entry.type === "income" ? "+ รายรับ" : "− รายจ่าย"}
                          </span>
                          <span className="text-xs font-medium text-[#78716C] tabular-nums">
                            {formatThaiDateLabel(entry.dateKey)}
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-stone-100 text-stone-700 text-[11px] font-semibold">
                            {entry.category}
                          </span>
                          {isPending && (
                            <span className="px-2 py-0.5 rounded-lg bg-amber-200/80 text-amber-950 text-[11px] font-bold">
                              ⏳ สำรองจ่าย · รอคืน
                            </span>
                          )}
                        </div>

                        <h3 className="text-sm sm:text-base font-bold text-[#1C1917] mt-1 break-words">
                          {entry.title}
                        </h3>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-[#57534E]">
                          <span>{CHANNEL_LABELS[entry.channel]}</span>
                          {entry.receiptRef && (
                            <span className="font-mono bg-[#FBF8F1] border border-[#EDE6D8] px-1.5 py-0.5 rounded-md text-[11px]">
                              บิล: {entry.receiptRef}
                            </span>
                          )}
                          {entry.personName && (
                            <span>
                              ผู้เบิก/ผู้จ่าย:{" "}
                              <strong className="text-[#1C1917]">
                                {entry.personName}
                              </strong>
                            </span>
                          )}
                          {entry.formula && (
                            <span className="font-mono text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md">
                              สูตร: {entry.formula}
                            </span>
                          )}
                        </div>

                        {entry.note && (
                          <p className="text-xs text-[#78716C] mt-1">
                            หมายเหตุ: {entry.note}
                          </p>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <div
                          className={`text-base sm:text-lg font-bold tabular-nums ${
                            entry.type === "income"
                              ? "text-emerald-700"
                              : "text-rose-700"
                          }`}
                        >
                          {entry.type === "income" ? "+" : "-"}฿
                          {formatBaht(entry.amount)}
                        </div>
                      </div>
                    </div>

                    {/* Action Row */}
                    <div className="flex flex-wrap items-center justify-end gap-1.5 mt-2.5 pt-2 border-t border-[#F4EFE6]">
                      {entry.type === "expense" && (
                        <button
                          type="button"
                          onClick={() => onToggleReimburse(entry.id)}
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-semibold border cursor-pointer ${
                            isPending
                              ? "bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700"
                              : "bg-stone-50 border-stone-200 text-stone-600 hover:bg-amber-50 hover:text-amber-900"
                          }`}
                        >
                          {isPending ? "✓ กดคืนเงินแล้ว" : "ตั้งเป็นรอคืนเงิน"}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleStartEdit(entry)}
                        className="px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-stone-100 hover:bg-stone-200 text-stone-700 cursor-pointer"
                      >
                        แก้ไข
                      </button>

                      {confirmDeleteId === entry.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              onDeleteEntry(entry.id);
                              if (editingId === entry.id) resetForm();
                              setConfirmDeleteId(null);
                            }}
                            className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-rose-600 text-white hover:bg-rose-700 cursor-pointer"
                          >
                            ยืนยันลบ
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1 rounded-xl text-[11px] font-semibold bg-stone-100 text-stone-600 cursor-pointer"
                          >
                            ยกเลิก
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(entry.id)}
                          className="px-2.5 py-1 rounded-xl text-[11px] font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer"
                        >
                          ลบ
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
