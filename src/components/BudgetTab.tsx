"use client";

import React, { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Banknote,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  ClipboardCopy,
  Download,
  Pencil,
  Plus,
  Settings2,
  Trash2,
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
  onNotify: (message: string, tone?: "success" | "error") => void;
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
  onNotify,
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

  // Menu & Price editor (collapsible)
  const [menuEditorOpen, setMenuEditorOpen] = useState(false);
  const [newMenuName, setNewMenuName] = useState("");
  const [newMenuPrice, setNewMenuPrice] = useState("");
  const [newToppingName, setNewToppingName] = useState("");
  const [newToppingPrice, setNewToppingPrice] = useState("");

  // Clear test bills confirmation modal
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // --------------------------------------------------------------------------
  // Budget & Break-even calculations (All non-void orders vs All expenses)
  // --------------------------------------------------------------------------
  const totalExpenses = useMemo(
    () => expenses.reduce((sum, e) => sum + e.amount, 0),
    [expenses]
  );

  const soldOrdersAll = useMemo(
    () => orders.filter((o) => o.status !== "void" && o.status !== "waste"),
    [orders]
  );

  const wasteOrdersAll = useMemo(
    () => orders.filter((o) => o.status === "waste"),
    [orders]
  );

  const totalRevenueAll = useMemo(
    () => soldOrdersAll.reduce((sum, o) => sum + o.totalAmount, 0),
    [soldOrdersAll]
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

  const filteredSoldOrders = useMemo(() => {
    if (salesFilter === "all") return soldOrdersAll;
    const targetDate = salesFilter === "today" ? todayKey : salesFilter;
    return soldOrdersAll.filter((o) => o.dateKey === targetDate);
  }, [soldOrdersAll, salesFilter, todayKey]);

  const filteredWasteOrders = useMemo(() => {
    if (salesFilter === "all") return wasteOrdersAll;
    const targetDate = salesFilter === "today" ? todayKey : salesFilter;
    return wasteOrdersAll.filter((o) => o.dateKey === targetDate);
  }, [wasteOrdersAll, salesFilter, todayKey]);

  const salesStats = useMemo(() => {
    let makeTotal = 0;
    let makeCount = 0;
    let cashTotal = 0;
    let cashCount = 0;
    let totalCups = 0;
    const menuCounts = new Map<string, number>();
    const toppingCounts = new Map<string, number>();

    for (const t of settings.toppings) {
      toppingCounts.set(t.name, 0);
    }

    for (const order of filteredSoldOrders) {
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
      totalBills: filteredSoldOrders.length,
      makeTotal,
      makeCount,
      cashTotal,
      cashCount,
      totalCups,
      menuEntries: Array.from(menuCounts.entries()),
      toppingEntries: Array.from(toppingCounts.entries()),
    };
  }, [filteredSoldOrders, settings.toppings]);

  const wasteStats = useMemo(() => {
    let wasteCups = 0;
    const wasteToppingCounts = new Map<string, number>();

    for (const order of filteredWasteOrders) {
      for (const item of order.items) {
        wasteCups += item.quantity;
        for (const top of item.toppings) {
          wasteToppingCounts.set(
            top.name,
            (wasteToppingCounts.get(top.name) ?? 0) + item.quantity
          );
        }
      }
    }

    const totalCupsUsed = salesStats.totalCups + wasteCups;
    const yieldPct =
      totalCupsUsed > 0
        ? ((salesStats.totalCups / totalCupsUsed) * 100).toFixed(1)
        : "0.0";

    return {
      wasteCups,
      totalCupsUsed,
      yieldPct,
      wasteToppingEntries: Array.from(wasteToppingCounts.entries()),
    };
  }, [filteredWasteOrders, salesStats.totalCups]);

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
      `⚠️ ทำเสีย (Waste): ${wasteStats.wasteCups} แก้ว | ค่า Yield: ${wasteStats.yieldPct}%`,
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
    onNotify("คัดลอกสรุปยอดสำหรับส่ง LINE แล้ว");
    window.setTimeout(() => setCopiedSummary(false), 2000);
  };

  // --------------------------------------------------------------------------
  // Handlers
  // --------------------------------------------------------------------------
  const handleSaveBudgetLimit = () => {
    const parsed = Number(budgetDraft);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      onUpdateSettings({ ...settings, budgetLimit: Math.round(parsed) });
      onNotify(`อัปเดตเพดานงบเป็น ฿${formatBaht(parsed)} แล้ว`);
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
    if (target?.active && activeCount <= 1) return;
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
    onNotify(`เพิ่มเมนู "${name}" แล้ว`);
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
    onNotify(`เพิ่มท็อปปิ้ง "+${name}" แล้ว`);
  };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      onImportJson(text);
      onNotify("นำเข้าข้อมูลสำรอง JSON สำเร็จแล้ว");
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : "ไม่สามารถอ่านไฟล์ JSON ได้",
        "error"
      );
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleConfirmClearOrders = () => {
    onClearOrdersOnly();
    setConfirmClearOpen(false);
    setSalesFilter("today");
  };

  const confirmModal =
    confirmClearOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="clear-orders-title"
            onClick={() => setConfirmClearOpen(false)}
            className="fixed inset-0 z-[100] bg-stone-950/45 flex items-center justify-center p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-3xl bg-white border border-stone-200 shadow-2xl p-5 space-y-4"
            >
              <div className="flex items-start gap-3">
                <span className="w-10 h-10 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </span>
                <div className="space-y-1">
                  <h3
                    id="clear-orders-title"
                    className="text-base font-semibold text-stone-900"
                  >
                    ล้างเฉพาะบิลทดสอบ?
                  </h3>
                  <p className="text-xs text-stone-600 leading-relaxed">
                    ระบบจะลบออเดอร์ทั้งหมด{" "}
                    <strong className="text-stone-900">
                      ({orders.length} บิล)
                    </strong>{" "}
                    และรีเซ็ตคิวกลับเป็น{" "}
                    <strong className="text-stone-900">#01</strong> แต่จะ
                    <strong className="text-emerald-700">
                      ไม่ลบรายการรายจ่าย ({expenses.length} รายการ · ฿
                      {formatBaht(totalExpenses)})
                    </strong>{" "}
                    และเมนูของคุณ
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmClearOpen(false)}
                  className="min-h-[46px] rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-semibold active:scale-[0.98]"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleConfirmClearOrders}
                  className="min-h-[46px] rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold active:scale-[0.98]"
                >
                  ยืนยันล้างบิล
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start pb-6">
        {/* ================================================================= */}
        {/* 1. BUDGET CONTROL & BREAK-EVEN CARD                               */}
        {/* ================================================================= */}
        <section
          aria-label="คุมงบประมาณและจุดคุ้มทุน"
          className="rounded-3xl bg-white border border-[#EDE6D8] shadow-[0_2px_14px_-4px_rgba(120,74,12,0.06)] p-5 space-y-5"
        >
        {/* Header & Editable Budget Cap */}
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-stone-900">
            คุมงบ &amp; จุดคุ้มทุน
          </h2>

          {!editingBudget ? (
            <button
              type="button"
              onClick={() => {
                setBudgetDraft(String(settings.budgetLimit));
                setEditingBudget(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-stone-100 hover:bg-stone-200/70 text-xs font-medium text-stone-700 transition-colors"
            >
              <Pencil className="w-3 h-3 text-stone-500" />
              งบตั้งต้น ฿{formatBaht(budgetLimit)}
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                inputMode="numeric"
                value={budgetDraft}
                onChange={(e) => setBudgetDraft(e.target.value)}
                className="w-24 px-2.5 py-1 rounded-xl border border-amber-400 text-sm font-semibold text-stone-900 tabular-nums focus:outline-none"
                autoFocus
              />
              <button
                type="button"
                onClick={handleSaveBudgetLimit}
                className="px-3 py-1 rounded-xl bg-stone-900 text-white text-xs font-semibold"
              >
                บันทึก
              </button>
              <button
                type="button"
                aria-label="ปิดการแก้งบ"
                onClick={() => setEditingBudget(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Part A: Budget Usage */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <div className="text-xs text-stone-500">ใช้ไปแล้วจริง</div>
              <div className="text-xl font-bold text-stone-900 tabular-nums">
                ฿{formatBaht(totalExpenses)}
                <span className="text-xs font-normal text-stone-400 ml-1">
                  / ฿{formatBaht(budgetLimit)}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-stone-500">
                {isOverBudget ? "เกินงบไป" : "งบคงเหลือ"}
              </div>
              <div
                className={`text-xl font-bold tabular-nums ${
                  isOverBudget ? "text-rose-600" : "text-emerald-700"
                }`}
              >
                ฿{formatBaht(Math.abs(budgetRemaining))}
              </div>
            </div>
          </div>

          <div className="w-full h-2.5 rounded-full bg-stone-100 overflow-hidden">
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
          <div className="text-[11px] text-stone-400 tabular-nums">
            ใช้งบไปแล้ว {budgetUsagePct}%
          </div>
        </div>

        <hr className="border-stone-100" />

        {/* Part B: Break-even Progress */}
        <div className="space-y-2.5">
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <div className="text-xs text-stone-500">สถานะจุดคุ้มทุน</div>
              {isBreakEven ? (
                <div className="text-lg font-bold text-emerald-700 flex items-center gap-1.5 mt-0.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>กำไรสุทธิ +฿{formatBaht(netProfit)}</span>
                </div>
              ) : (
                <div className="text-lg font-bold text-stone-900 mt-0.5 tabular-nums">
                  ขาดอีก{" "}
                  <span className="text-amber-700">
                    ฿{formatBaht(Math.abs(netProfit))}
                  </span>{" "}
                  จะคืนทุน
                </div>
              )}
            </div>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold tabular-nums ${
                isBreakEven
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-800"
              }`}
            >
              {breakEvenPct}%
            </span>
          </div>

          <div className="w-full h-2.5 rounded-full bg-stone-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                isBreakEven ? "bg-emerald-500" : "bg-amber-500"
              }`}
              style={{ width: `${breakEvenPct}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-stone-500 pt-0.5 tabular-nums">
            <span>
              รายรับรวม (ไม่รวม void):{" "}
              <strong className="text-stone-800 font-semibold">
                ฿{formatBaht(totalRevenueAll)}
              </strong>
            </span>
            <span>
              รายจ่ายจริง:{" "}
              <strong className="text-stone-800 font-semibold">
                ฿{formatBaht(totalExpenses)}
              </strong>
            </span>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 2. END-OF-DAY SALES RECONCILE                                       */}
      {/* =================================================================== */}
      <section
        aria-label="สรุปยอดขายปิดวัน"
        className="rounded-3xl bg-white border border-[#EDE6D8] shadow-[0_2px_14px_-4px_rgba(120,74,12,0.06)] p-5 space-y-4"
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-stone-900">
              สรุปยอดขายปิดวัน
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">{filterDisplayLabel}</p>
          </div>

          <button
            type="button"
            onClick={handleCopySummary}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all active:scale-95 inline-flex items-center gap-1.5 ${
              copiedSummary
                ? "bg-emerald-600 text-white"
                : "bg-stone-900 hover:bg-stone-800 text-white"
            }`}
          >
            {copiedSummary ? (
              <>
                <ClipboardCheck className="w-3.5 h-3.5" />
                คัดลอกแล้ว
              </>
            ) : (
              <>
                <ClipboardCopy className="w-3.5 h-3.5" />
                คัดลอกสรุปยอดส่งแชท
              </>
            )}
          </button>
        </div>

        {/* Date Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          <button
            type="button"
            onClick={() => setSalesFilter("today")}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
              salesFilter === "today"
                ? "bg-stone-900 text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200/70"
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
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  salesFilter === dk
                    ? "bg-stone-900 text-white"
                    : "bg-stone-100 text-stone-600 hover:bg-stone-200/70"
                }`}
              >
                {formatThaiDateLabel(dk)}
              </button>
            ))}

          <button
            type="button"
            onClick={() => setSalesFilter("all")}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
              salesFilter === "all"
                ? "bg-stone-900 text-white"
                : "bg-stone-100 text-stone-600 hover:bg-stone-200/70"
            }`}
          >
            รวมทั้งหมด
          </button>
        </div>

        {/* MAKE Transfer + Cash Reconcile */}
        <div className="grid grid-cols-2 gap-3">
          {/* MAKE Card */}
          <div className="rounded-2xl bg-teal-50/75 border border-teal-200/70 p-3.5 space-y-1">
            <div className="flex items-center justify-between gap-1">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-teal-800">
                <Wallet className="w-3.5 h-3.5" />
                โอน (MAKE)
              </span>
              <span className="text-[11px] font-medium text-teal-700 tabular-nums">
                {salesStats.makeCount} บิล
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-teal-950 tabular-nums tracking-tight pt-0.5">
              ฿{formatBaht(salesStats.makeTotal)}
            </div>
            <p className="text-[11px] text-teal-700/80">
              เทียบ MAKE Cloud Pocket
            </p>
          </div>

          {/* Cash Card */}
          <div className="rounded-2xl bg-stone-50 border border-stone-200/80 p-3.5 space-y-1">
            <div className="flex items-center justify-between gap-1">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-stone-700">
                <Banknote className="w-3.5 h-3.5 text-amber-700" />
                เงินสด
              </span>
              <span className="text-[11px] font-medium text-stone-500 tabular-nums">
                {salesStats.cashCount} บิล
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-bold text-stone-900 tabular-nums tracking-tight pt-0.5">
              ฿{formatBaht(salesStats.cashTotal)}
            </div>
            <p className="text-[11px] text-stone-500">ไม่รวมเงินทอนตั้งต้น</p>
          </div>
        </div>

        {/* Clean Total & Cups Breakdown */}
        <div className="pt-1 space-y-3">
          <div className="flex items-center justify-between py-2.5 border-y border-stone-100">
            <div>
              <div className="text-xs text-stone-500">
                ยอดขายรวม ({salesStats.totalBills} บิล)
              </div>
              <div className="text-lg font-bold text-stone-900 tabular-nums">
                ฿{formatBaht(salesStats.totalRevenue)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-stone-500">ขายได้ทั้งหมด</div>
              <div className="text-lg font-bold text-amber-700 tabular-nums">
                {salesStats.totalCups} แก้ว
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <div className="font-medium text-stone-400">แยกตามเมนู</div>
              {salesStats.menuEntries.length === 0 ? (
                <div className="text-stone-400">—</div>
              ) : (
                <ul className="space-y-1">
                  {salesStats.menuEntries.map(([name, qty]) => (
                    <li
                      key={name}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="text-stone-700 truncate">{name}</span>
                      <span className="font-semibold text-stone-900 tabular-nums shrink-0">
                        {qty} แก้ว
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="font-medium text-stone-400">ท็อปปิ้งที่ออก</div>
              {salesStats.toppingEntries.length === 0 ? (
                <div className="text-stone-400">—</div>
              ) : (
                <ul className="space-y-1">
                  {salesStats.toppingEntries.map(([name, qty]) => (
                    <li
                      key={name}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="text-stone-700 truncate">+{name}</span>
                      <span className="font-semibold text-stone-900 tabular-nums shrink-0">
                        {qty} ที่
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Cup Stock & Yield Section */}
          <div className="pt-3 border-t border-stone-100 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-stone-700">
                สต็อกแก้ว &amp; ค่า Yield
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200/80 text-amber-900 text-xs font-bold tabular-nums">
                Yield {wasteStats.yieldPct}%
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-stone-50 border border-stone-200/70 py-2 px-2">
                <div className="text-[11px] text-stone-500">ขายได้</div>
                <div className="text-sm font-bold text-stone-900 tabular-nums mt-0.5">
                  {salesStats.totalCups} ใบ
                </div>
              </div>
              <div className="rounded-xl bg-rose-50/70 border border-rose-200/70 py-2 px-2">
                <div className="text-[11px] text-rose-700">ทำเสีย (Waste)</div>
                <div className="text-sm font-bold text-rose-700 tabular-nums mt-0.5">
                  {wasteStats.wasteCups} ใบ
                </div>
              </div>
              <div className="rounded-xl bg-amber-50/70 border border-amber-200/70 py-2 px-2">
                <div className="text-[11px] text-amber-900">ใช้แก้วรวม</div>
                <div className="text-sm font-bold text-amber-950 tabular-nums mt-0.5">
                  {wasteStats.totalCupsUsed} ใบ
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 text-xs text-stone-500">
              <span>ท็อปปิ้งที่เสียไป:</span>
              {wasteStats.wasteToppingEntries.length === 0 ? (
                <span className="text-stone-400">ไม่มีท็อปปิ้งเสีย</span>
              ) : (
                <span className="font-semibold text-rose-700 tabular-nums text-right">
                  {wasteStats.wasteToppingEntries
                    .map(([name, qty]) => `+${name} ${qty} ที่`)
                    .join(" · ")}
                </span>
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
        className="rounded-3xl bg-white border border-stone-200/80 shadow-[0_2px_14px_-4px_rgba(28,25,23,0.06)] p-5 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-stone-900">
            บันทึกรายจ่าย
          </h2>
          <span className="text-sm font-bold text-stone-900 tabular-nums">
            รวม ฿{formatBaht(totalExpenses)}
          </span>
        </div>

        {/* Add Expense Form */}
        <form onSubmit={handleSubmitExpense} className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={expenseTitle}
              onChange={(e) => setExpenseTitle(e.target.value)}
              placeholder="รายการที่ซื้อเพิ่ม (เช่น น้ำแข็ง, ถ้วย)..."
              className="flex-1 min-w-0 min-h-[44px] px-3.5 py-2 rounded-xl bg-stone-50 border border-stone-200/80 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-amber-400 focus:bg-white"
            />
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={expenseAmount}
              onChange={(e) => setExpenseAmount(e.target.value)}
              placeholder="บาท"
              className="w-24 shrink-0 min-h-[44px] px-3 py-2 rounded-xl bg-stone-50 border border-stone-200/80 text-sm font-semibold text-stone-900 tabular-nums text-right placeholder:text-stone-400 focus:outline-none focus:border-amber-400 focus:bg-white"
            />
          </div>
          <button
            type="submit"
            disabled={!expenseTitle.trim() || !expenseAmount}
            className="w-full min-h-[42px] px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 disabled:bg-stone-200 disabled:text-stone-400 text-white font-semibold text-sm flex items-center justify-center gap-1.5 transition-colors active:scale-[0.99]"
          >
            <Plus className="w-4 h-4" />
            เพิ่มรายจ่าย
          </button>
        </form>

        {/* Expense List */}
        {expenses.length === 0 ? (
          <div className="py-5 text-center text-xs text-stone-400 border-t border-stone-100">
            ยังไม่มีรายการรายจ่าย
          </div>
        ) : (
          <ul className="divide-y divide-stone-100 border-t border-stone-100">
            {expenses.map((expense) => {
              const isEditing = editingExpenseId === expense.id;
              return (
                <li key={expense.id} className="py-3 first:pt-3 last:pb-0">
                  {isEditing ? (
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={editExpenseTitle}
                        onChange={(e) => setEditExpenseTitle(e.target.value)}
                        className="w-full min-h-[40px] px-3 py-1.5 rounded-xl border border-amber-400 text-sm font-medium text-stone-900 focus:outline-none"
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          inputMode="numeric"
                          value={editExpenseAmount}
                          onChange={(e) => setEditExpenseAmount(e.target.value)}
                          className="w-28 min-h-[38px] px-3 py-1.5 rounded-xl border border-amber-400 text-sm font-semibold text-stone-900 tabular-nums focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={saveEditExpense}
                          className="min-h-[38px] px-3.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold inline-flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          บันทึก
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingExpenseId(null)}
                          className="min-h-[38px] px-3 rounded-xl bg-stone-100 text-stone-600 text-xs font-medium"
                        >
                          ยกเลิก
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-stone-900 leading-snug">
                          {expense.title}
                        </div>
                        <div className="text-[11px] text-stone-400 mt-0.5">
                          {formatThaiDateLabel(expense.dateKey)}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-sm font-bold text-stone-900 tabular-nums mr-1.5">
                          ฿{formatBaht(expense.amount)}
                        </span>
                        <button
                          type="button"
                          aria-label={`แก้ไข ${expense.title}`}
                          onClick={() => startEditExpense(expense)}
                          className="w-8 h-8 rounded-xl text-stone-400 hover:bg-stone-100 hover:text-stone-700 flex items-center justify-center"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`ลบ ${expense.title}`}
                          onClick={() => onDeleteExpense(expense.id)}
                          className="w-8 h-8 rounded-xl text-stone-400 hover:bg-rose-50 hover:text-rose-600 flex items-center justify-center"
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
      {/* 4. RIGHT ROW 2: MENU EDITOR + BACKUP & CLEAR TEST BILLS             */}
      {/* =================================================================== */}
      <div className="space-y-4">
        <section
          aria-label="ตั้งค่าเมนูและราคา"
          className="rounded-3xl bg-white border border-[#EDE6D8] overflow-hidden"
        >
        <button
          type="button"
          onClick={() => setMenuEditorOpen((prev) => !prev)}
          aria-expanded={menuEditorOpen}
          className="w-full min-h-[50px] px-4 py-3 flex items-center justify-between text-left hover:bg-stone-50/70 transition-colors"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-stone-700">
            <Settings2 className="w-4 h-4 text-stone-400" />
            แก้ไขราคา / เพิ่มเมนู &amp; ท็อปปิ้ง
          </span>
          {menuEditorOpen ? (
            <ChevronUp className="w-4 h-4 text-stone-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-stone-400" />
          )}
        </button>

        {menuEditorOpen && (
          <div className="border-t border-stone-100 p-4 space-y-5">
            {/* Menus */}
            <div className="space-y-2.5">
              <h3 className="text-xs font-semibold text-stone-500">เมนูหลัก</h3>
              <div className="space-y-2">
                {settings.menus.map((menu) => (
                  <div key={menu.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={menu.name}
                      onChange={(e) =>
                        handleUpdateMenuName(menu.id, e.target.value)
                      }
                      className="flex-1 min-w-0 min-h-[38px] px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200/80 text-sm font-medium text-stone-900"
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      value={menu.price}
                      onChange={(e) =>
                        handleUpdateMenuPrice(menu.id, e.target.value)
                      }
                      className="w-20 min-h-[38px] px-2.5 py-1.5 rounded-xl bg-stone-50 border border-stone-200/80 text-sm font-semibold text-stone-900 tabular-nums text-right"
                    />
                    <button
                      type="button"
                      onClick={() => handleToggleMenuActive(menu.id)}
                      className={`min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-medium shrink-0 ${
                        menu.active
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-stone-100 text-stone-500"
                      }`}
                    >
                      {menu.active ? "เปิด" : "ซ่อน"}
                    </button>
                  </div>
                ))}
              </div>
              <form
                onSubmit={handleAddNewMenu}
                className="flex items-center gap-2 pt-1"
              >
                <input
                  type="text"
                  value={newMenuName}
                  onChange={(e) => setNewMenuName(e.target.value)}
                  placeholder="เพิ่มเมนูใหม่..."
                  className="flex-1 min-w-0 min-h-[38px] px-3 py-1.5 rounded-xl bg-white border border-stone-200 text-xs"
                />
                <input
                  type="number"
                  inputMode="numeric"
                  value={newMenuPrice}
                  onChange={(e) => setNewMenuPrice(e.target.value)}
                  placeholder="ราคา"
                  className="w-20 min-h-[38px] px-2.5 py-1.5 rounded-xl bg-white border border-stone-200 text-xs font-semibold tabular-nums text-right"
                />
                <button
                  type="submit"
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-stone-900 text-white text-xs font-semibold shrink-0"
                >
                  + เพิ่ม
                </button>
              </form>
            </div>

            {/* Toppings */}
            <div className="space-y-2.5 pt-3 border-t border-stone-100">
              <h3 className="text-xs font-semibold text-stone-500">ท็อปปิ้ง</h3>
              <div className="space-y-2">
                {settings.toppings.map((topping) => (
                  <div key={topping.id} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={topping.name}
                      onChange={(e) =>
                        handleUpdateToppingName(topping.id, e.target.value)
                      }
                      className="flex-1 min-w-0 min-h-[38px] px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200/80 text-sm font-medium text-stone-900"
                    />
                    <input
                      type="number"
                      inputMode="numeric"
                      value={topping.price}
                      onChange={(e) =>
                        handleUpdateToppingPrice(topping.id, e.target.value)
                      }
                      className="w-20 min-h-[38px] px-2.5 py-1.5 rounded-xl bg-stone-50 border border-stone-200/80 text-sm font-semibold text-stone-900 tabular-nums text-right"
                    />
                    <button
                      type="button"
                      onClick={() => handleToggleToppingActive(topping.id)}
                      className={`min-h-[38px] px-2.5 py-1.5 rounded-xl text-xs font-medium shrink-0 ${
                        topping.active
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-stone-100 text-stone-500"
                      }`}
                    >
                      {topping.active ? "เปิด" : "ซ่อน"}
                    </button>
                  </div>
                ))}
              </div>
              <form
                onSubmit={handleAddNewTopping}
                className="flex items-center gap-2 pt-1"
              >
                <input
                  type="text"
                  value={newToppingName}
                  onChange={(e) => setNewToppingName(e.target.value)}
                  placeholder="เพิ่มท็อปปิ้งใหม่..."
                  className="flex-1 min-w-0 min-h-[38px] px-3 py-1.5 rounded-xl bg-white border border-stone-200 text-xs"
                />
                <input
                  type="number"
                  inputMode="numeric"
                  value={newToppingPrice}
                  onChange={(e) => setNewToppingPrice(e.target.value)}
                  placeholder="ราคา"
                  className="w-20 min-h-[38px] px-2.5 py-1.5 rounded-xl bg-white border border-stone-200 text-xs font-semibold tabular-nums text-right"
                />
                <button
                  type="submit"
                  className="min-h-[38px] px-3 py-1.5 rounded-xl bg-stone-900 text-white text-xs font-semibold shrink-0"
                >
                  + เพิ่ม
                </button>
              </form>
            </div>
          </div>
        )}
      </section>

      {/* =================================================================== */}
      {/* 4B. BACKUP & CLEAR TEST BILLS (ALWAYS DIRECTLY ACCESSIBLE)          */}
      {/* =================================================================== */}
      <section
        aria-label="สำรองข้อมูลและล้างบิลทดสอบ"
        className="rounded-2xl bg-white border border-stone-200/80 p-4 space-y-3"
      >
        <div className="text-xs font-semibold text-stone-500">
          สำรองข้อมูล &amp; เคลียร์ก่อนเปิดร้าน
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onExportJson}
            className="min-h-[42px] px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200/70 text-stone-700 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98]"
          >
            <Download className="w-4 h-4 text-stone-500" />
            Export JSON
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[42px] px-3 py-2 rounded-xl bg-stone-100 hover:bg-stone-200/70 text-stone-700 text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-[0.98]"
          >
            <Upload className="w-4 h-4 text-stone-500" />
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

        <div className="pt-2 border-t border-stone-100">
          <button
            type="button"
            onClick={() => {
              if (orders.length === 0) {
                onNotify("ยังไม่มีบิลให้ล้าง (คิวพร้อมเริ่มที่ #01)");
                return;
              }
              setConfirmClearOpen(true);
            }}
            className={`w-full min-h-[46px] px-4 py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 transition-colors active:scale-[0.99] ${
              orders.length > 0
                ? "bg-rose-50/70 hover:bg-rose-100/80 border-rose-200 text-rose-700"
                : "bg-stone-50 border-stone-200 text-stone-400"
            }`}
          >
            <span className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 shrink-0" />
              <span>ล้างเฉพาะบิลทดสอบ</span>
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums ${
                orders.length > 0
                  ? "bg-rose-600 text-white"
                  : "bg-stone-200 text-stone-500"
              }`}
            >
              {orders.length} บิล
            </span>
          </button>
          <p className="text-[11px] text-stone-400 mt-1.5 px-0.5">
            ลบเฉพาะออเดอร์และรีเซ็ตคิวเป็น #01 โดยไม่ลบรายการรายจ่าย (฿
            {formatBaht(totalExpenses)})
          </p>
        </div>
      </section>
      </div>
      </div>

      {confirmModal}
    </>
  );
}
