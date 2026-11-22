"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  Check,
  CheckCircle2,
  ClipboardCheck,
  ClipboardCopy,
  Download,
  Pencil,
  Plus,
  Receipt,
  Settings2,
  Trash2,
  TrendingUp,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import {
  BoothSettings,
  Expense,
  Order,
  formatBaht,
  formatThaiDateLabel,
  generateId,
} from "@/lib/storage";

interface BudgetTabProps {
  orders: Order[];
  expenses: Expense[];
  settings: BoothSettings;
  todayKey: string;
  onUpdateSettings: (next: BoothSettings) => void;
  onAddExpense: (input: { title: string; amount: number }) => void;
  onUpdateExpense: (
    id: string,
    patch: { title: string; amount: number }
  ) => void;
  onDeleteExpense: (id: string) => void;
  onClearOrdersOnly: () => void;
  onExportJson: () => void;
  onImportJson: (raw: string) => void;
}

type SalesFilter = "today" | "all" | string; // 'today' | 'all' | YYYY-MM-DD

export function BudgetTab({
  orders,
  expenses,
  settings,
  todayKey,
  onUpdateSettings,
  onAddExpense,
  onUpdateExpense,
  onDeleteExpense,
  onClearOrdersOnly,
  onExportJson,
  onImportJson,
}: BudgetTabProps) {

  // Budget limit inline editor
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState(String(settings.budgetLimit));

  // Sales reconcile filter
  const [salesFilter, setSalesFilter] = useState<SalesFilter>("today");
  const [copiedSummary, setCopiedSummary] = useState(false);

  // Add expense form
  const [expenseTitle, setExpenseTitle] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");

  // Edit expense inline
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [editExpenseTitle, setEditExpenseTitle] = useState("");
  const [editExpenseAmount, setEditExpenseAmount] = useState("");

  // Settings & Backup section
  const [toolsOpen, setToolsOpen] = useState(false);
  const [newMenuName, setNewMenuName] = useState("");
  const [newMenuPrice, setNewMenuPrice] = useState("");
  const [newToppingName, setNewToppingName] = useState("");
  const [newToppingPrice, setNewToppingPrice] = useState("");

  // Clear test bills modal + import status
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [backupMessage, setBackupMessage] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // --------------------------------------------------------------------------
  // Budget & Break-even calculations (All non-void orders vs All expenses)
  // --------------------------------------------------------------------------
  const totalExpenses = useMemo(
    () => expenses.reduce((sum, e) => sum + e.amount, 0),
    [expenses]
  );

  const nonVoidOrdersAll = useMemo(
    () => orders.filter((o) => o.status !== "void"),
    [orders]
  );

  const totalRevenueAll = useMemo(
    () => nonVoidOrdersAll.reduce((sum, o) => sum + o.totalAmount, 0),
    [nonVoidOrdersAll]
  );

  const budgetLimit = settings.budgetLimit;
  const budgetRemaining = budgetLimit - totalExpenses;
  const budgetUsagePct =
    budgetLimit > 0
      ? Math.min(100, Math.round((totalExpenses / budgetLimit) * 100))
      : totalExpenses > 0
      ? 100
      : 0;
  const isOverBudget = totalExpenses > budgetLimit;

  const netProfit = totalRevenueAll - totalExpenses;
  const isBreakEven = netProfit >= 0;
  const breakEvenPct =
    totalExpenses > 0
      ? Math.min(100, Math.round((totalRevenueAll / totalExpenses) * 100))
      : 100;

  // --------------------------------------------------------------------------
  // Available dates & Sales Reconcile summary
  // --------------------------------------------------------------------------
  const availableDateKeys = useMemo(() => {
    const set = new Set<string>();
    for (const o of orders) {
      set.add(o.dateKey);
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [orders]);

  const filteredOrders = useMemo(() => {
    if (salesFilter === "all") return nonVoidOrdersAll;
    const targetDate = salesFilter === "today" ? todayKey : salesFilter;
    return nonVoidOrdersAll.filter((o) => o.dateKey === targetDate);
  }, [nonVoidOrdersAll, salesFilter, todayKey]);

  const salesStats = useMemo(() => {
    let makeTotal = 0;
    let makeCount = 0;
    let cashTotal = 0;
    let cashCount = 0;
    let totalCups = 0;
    const menuCounts = new Map<string, number>();
    const toppingCounts = new Map<string, number>();

    // Seed configured toppings so even 0 count toppings display neatly
    for (const t of settings.toppings) {
      toppingCounts.set(t.name, 0);
    }

    for (const order of filteredOrders) {
      if (order.paymentMethod === "make") {
        makeTotal += order.totalAmount;
        makeCount += 1;
      } else {
        cashTotal += order.totalAmount;
        cashCount += 1;
      }

      for (const item of order.items) {
        totalCups += item.quantity;
        menuCounts.set(
          item.menuName,
          (menuCounts.get(item.menuName) ?? 0) + item.quantity
        );
        for (const top of item.toppings) {
          toppingCounts.set(
            top.name,
            (toppingCounts.get(top.name) ?? 0) + item.quantity
          );
        }
      }
    }

    return {
      totalRevenue: makeTotal + cashTotal,
      totalBills: filteredOrders.length,
      makeTotal,
      makeCount,
      cashTotal,
      cashCount,
      totalCups,
      menuEntries: Array.from(menuCounts.entries()),
      toppingEntries: Array.from(toppingCounts.entries()),
    };
  }, [filteredOrders, settings.toppings]);

  const filterDisplayLabel = useMemo(() => {
    if (salesFilter === "all") return "รวมทั้งหมด";
    if (salesFilter === "today")
      return `วันนี้ (${formatThaiDateLabel(todayKey)})`;
    return `วันที่ ${formatThaiDateLabel(salesFilter)}`;
  }, [salesFilter, todayKey]);

  // --------------------------------------------------------------------------
  // Copy Thai Summary for LINE Group
  // --------------------------------------------------------------------------
  const handleCopySummary = async () => {
    const menuLines =
      salesStats.menuEntries.length > 0
        ? salesStats.menuEntries
            .map(([name, qty]) => `  • ${name}: ${qty} แก้ว`)
            .join("\n")
        : "  • ยังไม่มีรายการขาย";

    const toppingLines =
      salesStats.toppingEntries.length > 0
        ? salesStats.toppingEntries
            .map(([name, qty]) => `  • +${name}: ${qty} ที่`)
            .join("\n")
        : "  • ไม่มีท็อปปิ้ง";

    const breakEvenLine = isBreakEven
      ? `✅ คืนทุนแล้ว (กำไรสุทธิ +${formatBaht(netProfit)} บาท)`
      : `⏳ ขาดอีก ${formatBaht(Math.abs(netProfit))} บาทจะคืนทุน`;

    const summaryText = [
      `🌽 สรุปยอดขาย ${settings.boothName}`,
      `📅 ช่วงเวลา: ${filterDisplayLabel}`,
      `━━━━━━━━━━━━━━`,
      `💰 ยอดขายรวม: ${formatBaht(salesStats.totalRevenue)} บาท (${salesStats.totalBills} บิล)`,
      `📲 โอน (MAKE): ${formatBaht(salesStats.makeTotal)} บาท (${salesStats.makeCount} บิล)`,
      `💵 เงินสด: ${formatBaht(salesStats.cashTotal)} บาท (${salesStats.cashCount} บิล)`,
      `━━━━━━━━━━━━━━`,
      `🥤 ขายได้ทั้งหมด: ${salesStats.totalCups} แก้ว`,
      menuLines,
      `🧀 ท็อปปิ้งที่ออกไป:`,
      toppingLines,
      `━━━━━━━━━━━━━━`,
      `🧾 รายจ่ายสะสมทั้งหมด: ${formatBaht(totalExpenses)} / งบ ${formatBaht(budgetLimit)} บาท`,
      `📈 ภาพรวมจุดคุ้มทุน: ${breakEvenLine}`,
    ].join("\n");

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(summaryText);
      } else {
        throw new Error("Clipboard API unavailable");
      }
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = summaryText;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }

    setCopiedSummary(true);
    window.setTimeout(() => setCopiedSummary(false), 2200);
  };

  // --------------------------------------------------------------------------
  // Handlers
  // --------------------------------------------------------------------------
  const handleSaveBudgetLimit = () => {
    const parsed = Number(budgetDraft);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      onUpdateSettings({ ...settings, budgetLimit: Math.round(parsed) });
    }
    setEditingBudget(false);
  };

  const handleSubmitExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const title = expenseTitle.trim();
    const amount = Number(expenseAmount);
    if (!title || Number.isNaN(amount) || amount <= 0) return;
    onAddExpense({ title, amount: Math.round(amount) });
    setExpenseTitle("");
    setExpenseAmount("");
  };

  const startEditExpense = (expense: Expense) => {
    setEditingExpenseId(expense.id);
    setEditExpenseTitle(expense.title);
    setEditExpenseAmount(String(expense.amount));
  };

  const saveEditExpense = () => {
    if (!editingExpenseId) return;
    const title = editExpenseTitle.trim();
    const amount = Number(editExpenseAmount);
    if (!title || Number.isNaN(amount) || amount < 0) return;
    onUpdateExpense(editingExpenseId, { title, amount: Math.round(amount) });
    setEditingExpenseId(null);
  };

  const handleUpdateMenuPrice = (menuId: string, rawPrice: string) => {
    const price = Number(rawPrice);
    if (Number.isNaN(price) || price < 0) return;
    onUpdateSettings({
      ...settings,
      menus: settings.menus.map((m) =>
        m.id === menuId ? { ...m, price: Math.round(price) } : m
      ),
    });
  };

  const handleUpdateMenuName = (menuId: string, name: string) => {
    onUpdateSettings({
      ...settings,
      menus: settings.menus.map((m) => (m.id === menuId ? { ...m, name } : m)),
    });
  };

  const handleToggleMenuActive = (menuId: string) => {
    const activeCount = settings.menus.filter((m) => m.active).length;
    const target = settings.menus.find((m) => m.id === menuId);
    if (target?.active && activeCount <= 1) return; // keep at least 1 active menu
    onUpdateSettings({
      ...settings,
      menus: settings.menus.map((m) =>
        m.id === menuId ? { ...m, active: !m.active } : m
      ),
    });
  };

  const handleAddNewMenu = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newMenuName.trim();
    const price = Number(newMenuPrice);
    if (!name || Number.isNaN(price) || price < 0) return;
    onUpdateSettings({
      ...settings,
      menus: [
        ...settings.menus,
        {
          id: generateId("menu"),
          name,
          price: Math.round(price),
          active: true,
        },
      ],
    });
    setNewMenuName("");
    setNewMenuPrice("");
  };

  const handleUpdateToppingPrice = (toppingId: string, rawPrice: string) => {
    const price = Number(rawPrice);
    if (Number.isNaN(price) || price < 0) return;
    onUpdateSettings({
      ...settings,
      toppings: settings.toppings.map((t) =>
        t.id === toppingId ? { ...t, price: Math.round(price) } : t
      ),
    });
  };

  const handleUpdateToppingName = (toppingId: string, name: string) => {
    onUpdateSettings({
      ...settings,
      toppings: settings.toppings.map((t) =>
        t.id === toppingId ? { ...t, name } : t
      ),
    });
  };

  const handleToggleToppingActive = (toppingId: string) => {
    onUpdateSettings({
      ...settings,
      toppings: settings.toppings.map((t) =>
        t.id === toppingId ? { ...t, active: !t.active } : t
      ),
    });
  };

  const handleAddNewTopping = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newToppingName.trim();
    const price = Number(newToppingPrice);
    if (!name || Number.isNaN(price) || price < 0) return;
    onUpdateSettings({
      ...settings,
      toppings: [
        ...settings.toppings,
        {
          id: generateId("top"),
          name,
          price: Math.round(price),
          active: true,
        },
      ],
    });
    setNewToppingName("");
    setNewToppingPrice("");
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      onImportJson(text);
      setBackupMessage({
        type: "ok",
        text: "นำเข้าข้อมูลสำรอง JSON สำเร็จแล้ว",
      });
    } catch (err) {
      setBackupMessage({
        type: "err",
        text:
          err instanceof Error ? err.message : "ไม่สามารถอ่านไฟล์ JSON ได้",
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
      window.setTimeout(() => setBackupMessage(null), 3500);
    }
  };

  return (
    <div className="space-y-5">
      {/* =================================================================== */}
      {/* 1. BUDGET CONTROL & BREAK-EVEN CARD                                 */}
      {/* =================================================================== */}
      <section
        aria-label="คุมงบประมาณและจุดคุ้มทุน"
        className="rounded-3xl bg-white border border-[#E9DFCE] shadow-[0_6px_24px_-8px_rgba(120,74,12,0.12)] p-4 sm:p-5 space-y-4"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </span>
            <h2 className="text-base font-extrabold text-stone-900">
              คุมงบ &amp; จุดคุ้มทุน
            </h2>
          </div>

          {!editingBudget ? (
            <button
              type="button"
              onClick={() => {
                setBudgetDraft(String(settings.budgetLimit));
                setEditingBudget(true);
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#FAF5EB] hover:bg-amber-100 border border-[#E9DFCE] text-xs font-bold text-stone-700"
            >
              <Pencil className="w-3.5 h-3.5" />
              เพดานงบ ฿{formatBaht(budgetLimit)}
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                inputMode="numeric"
                value={budgetDraft}
                onChange={(e) => setBudgetDraft(e.target.value)}
                className="w-24 px-2.5 py-1 rounded-xl border border-amber-400 text-sm font-bold text-stone-900 tabular-nums focus:outline-none"
                autoFocus
              />
              <button
                type="button"
                onClick={handleSaveBudgetLimit}
                className="px-2.5 py-1 rounded-xl bg-stone-900 text-amber-300 text-xs font-bold"
              >
                บันทึก
              </button>
              <button
                type="button"
                onClick={() => setEditingBudget(false)}
                className="p-1 rounded-xl text-stone-400 hover:text-stone-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Budget Used vs Remaining Progress */}
        <div className="rounded-2xl bg-[#FAF7F0] border border-[#EFE6D6] p-3.5 space-y-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs font-bold text-stone-600">
              งบที่ใช้ไปจริง vs งบคงเหลือ
            </span>
            <span
              className={`text-xs font-extrabold tabular-nums ${
                isOverBudget ? "text-rose-600" : "text-stone-700"
              }`}
            >
              ใช้แล้ว ฿{formatBaht(totalExpenses)} / ฿{formatBaht(budgetLimit)}
            </span>
          </div>

          <div className="w-full h-3.5 rounded-full bg-stone-200 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isOverBudget
                  ? "bg-rose-500"
                  : budgetUsagePct >= 85
                  ? "bg-amber-500"
                  : "bg-stone-800"
              }`}
              style={{ width: `${budgetUsagePct}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-stone-500">
              ใช้ไป {budgetUsagePct}% ของงบตั้งต้น
            </span>
            {isOverBudget ? (
              <span className="font-extrabold text-rose-600 tabular-nums">
                เกินงบ ฿{formatBaht(Math.abs(budgetRemaining))}
              </span>
            ) : (
              <span className="font-extrabold text-emerald-700 tabular-nums">
                งบคงเหลือ ฿{formatBaht(budgetRemaining)}
              </span>
            )}
          </div>
        </div>

        {/* Break-even Meter */}
        <div
          className={`rounded-2xl border p-3.5 space-y-2.5 ${
            isBreakEven
              ? "bg-emerald-50/70 border-emerald-200"
              : "bg-amber-50/70 border-amber-200"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-stone-700">
              จุดคุ้มทุน (รายรับทั้งหมด ÷ รายจ่ายจริง)
            </span>
            <span className="text-xs font-extrabold tabular-nums text-stone-800">
              {breakEvenPct}%
            </span>
          </div>

          <div className="w-full h-3.5 rounded-full bg-white/90 border border-black/5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isBreakEven ? "bg-emerald-500" : "bg-amber-500"
              }`}
              style={{ width: `${breakEvenPct}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs pt-0.5">
            <div>
              <div className="text-stone-500">รายรับรวม (ไม่รวม void)</div>
              <div className="text-base font-extrabold text-stone-900 tabular-nums">
                ฿{formatBaht(totalRevenueAll)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-stone-500">รายจ่ายที่จ่ายจริง</div>
              <div className="text-base font-extrabold text-stone-900 tabular-nums">
                ฿{formatBaht(totalExpenses)}
              </div>
            </div>
          </div>

          <div
            className={`pt-2 border-t text-sm font-extrabold flex items-center justify-between ${
              isBreakEven
                ? "border-emerald-200 text-emerald-800"
                : "border-amber-200 text-amber-900"
            }`}
          >
            {isBreakEven ? (
              <>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  คืนทุนแล้ว! กำไรสุทธิ
                </span>
                <span className="text-lg tabular-nums text-emerald-700">
                  +฿{formatBaht(netProfit)}
                </span>
              </>
            ) : (
              <>
                <span>ขาดอีกเท่าไหร่จะคืนทุน</span>
                <span className="text-lg tabular-nums text-rose-600">
                  อีก ฿{formatBaht(Math.abs(netProfit))}
                </span>
              </>
            )}
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 2. END-OF-DAY SALES RECONCILE                                       */}
      {/* =================================================================== */}
      <section
        aria-label="สรุปยอดขายปิดวัน"
        className="rounded-3xl bg-white border border-[#E9DFCE] shadow-xs p-4 sm:p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-extrabold text-stone-900">
              สรุปยอดขายปิดวัน
            </h2>
            <p className="text-xs text-stone-500">
              ช่วงข้อมูล:{" "}
              <span className="font-semibold text-stone-700">
                {filterDisplayLabel}
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={handleCopySummary}
            className={`min-h-[40px] px-3.5 py-2 rounded-2xl text-xs font-extrabold transition-all active:scale-95 flex items-center gap-1.5 ${
              copiedSummary
                ? "bg-emerald-600 text-white"
                : "bg-stone-900 hover:bg-stone-800 text-amber-300"
            }`}
          >
            {copiedSummary ? (
              <>
                <ClipboardCheck className="w-4 h-4" />
                คัดลอกแล้ว!
              </>
            ) : (
              <>
                <ClipboardCopy className="w-4 h-4" />
                คัดลอกสรุปยอด
              </>
            )}
          </button>
        </div>

        {/* Date Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSalesFilter("today")}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors ${
              salesFilter === "today"
                ? "bg-amber-500 border-amber-600 text-white"
                : "bg-stone-100 border-stone-200 text-stone-700"
            }`}
          >
            วันนี้
          </button>

          {availableDateKeys
            .filter((dk) => dk !== todayKey)
            .map((dk) => (
              <button
                key={dk}
                type="button"
                onClick={() => setSalesFilter(dk)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                  salesFilter === dk
                    ? "bg-amber-500 border-amber-600 text-white"
                    : "bg-stone-100 border-stone-200 text-stone-700"
                }`}
              >
                {formatThaiDateLabel(dk)}
              </button>
            ))}

          <button
            type="button"
            onClick={() => setSalesFilter("all")}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors ${
              salesFilter === "all"
                ? "bg-amber-500 border-amber-600 text-white"
                : "bg-stone-100 border-stone-200 text-stone-700"
            }`}
          >
            รวมทั้งหมด
          </button>
        </div>

        {/* MAKE Transfer (Big Highlight) + Cash */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* MAKE Card */}
          <div className="rounded-2xl bg-teal-50 border-2 border-teal-300 p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-teal-800">
                <Wallet className="w-4 h-4" />
                ยอดโอน (MAKE)
              </span>
              <span className="px-2 py-0.5 rounded-full bg-teal-600 text-white text-[11px] font-bold tabular-nums">
                {salesStats.makeCount} บิล
              </span>
            </div>
            <div className="text-3xl sm:text-4xl font-extrabold text-teal-900 tabular-nums tracking-tight">
              ฿{formatBaht(salesStats.makeTotal)}
            </div>
            <p className="text-[11px] text-teal-700 font-medium">
              เทียบกับยอดใน MAKE Cloud Pocket
            </p>
          </div>

          {/* Cash Card */}
          <div className="rounded-2xl bg-orange-50 border border-orange-200 p-4 space-y-1">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-orange-800">
                <Banknote className="w-4 h-4" />
                ยอดเงินสด
              </span>
              <span className="px-2 py-0.5 rounded-full bg-orange-600 text-white text-[11px] font-bold tabular-nums">
                {salesStats.cashCount} บิล
              </span>
            </div>
            <div className="text-3xl sm:text-4xl font-extrabold text-orange-900 tabular-nums tracking-tight">
              ฿{formatBaht(salesStats.cashTotal)}
            </div>
            <p className="text-[11px] text-orange-700 font-medium">
              เงินสดในกล่องทอน (ไม่รวมเงินทอนตั้งต้น)
            </p>
          </div>
        </div>

        {/* Total Revenue, Total Cups & Toppings Breakdown */}
        <div className="rounded-2xl bg-[#FAF7F0] border border-[#EFE6D6] p-3.5 space-y-3">
          <div className="flex items-center justify-between pb-2.5 border-b border-[#E9DFCE]">
            <div>
              <div className="text-xs text-stone-500">
                ยอดขายรวม ({salesStats.totalBills} บิล)
              </div>
              <div className="text-xl font-extrabold text-stone-900 tabular-nums">
                ฿{formatBaht(salesStats.totalRevenue)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-stone-500">ขายได้ทั้งหมด</div>
              <div className="text-xl font-extrabold text-amber-700 tabular-nums">
                {salesStats.totalCups} แก้ว
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="space-y-1.5">
              <div className="font-bold text-stone-600">จำนวนเมนูที่ขายได้</div>
              {salesStats.menuEntries.length === 0 ? (
                <div className="text-stone-400">ยังไม่มีรายการขาย</div>
              ) : (
                <ul className="space-y-1">
                  {salesStats.menuEntries.map(([name, qty]) => (
                    <li
                      key={name}
                      className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-xl border border-[#EFE6D6]"
                    >
                      <span className="font-semibold text-stone-800">
                        {name}
                      </span>
                      <span className="font-extrabold text-stone-900 tabular-nums">
                        {qty} แก้ว
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="font-bold text-stone-600">
                จำนวนท็อปปิ้งที่ออกไป
              </div>
              {salesStats.toppingEntries.length === 0 ? (
                <div className="text-stone-400">ยังไม่มีท็อปปิ้ง</div>
              ) : (
                <ul className="space-y-1">
                  {salesStats.toppingEntries.map(([name, qty]) => (
                    <li
                      key={name}
                      className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-xl border border-[#EFE6D6]"
                    >
                      <span className="font-semibold text-stone-800">
                        +{name}
                      </span>
                      <span className="font-extrabold text-amber-800 tabular-nums">
                        {qty} ที่
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 3. ADDITIONAL EXPENSES                                              */}
      {/* =================================================================== */}
      <section
        aria-label="จดรายจ่ายเพิ่มเติม"
        className="rounded-3xl bg-white border border-[#E9DFCE] shadow-xs p-4 sm:p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-stone-100 text-stone-700 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </span>
            <h2 className="text-base font-extrabold text-stone-900">
              บันทึกรายจ่าย
            </h2>
          </div>
          <span className="text-sm font-extrabold text-stone-900 tabular-nums">
            รวม ฿{formatBaht(totalExpenses)}
          </span>
        </div>

        {/* Add Expense Form */}
        <form
          onSubmit={handleSubmitExpense}
          className="grid grid-cols-1 sm:grid-cols-[1fr_120px_auto] gap-2"
        >
          <input
            type="text"
            value={expenseTitle}
            onChange={(e) => setExpenseTitle(e.target.value)}
            placeholder="ชื่อรายการ (เช่น น้ำแข็ง, ถ้วยเพิ่ม)..."
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-stone-50 border border-stone-200 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white"
          />
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={expenseAmount}
            onChange={(e) => setExpenseAmount(e.target.value)}
            placeholder="บาท"
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-stone-50 border border-stone-200 text-sm font-bold text-stone-900 tabular-nums placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white"
          />
          <button
            type="submit"
            disabled={!expenseTitle.trim() || !expenseAmount}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 disabled:opacity-40 text-amber-300 font-bold text-sm flex items-center justify-center gap-1.5 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            เพิ่มรายจ่าย
          </button>
        </form>

        {/* Expense List */}
        {expenses.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-200 p-4 text-center text-xs text-stone-400">
            ยังไม่มีรายการรายจ่าย
          </div>
        ) : (
          <ul className="divide-y divide-[#EFE6D6] rounded-2xl border border-[#EFE6D6] overflow-hidden">
            {expenses.map((expense) => {
              const isEditing = editingExpenseId === expense.id;
              return (
                <li key={expense.id} className="p-3 bg-white">
                  {isEditing ? (
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={editExpenseTitle}
                        onChange={(e) => setEditExpenseTitle(e.target.value)}
                        className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl border border-amber-400 text-sm font-semibold text-stone-900"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          inputMode="numeric"
                          value={editExpenseAmount}
                          onChange={(e) => setEditExpenseAmount(e.target.value)}
                          className="w-24 min-h-[38px] px-3 py-1.5 rounded-xl border border-amber-400 text-sm font-bold text-stone-900 tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={saveEditExpense}
                          className="min-h-[38px] px-3 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          บันทึก
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingExpenseId(null)}
                          className="min-h-[38px] px-2.5 rounded-xl bg-stone-100 text-stone-600 text-xs font-bold"
                        >
                          ยกเลิก
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-stone-900 truncate">
                          {expense.title}
                        </div>
                        <div className="text-[11px] text-stone-400">
                          {formatThaiDateLabel(expense.dateKey)}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-sm font-extrabold text-stone-900 tabular-nums mr-1">
                          ฿{formatBaht(expense.amount)}
                        </span>
                        <button
                          type="button"
                          aria-label={`แก้ไข ${expense.title}`}
                          onClick={() => startEditExpense(expense)}
                          className="w-8 h-8 rounded-xl bg-stone-100 hover:bg-amber-100 text-stone-600 flex items-center justify-center"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`ลบ ${expense.title}`}
                          onClick={() => onDeleteExpense(expense.id)}
                          className="w-8 h-8 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center justify-center"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* =================================================================== */}
      {/* 4. BOTTOM TOOLS: MENU/PRICE SETTINGS, BACKUP, CLEAR TEST BILLS      */}
      {/* =================================================================== */}
      <section
        aria-label="ตั้งค่าเมนูและสำรองข้อมูล"
        className="rounded-2xl bg-white border border-[#E9DFCE] overflow-hidden"
      >
        <button
          type="button"
          onClick={() => setToolsOpen((prev) => !prev)}
          aria-expanded={toolsOpen}
          className="w-full min-h-[48px] px-4 py-3 flex items-center justify-between text-left hover:bg-[#FAF5EB]/60"
        >
          <span className="flex items-center gap-2 text-sm font-bold text-stone-700">
            <Settings2 className="w-4 h-4 text-amber-700" />
            ตั้งค่าเมนู / สำรองข้อมูล / ล้างบิลทดสอบ
          </span>
          <span className="text-xs font-semibold text-stone-400">
            {toolsOpen ? "ซ่อน" : "เปิด"}
          </span>
        </button>

        {toolsOpen && (
          <div className="border-t border-[#EFE6D6] p-4 space-y-5">
            {/* Edit / Add Menus */}
            <div className="space-y-2.5">
              <h3 className="text-xs font-extrabold uppercase tracking-wide text-stone-500">
                จัดการเมนูหลัก &amp; ราคา
              </h3>
              <div className="space-y-2">
                {settings.menus.map((menu) => (
                  <div
                    key={menu.id}
                    className="flex items-center gap-2 bg-[#FAF7F0] p-2 rounded-xl border border-[#EFE6D6]"
                  >
                    <input
                      type="text"
                      value={menu.name}
                      onChange={(e) =>
                        handleUpdateMenuName(menu.id, e.target.value)
                      }
                      className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-sm font-bold text-stone-900"
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      value={menu.price}
                      onChange={(e) =>
                        handleUpdateMenuPrice(menu.id, e.target.value)
                      }
                      className="w-20 px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-sm font-bold text-stone-900 tabular-nums text-right"
                    />
                    <button
                      type="button"
                      onClick={() => handleToggleMenuActive(menu.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold shrink-0 ${
                        menu.active
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-stone-200 text-stone-500"
                      }`}
                    >
                      {menu.active ? "เปิดขาย" : "ซ่อน"}
                    </button>
                  </div>
                ))}
              </div>
              <form
                onSubmit={handleAddNewMenu}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={newMenuName}
                  onChange={(e) => setNewMenuName(e.target.value)}
                  placeholder="เพิ่มเมนูใหม่..."
                  className="flex-1 min-w-0 min-h-[38px] px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200 text-xs"
                />
                <input
                  type="number"
                  inputMode="numeric"
                  value={newMenuPrice}
                  onChange={(e) => setNewMenuPrice(e.target.value)}
                  placeholder="ราคา"
                  className="w-20 min-h-[38px] px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200 text-xs font-bold tabular-nums"
                />
                <button
                  type="submit"
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-bold shrink-0"
                >
                  + เพิ่ม
                </button>
              </form>
            </div>

            {/* Edit / Add Toppings */}
            <div className="space-y-2.5">
              <h3 className="text-xs font-extrabold uppercase tracking-wide text-stone-500">
                จัดการท็อปปิ้ง &amp; ราคา
              </h3>
              <div className="space-y-2">
                {settings.toppings.map((topping) => (
                  <div
                    key={topping.id}
                    className="flex items-center gap-2 bg-[#FAF7F0] p-2 rounded-xl border border-[#EFE6D6]"
                  >
                    <input
                      type="text"
                      value={topping.name}
                      onChange={(e) =>
                        handleUpdateToppingName(topping.id, e.target.value)
                      }
                      className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-sm font-bold text-stone-900"
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      value={topping.price}
                      onChange={(e) =>
                        handleUpdateToppingPrice(topping.id, e.target.value)
                      }
                      className="w-20 px-2.5 py-1.5 rounded-lg bg-white border border-stone-200 text-sm font-bold text-stone-900 tabular-nums text-right"
                    />
                    <button
                      type="button"
                      onClick={() => handleToggleToppingActive(topping.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold shrink-0 ${
                        topping.active
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-stone-200 text-stone-500"
                      }`}
                    >
                      {topping.active ? "เปิดขาย" : "ซ่อน"}
                    </button>
                  </div>
                ))}
              </div>
              <form
                onSubmit={handleAddNewTopping}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={newToppingName}
                  onChange={(e) => setNewToppingName(e.target.value)}
                  placeholder="เพิ่มท็อปปิ้งใหม่..."
                  className="flex-1 min-w-0 min-h-[38px] px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200 text-xs"
                />
                <input
                  type="number"
                  inputMode="numeric"
                  value={newToppingPrice}
                  onChange={(e) => setNewToppingPrice(e.target.value)}
                  placeholder="ราคา"
                  className="w-20 min-h-[38px] px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200 text-xs font-bold tabular-nums"
                />
                <button
                  type="submit"
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-bold shrink-0"
                >
                  + เพิ่ม
                </button>
              </form>
            </div>

            {/* JSON Backup */}
            <div className="space-y-2 pt-2 border-t border-[#EFE6D6]">
              <h3 className="text-xs font-extrabold uppercase tracking-wide text-stone-500">
                สำรองข้อมูล (JSON)
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onExportJson}
                  className="min-h-[42px] px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  Export JSON
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[42px] px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Upload className="w-4 h-4" />
                  Import JSON
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={handleFileImport}
                  className="hidden"
                />
              </div>

              {backupMessage && (
                <div
                  className={`text-xs font-bold px-3 py-2 rounded-xl ${
                    backupMessage.type === "ok"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-rose-50 text-rose-700"
                  }`}
                >
                  {backupMessage.text}
                </div>
              )}
            </div>

            {/* Clear Test Bills Only */}
            <div className="pt-2 border-t border-[#EFE6D6]">
              <button
                type="button"
                onClick={() => setConfirmClearOpen(true)}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-extrabold flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                ล้างเฉพาะบิลทดสอบ (คงรายจ่าย 1,500 บาทไว้)
              </button>
            </div>
          </div>
        )}
      </section>

      {/* =================================================================== */}
      {/* CONFIRMATION MODAL: CLEAR TEST BILLS ONLY                           */}
      {/* =================================================================== */}
      {confirmClearOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="clear-orders-title"
          className="fixed inset-0 z-50 bg-black/45 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="w-full max-w-sm rounded-3xl bg-white border border-[#E9DFCE] shadow-xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </span>
              <div className="space-y-1">
                <h3
                  id="clear-orders-title"
                  className="text-base font-extrabold text-stone-900"
                >
                  ยืนยันล้างเฉพาะบิลทดสอบ?
                </h3>
                <p className="text-xs text-stone-600 leading-relaxed">
                  ระบบจะลบออเดอร์ทั้งหมด ({orders.length} บิล) และรีเซ็ตคิวกลับเป็น{" "}
                  <strong>#01</strong> แต่จะ
                  <strong className="text-emerald-700">
                    ไม่ลบรายการรายจ่าย ({expenses.length} รายการ รวม ฿
                    {formatBaht(totalExpenses)})
                  </strong>{" "}
                  และการตั้งค่าเมนูของคุณ
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmClearOpen(false)}
                className="min-h-[44px] rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-800 text-sm font-bold"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={() => {
                  onClearOrdersOnly();
                  setConfirmClearOpen(false);
                }}
                className="min-h-[44px] rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-extrabold"
              >
                ยืนยันล้างบิล
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
