"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  ActivityProject,
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
import {
  compressReceiptImage,
  generateImageId,
  saveReceiptImage,
  getReceiptImage,
} from "@/lib/imageStore";

interface LedgerTabProps {
  todayKey: string;
  project: ActivityProject;
  entries: LedgerEntry[];
  settings: LedgerSettings;
  onAddEntry: (input: NewLedgerEntryInput) => void;
  onUpdateEntry: (id: string, patch: UpdateLedgerEntryPatch) => void;
  onToggleVerified: (id: string) => void;
  onToggleReimburse: (id: string) => void;
  onDeleteEntry: (id: string) => void;
  onOpenImageLightbox: (entry: LedgerEntry) => void;
  onGoToSettings: () => void;
}

type QuickFilter = "all" | "expense" | "income" | "unverified" | "pending";

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
  project,
  entries,
  settings,
  onAddEntry,
  onUpdateEntry,
  onToggleVerified,
  onToggleReimburse,
  onDeleteEntry,
  onOpenImageLightbox,
  onGoToSettings,
}: LedgerTabProps) {
  const formRef = useRef<HTMLDivElement | null>(null);
  const amountInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState<EntryType>("expense");
  const [title, setTitle] = useState("");
  const [amountExpr, setAmountExpr] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>(
    settings.expenseCategories[0] ?? "ค่าวัสดุ/อุปกรณ์"
  );
  const [showMoreFields, setShowMoreFields] = useState(false);
  const [channel, setChannel] = useState<PaymentChannel>("make");
  const [receiptRef, setReceiptRef] = useState("");
  const [personName, setPersonName] = useState("");
  const [reimburseStatus, setReimburseStatus] =
    useState<ReimburseStatus>("settled");
  const [note, setNote] = useState("");
  const [dateKey, setDateKey] = useState<string>("");

  // Attached receipt image draft
  const [draftImageDataUrl, setDraftImageDataUrl] = useState<string | null>(
    null
  );
  const [draftExistingImageId, setDraftExistingImageId] = useState<
    string | undefined
  >(undefined);
  const [imageProcessing, setImageProcessing] = useState(false);

  const [formError, setFormError] = useState<string>("");
  const [toastMsg, setToastMsg] = useState<string>("");

  // Filter / Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const categoriesForCurrentType =
    type === "expense"
      ? settings.expenseCategories
      : settings.incomeCategories;

  const activeCategory = categoriesForCurrentType.includes(selectedCategory)
    ? selectedCategory
    : categoriesForCurrentType[0] ?? "";

  const activeDateKey = dateKey || todayKey;

  const mathEval = useMemo(
    () => evaluateMathExpression(amountExpr),
    [amountExpr]
  );

  const frequentPeople = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      const p = e.personName.trim();
      if (!p) continue;
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);
  }, [entries]);

  const summary = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    let unverifiedCount = 0;
    let pendingCount = 0;

    for (const e of entries) {
      if (e.type === "income") totalIncome += e.amount;
      else totalExpense += e.amount;
      if (!e.verified) unverifiedCount += 1;
      if (e.reimburseStatus === "pending") pendingCount += 1;
    }

    const netBalance = roundCurrency(
      project.budgetLimit + totalIncome - totalExpense
    );
    return {
      totalIncome: roundCurrency(totalIncome),
      totalExpense: roundCurrency(totalExpense),
      netBalance,
      unverifiedCount,
      pendingCount,
    };
  }, [entries, project.budgetLimit]);

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
      if (quickFilter === "expense" && e.type !== "expense") continue;
      if (quickFilter === "income" && e.type !== "income") continue;
      if (quickFilter === "unverified" && e.verified) continue;
      if (quickFilter === "pending" && e.reimburseStatus !== "pending")
        continue;

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
  }, [entries, searchQuery, quickFilter]);

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? "" : prev));
    }, 2400);
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

  async function processImageFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setFormError("กรุณาเลือกไฟล์รูปภาพ (JPG, PNG, HEIC)");
      return;
    }
    setImageProcessing(true);
    setFormError("");
    try {
      const compressed = await compressReceiptImage(file);
      setDraftImageDataUrl(compressed);
      setDraftExistingImageId(undefined);
    } catch {
      setFormError("ไม่สามารถประมวลผลรูปภาพได้");
    } finally {
      setImageProcessing(false);
    }
  }

  async function handleImageInputChange(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    if (file) await processImageFile(file);
    e.target.value = "";
  }

  function handleFormPaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          void processImageFile(file);
          return;
        }
      }
    }
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
    setDraftImageDataUrl(null);
    setDraftExistingImageId(undefined);
    setFormError("");
  }

  async function handleStartEdit(entry: LedgerEntry) {
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

    if (
      entry.receiptRef ||
      entry.personName ||
      entry.note ||
      entry.reimburseStatus === "pending"
    ) {
      setShowMoreFields(true);
    }

    if (entry.imageId) {
      setDraftExistingImageId(entry.imageId);
      const dataUrl = await getReceiptImage(entry.imageId);
      setDraftImageDataUrl(dataUrl);
    } else {
      setDraftExistingImageId(undefined);
      setDraftImageDataUrl(null);
    }

    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError("กรุณากรอกชื่อรายการ");
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

    let finalImageId: string | undefined = draftExistingImageId;
    if (draftImageDataUrl && !draftExistingImageId) {
      const newImgId = generateImageId();
      try {
        await saveReceiptImage(newImgId, draftImageDataUrl);
        finalImageId = newImgId;
      } catch {
        setFormError("ไม่สามารถบันทึกรูปภาพลงเครื่องได้ (ลองอีกครั้ง)");
        return;
      }
    } else if (!draftImageDataUrl) {
      finalImageId = "";
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
        imageId: finalImageId,
        note,
        dateKey: activeDateKey || getThailandDateKey(),
      });
      showToast(`อัปเดต "${trimmedTitle}" (฿${formatBaht(mathEval.value)})`);
      resetForm();
    } else {
      onAddEntry({
        projectId: project.id,
        type,
        title: trimmedTitle,
        amount: mathEval.value,
        formula: formulaToStore,
        category: activeCategory || "อื่น ๆ",
        channel,
        receiptRef,
        personName,
        reimburseStatus,
        verified: false,
        imageId: finalImageId || undefined,
        note,
        dateKey: activeDateKey || getThailandDateKey(),
      });
      showToast(
        `บันทึก "${trimmedTitle}" (${type === "income" ? "+" : "-"}฿${formatBaht(
          mathEval.value
        )})`
      );
      resetForm();
    }
  }

  return (
    <div className="mx-auto max-w-[1380px] px-3 sm:px-5 py-4">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* ============================================================ */}
        {/* LEFT COLUMN (42%): Clean Smart Calculator + Bill Entry       */}
        {/* ============================================================ */}
        <div
          ref={formRef}
          onPaste={handleFormPaste}
          className="lg:col-span-5 bg-white rounded-3xl border border-[#EDE6D8] shadow-xs p-4 sm:p-5 lg:sticky lg:top-[76px]"
        >
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-base font-bold text-[#1C1917]">
              {editingId ? "แก้ไขรายการ" : "คิดยอด & จดรายการ"}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-stone-100 hover:bg-stone-200 text-stone-700 cursor-pointer"
              >
                ยกเลิก
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {/* Income / Expense Toggle */}
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-[#FBF8F1] border border-[#EDE6D8]">
              <button
                type="button"
                onClick={() => handleSwitchType("expense")}
                className={`py-2 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                  type === "expense"
                    ? "bg-[#EA580C] text-white shadow-xs"
                    : "text-[#78716C] hover:text-[#1C1917]"
                }`}
              >
                − รายจ่าย
              </button>
              <button
                type="button"
                onClick={() => handleSwitchType("income")}
                className={`py-2 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                  type === "income"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-[#78716C] hover:text-[#1C1917]"
                }`}
              >
                + รายรับ
              </button>
            </div>

            {/* Smart Calculator Amount Input */}
            <div className="rounded-2xl bg-[#FFFDFA] border border-[#E7E0D2] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="tx-amount"
                  className="text-xs font-semibold text-[#57534E]"
                >
                  จำนวนเงิน / พิมพ์สูตรคิดเลข
                </label>
                {amountExpr.trim() && mathEval.ok && (
                  <button
                    type="button"
                    onClick={handleApplyEvaluated}
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-bold text-emerald-700 tabular-nums cursor-pointer"
                  >
                    = ฿{formatBaht(mathEval.value)}
                  </button>
                )}
                {amountExpr.trim() && !mathEval.ok && (
                  <span className="text-[11px] text-amber-700">
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
                  placeholder="0 (เช่น 120+45*2)"
                  className="w-full rounded-xl bg-white border border-[#EDE6D8] px-3 py-2.5 pr-14 text-xl font-bold text-[#1C1917] tabular-nums placeholder:text-sm placeholder:font-normal placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
                <button
                  type="button"
                  onClick={handleApplyEvaluated}
                  disabled={!amountExpr.trim()}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 disabled:opacity-35 text-amber-950 font-bold text-xs cursor-pointer"
                >
                  =
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {MATH_KEYS.map((k) => (
                  <button
                    key={k.label}
                    type="button"
                    onClick={() => appendMathToken(k.insert)}
                    className="min-w-[36px] h-8 px-2 rounded-lg bg-[#FBF8F1] hover:bg-amber-100 active:scale-95 border border-[#EDE6D8] text-sm font-bold text-[#44403C] cursor-pointer"
                  >
                    {k.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    setAmountExpr((prev) =>
                      prev.slice(0, Math.max(0, prev.length - 1))
                    )
                  }
                  className="h-8 px-2.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-xs font-semibold text-stone-700 cursor-pointer"
                >
                  ⌫
                </button>
                <button
                  type="button"
                  onClick={() => setAmountExpr("")}
                  className="h-8 px-2.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-xs font-semibold text-stone-600 cursor-pointer"
                >
                  C
                </button>
              </div>
            </div>

            {/* Title */}
            <div>
              <label
                htmlFor="tx-title"
                className="block text-xs font-semibold text-[#57534E] mb-1"
              >
                ชื่อรายการ
              </label>
              <input
                id="tx-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  type === "expense"
                    ? "เช่น ค่าอุปกรณ์, ค่าอาหาร, ค่ารถ"
                    : "เช่น เงินสนับสนุน, เก็บเงินทีม"
                }
                className="w-full rounded-2xl border border-[#E7E0D2] bg-[#FFFDFA] px-3.5 py-2.5 text-sm text-[#1C1917] placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            {/* Category Selector + Quick Receipt Image Attachment */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    htmlFor="tx-category"
                    className="text-xs font-semibold text-[#57534E]"
                  >
                    หมวดหมู่
                  </label>
                  <button
                    type="button"
                    onClick={onGoToSettings}
                    className="text-[11px] font-medium text-amber-700 hover:underline cursor-pointer"
                  >
                    แก้ไขหมวด
                  </button>
                </div>
                <select
                  id="tx-category"
                  value={activeCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full rounded-xl border border-[#E7E0D2] bg-[#FFFDFA] px-3 py-2 text-xs font-medium text-[#1C1917] focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  {categoriesForCurrentType.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span className="block text-xs font-semibold text-[#57534E] mb-1">
                  รูปใบเสร็จ / สลิป
                </span>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageInputChange}
                  className="hidden"
                />
                {!draftImageDataUrl ? (
                  <button
                    type="button"
                    disabled={imageProcessing}
                    onClick={() => imageInputRef.current?.click()}
                    className="w-full rounded-xl border border-dashed border-[#D6CCBA] bg-[#FBF8F1] hover:bg-amber-50/70 px-3 py-2 text-xs font-semibold text-[#57534E] cursor-pointer truncate"
                  >
                    {imageProcessing
                      ? "กำลังย่อรูป..."
                      : "📷 แนบ / ถ่ายรูปบิล"}
                  </button>
                ) : (
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-2.5 py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={draftImageDataUrl}
                        alt="ตัวอย่างบิล"
                        className="h-7 w-7 rounded-md object-cover border border-stone-200 shrink-0"
                      />
                      <span className="text-xs font-semibold text-emerald-800 truncate">
                        แนบรูปแล้ว
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDraftImageDataUrl(null);
                        setDraftExistingImageId(undefined);
                      }}
                      className="text-xs font-bold text-rose-600 hover:underline shrink-0 cursor-pointer"
                    >
                      ลบรูป
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Optional Extra Details Accordion */}
            <div className="rounded-2xl border border-[#EDE6D8] bg-[#FBF8F1]/60 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowMoreFields((prev) => !prev)}
                className="w-full px-3.5 py-2 flex items-center justify-between text-xs font-semibold text-[#57534E] hover:bg-stone-100/50 cursor-pointer"
              >
                <span>
                  รายละเอียดเพิ่มเติม (เลขที่บิล, คนเบิก, รอคืนเงิน, โน้ต)
                </span>
                <span>{showMoreFields ? "▲" : "▼"}</span>
              </button>

              {showMoreFields && (
                <div className="px-3.5 pb-3.5 pt-2 border-t border-[#EDE6D8] space-y-2.5 bg-white/70">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label
                        htmlFor="tx-ref"
                        className="block text-[11px] font-semibold text-[#57534E] mb-1"
                      >
                        เลขที่บิล / อ้างอิง
                      </label>
                      <input
                        id="tx-ref"
                        type="text"
                        value={receiptRef}
                        onChange={(e) => setReceiptRef(e.target.value)}
                        placeholder="เช่น INV-001"
                        className="w-full rounded-xl border border-[#E7E0D2] bg-white px-2.5 py-1.5 text-xs"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="tx-person"
                        className="block text-[11px] font-semibold text-[#57534E] mb-1"
                      >
                        ชื่อคนเบิก / ผู้จ่าย
                      </label>
                      <input
                        id="tx-person"
                        type="text"
                        value={personName}
                        onChange={(e) => setPersonName(e.target.value)}
                        placeholder="เช่น มิ้น, ก้อง"
                        className="w-full rounded-xl border border-[#E7E0D2] bg-white px-2.5 py-1.5 text-xs"
                      />
                    </div>
                  </div>

                  {frequentPeople.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-[11px] text-[#78716C]">ใช้บ่อย:</span>
                      {frequentPeople.map((name) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setPersonName(name)}
                          className="px-2 py-0.5 rounded-md bg-stone-100 hover:bg-amber-100 text-[11px] text-stone-700 cursor-pointer"
                        >
                          {name}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label
                        htmlFor="tx-date"
                        className="block text-[11px] font-semibold text-[#57534E] mb-1"
                      >
                        วันที่บิล
                      </label>
                      <input
                        id="tx-date"
                        type="date"
                        value={activeDateKey}
                        onChange={(e) => setDateKey(e.target.value)}
                        className="w-full rounded-xl border border-[#E7E0D2] bg-white px-2.5 py-1.5 text-xs tabular-nums"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="tx-channel"
                        className="block text-[11px] font-semibold text-[#57534E] mb-1"
                      >
                        ช่องทางเงิน
                      </label>
                      <select
                        id="tx-channel"
                        value={channel}
                        onChange={(e) =>
                          setChannel(e.target.value as PaymentChannel)
                        }
                        className="w-full rounded-xl border border-[#E7E0D2] bg-white px-2.5 py-1.5 text-xs"
                      >
                        <option value="make">โอน (MAKE)</option>
                        <option value="cash">เงินสด</option>
                        <option value="bank">บัญชีธนาคาร</option>
                        <option value="other">อื่น ๆ</option>
                      </select>
                    </div>
                  </div>

                  {type === "expense" && (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setReimburseStatus("settled")}
                        className={`py-1.5 px-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                          reimburseStatus === "settled"
                            ? "bg-emerald-50 border-emerald-400 text-emerald-900"
                            : "bg-white border-[#E7E0D2] text-stone-600"
                        }`}
                      >
                        ✓ เคลียร์แล้ว
                      </button>
                      <button
                        type="button"
                        onClick={() => setReimburseStatus("pending")}
                        className={`py-1.5 px-2 rounded-xl border text-xs font-semibold cursor-pointer ${
                          reimburseStatus === "pending"
                            ? "bg-amber-100 border-amber-400 text-amber-950"
                            : "bg-white border-[#E7E0D2] text-stone-600"
                        }`}
                      >
                        ⏳ สำรองจ่ายรอคืน
                      </button>
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="tx-note"
                      className="block text-[11px] font-semibold text-[#57534E] mb-1"
                    >
                      โน้ต
                    </label>
                    <input
                      id="tx-note"
                      type="text"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="โน้ตช่วยจำ..."
                      className="w-full rounded-xl border border-[#E7E0D2] bg-white px-2.5 py-1.5 text-xs"
                    />
                  </div>
                </div>
              )}
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
              disabled={imageProcessing}
              className={`w-full py-3 rounded-2xl text-sm font-bold text-white shadow-xs transition-transform active:scale-[0.99] cursor-pointer ${
                type === "expense"
                  ? "bg-[#EA580C] hover:bg-[#C2410C]"
                  : "bg-emerald-600 hover:bg-emerald-700"
              }`}
            >
              {editingId
                ? "บันทึกการแก้ไข"
                : mathEval.ok && mathEval.value > 0
                ? `บันทึกรายการ (฿${formatBaht(mathEval.value)})`
                : "บันทึกรายการ"}
            </button>
          </form>
        </div>

        {/* ============================================================ */}
        {/* RIGHT COLUMN (58%): Clean Totals + Search + Bill Checklist   */}
        {/* ============================================================ */}
        <div className="lg:col-span-7 space-y-3.5">
          {/* Clean 3-Box Summary Strip (budget shown only if > 0) */}
          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-white rounded-2xl border border-[#EDE6D8] p-3.5">
              <div className="text-[11px] font-medium text-[#78716C]">
                {project.budgetLimit > 0 ? "งบตั้งต้น + รายรับ" : "รายรับรวม"}
              </div>
              <div className="text-base sm:text-xl font-bold text-emerald-700 tabular-nums mt-0.5">
                +฿{formatBaht(project.budgetLimit + summary.totalIncome)}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#EDE6D8] p-3.5">
              <div className="text-[11px] font-medium text-[#78716C]">
                รายจ่ายรวม
              </div>
              <div className="text-base sm:text-xl font-bold text-rose-700 tabular-nums mt-0.5">
                −฿{formatBaht(summary.totalExpense)}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-[#EDE6D8] p-3.5">
              <div className="text-[11px] font-medium text-[#78716C]">
                คงเหลือสุทธิ
              </div>
              <div
                className={`text-base sm:text-xl font-bold tabular-nums mt-0.5 ${
                  summary.netBalance < 0 ? "text-rose-700" : "text-[#1C1917]"
                }`}
              >
                {summary.netBalance < 0 ? "-" : ""}฿
                {formatBaht(Math.abs(summary.netBalance))}
              </div>
            </div>
          </div>

          {/* Search & Simple Filter Strip */}
          <div className="bg-white rounded-2xl border border-[#EDE6D8] p-3 sm:p-3.5 space-y-2.5">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาบิล: ชื่อรายการ, เลขที่บิล, คนเบิก, หมวดหมู่..."
              className="w-full rounded-xl border border-[#E7E0D2] bg-[#FBF8F1] px-3.5 py-2 text-xs sm:text-sm text-[#1C1917] placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { id: "all", label: "ทั้งหมด" },
                    { id: "expense", label: "รายจ่าย" },
                    { id: "income", label: "รายรับ" },
                    {
                      id: "unverified",
                      label:
                        summary.unverifiedCount > 0
                          ? `ยังไม่เช็กยอด (${summary.unverifiedCount})`
                          : "ยังไม่เช็กยอด",
                    },
                    ...(summary.pendingCount > 0
                      ? [
                          {
                            id: "pending" as const,
                            label: `รอคืนเงิน (${summary.pendingCount})`,
                          },
                        ]
                      : []),
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setQuickFilter(tab.id)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                      quickFilter === tab.id
                        ? "bg-[#1C1917] border-[#1C1917] text-white"
                        : "bg-[#FFFDFA] border-[#EDE6D8] text-[#57534E] hover:bg-stone-50"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {entries.length > 0 && (
                <div className="text-xs text-[#78716C] tabular-nums">
                  {filteredEntries.length} รายการ · รับ{" "}
                  <strong className="text-emerald-700">
                    +฿{formatBaht(filteredIncome)}
                  </strong>{" "}
                  / จ่าย{" "}
                  <strong className="text-rose-700">
                    -฿{formatBaht(filteredExpense)}
                  </strong>
                </div>
              )}
            </div>
          </div>

          {/* Clean Bill List */}
          {filteredEntries.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-[#DFD5C3] p-10 text-center">
              <p className="text-sm font-semibold text-[#57534E]">
                {entries.length === 0
                  ? `สมุด "${project.name}" ยังว่างอยู่`
                  : "ไม่พบรายการที่ตรงกับคำค้นหา"}
              </p>
              <p className="text-xs text-[#78716C] mt-1">
                {entries.length === 0
                  ? "ใส่จำนวนเงินหรือสูตรทางซ้าย แล้วกดบันทึกเพื่อเริ่มจดบิลแรกได้เลย"
                  : "ลองล้างคำค้นหาหรือเลือกแท็บทั้งหมด"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredEntries.map((entry) => {
                const isEditingThis = editingId === entry.id;
                const isPending = entry.reimburseStatus === "pending";
                return (
                  <div
                    key={entry.id}
                    className={`bg-white rounded-2xl border p-3.5 transition-colors ${
                      isEditingThis
                        ? "border-amber-500 ring-2 ring-amber-200"
                        : entry.verified
                        ? "border-emerald-200/80 bg-emerald-50/15"
                        : "border-[#EDE6D8]"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* 1-Tap Verify Checkmark */}
                      <button
                        type="button"
                        onClick={() => onToggleVerified(entry.id)}
                        title={
                          entry.verified
                            ? "เช็กยอดแล้ว (กดเพื่อยกเลิก)"
                            : "กดเพื่อติ๊กว่าเช็กยอดบิลนี้แล้ว"
                        }
                        aria-label={`เช็กยอด ${entry.title}`}
                        className={`mt-0.5 h-6 w-6 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 transition-colors cursor-pointer ${
                          entry.verified
                            ? "bg-emerald-600 border-emerald-600 text-white"
                            : "border-stone-300 text-transparent hover:border-emerald-500"
                        }`}
                      >
                        ✓
                      </button>

                      {/* Main Content */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="text-sm sm:text-base font-bold text-[#1C1917] break-words">
                              {entry.title}
                            </h3>
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-0.5 text-xs text-[#78716C]">
                              <span className="tabular-nums">
                                {formatThaiDateLabel(entry.dateKey)}
                              </span>
                              <span>·</span>
                              <span>{entry.category}</span>
                              {entry.receiptRef && (
                                <>
                                  <span>·</span>
                                  <span className="font-mono text-[#57534E]">
                                    บิล {entry.receiptRef}
                                  </span>
                                </>
                              )}
                              {entry.personName && (
                                <>
                                  <span>·</span>
                                  <span className="text-[#1C1917] font-medium">
                                    {entry.personName}
                                  </span>
                                </>
                              )}
                            </div>
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
                            {entry.formula && (
                              <div className="text-[10.5px] font-mono text-amber-800">
                                {entry.formula}
                              </div>
                            )}
                          </div>
                        </div>

                        {(entry.note || isPending) && (
                          <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
                            {isPending && (
                              <button
                                type="button"
                                onClick={() => onToggleReimburse(entry.id)}
                                className="px-2 py-0.5 rounded-lg bg-amber-100 hover:bg-emerald-100 text-amber-950 hover:text-emerald-900 font-semibold cursor-pointer"
                              >
                                ⏳ รอคืนเงิน (กดเคลียร์)
                              </button>
                            )}
                            {entry.note && (
                              <span className="text-[#78716C]">
                                โน้ต: {entry.note}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Subtle Bottom Actions */}
                        <div className="flex flex-wrap items-center justify-end gap-2 mt-2 pt-2 border-t border-[#F6F1E8]">
                          {entry.imageId && (
                            <button
                              type="button"
                              onClick={() => onOpenImageLightbox(entry)}
                              className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-[11px] font-semibold cursor-pointer"
                            >
                              🖼️ ดูรูปบิล
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleStartEdit(entry)}
                            className="px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 text-[11px] font-semibold cursor-pointer"
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
                                className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[11px] font-bold cursor-pointer"
                              >
                                ยืนยันลบ
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-2 py-1 rounded-lg bg-stone-100 text-stone-600 text-[11px] font-semibold cursor-pointer"
                              >
                                ยกเลิก
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(entry.id)}
                              className="px-2 py-1 rounded-lg text-rose-600 hover:bg-rose-50 text-[11px] font-semibold cursor-pointer"
                            >
                              ลบ
                            </button>
                          )}
                        </div>
                      </div>
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
