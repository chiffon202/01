"use client";

import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  PieChart,
  WifiOff,
} from "lucide-react";
import {
  BoothSettings,
  NewOrderItemInput,
  OrderStatus,
  PaymentMethod,
  formatBaht,
  formatQueueNumber,
  getExpensesSnapshot,
  getOrdersSnapshot,
  getServerExpensesSnapshot,
  getServerOrdersSnapshot,
  getServerSettingsSnapshot,
  getSettingsSnapshot,
  getThailandDateKey,
  localStorageBoothAdapter,
  subscribeStorageChange,
} from "@/lib/storage";
import { OrderTab } from "@/components/OrderTab";
import { BudgetTab } from "@/components/BudgetTab";

type ActiveTab = "order" | "budget";

interface ToastState {
  message: string;
  tone: "success" | "error";
}

const emptySubscribe = () => () => {};

function subscribeOnlineStatus(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function BoothNoteApp() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("order");
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback(
    (message: string, tone: "success" | "error" = "success") => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      setToast({ message, tone });
      toastTimerRef.current = window.setTimeout(() => {
        setToast(null);
        toastTimerRef.current = null;
      }, 2200);
    },
    []
  );

  const hydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const isOnline = useSyncExternalStore(
    subscribeOnlineStatus,
    () => navigator.onLine,
    () => true
  );

  const orders = useSyncExternalStore(
    subscribeStorageChange,
    getOrdersSnapshot,
    getServerOrdersSnapshot
  );

  const expenses = useSyncExternalStore(
    subscribeStorageChange,
    getExpensesSnapshot,
    getServerExpensesSnapshot
  );

  const settings = useSyncExternalStore(
    subscribeStorageChange,
    getSettingsSnapshot,
    getServerSettingsSnapshot
  );

  const todayKey = hydrated ? getThailandDateKey() : "";

  const pendingCount = useMemo(
    () => orders.filter((o) => o.status === "pending").length,
    [orders]
  );

  const todaySummary = useMemo(() => {
    if (!todayKey) return { cups: 0, revenue: 0 };
    let cups = 0;
    let revenue = 0;
    for (const order of orders) {
      if (
        order.dateKey !== todayKey ||
        order.status === "void" ||
        order.status === "waste"
      ) {
        continue;
      }
      revenue += order.totalAmount;
      for (const item of order.items) {
        cups += item.quantity;
      }
    }
    return { cups, revenue };
  }, [orders, todayKey]);

  const handleAddOrder = useCallback(
    (input: {
      items: NewOrderItemInput[];
      noteTags: string[];
      note: string;
      paymentMethod: PaymentMethod;
    }) => {
      const { order } = localStorageBoothAdapter.addOrder(input);
      showToast(`ส่งคิว ${formatQueueNumber(order.queueNumber)} แล้ว`);
      return order;
    },
    [showToast]
  );

  const handleAddWasteOrder = useCallback(
    (input: { items: NewOrderItemInput[]; reason: string }) => {
      const { order } = localStorageBoothAdapter.addWasteOrder(input);
      const cupsCount = order.items.reduce((s, i) => s + i.quantity, 0);
      showToast(`บันทึกทำเสีย ${cupsCount} แก้ว (${order.note}) แล้ว`);
      return order;
    },
    [showToast]
  );

  const handleUpdateOrderStatus = useCallback(
    (orderId: string, status: OrderStatus) => {
      localStorageBoothAdapter.updateOrderStatus(orderId, status);
      if (status === "done") {
        showToast("ส่งของเรียบร้อยแล้ว");
      } else if (status === "void") {
        showToast("ยกเลิกบิลแล้ว");
      } else {
        showToast("กู้คืนเข้าคิวรอทำแล้ว");
      }
    },
    [showToast]
  );

  const handleDeleteOrder = useCallback(
    (orderId: string) => {
      localStorageBoothAdapter.deleteOrder(orderId);
      showToast("ลบบิลออกจากประวัติแล้ว");
    },
    [showToast]
  );

  const handleUpdateSettings = useCallback((next: BoothSettings) => {
    localStorageBoothAdapter.saveSettings(next);
  }, []);

  const handleAddExpense = useCallback(
    (input: { title: string; amount: number }) => {
      localStorageBoothAdapter.addExpense(input);
      showToast(`บันทึกรายจ่าย "${input.title}" แล้ว`);
    },
    [showToast]
  );

  const handleUpdateExpense = useCallback(
    (id: string, patch: { title: string; amount: number }) => {
      localStorageBoothAdapter.updateExpense(id, patch);
      showToast("แก้ไขรายจ่ายแล้ว");
    },
    [showToast]
  );

  const handleDeleteExpense = useCallback(
    (id: string) => {
      localStorageBoothAdapter.deleteExpense(id);
      showToast("ลบรายการรายจ่ายแล้ว");
    },
    [showToast]
  );

  const handleClearOrdersOnly = useCallback(() => {
    const count = localStorageBoothAdapter.getOrders().length;
    localStorageBoothAdapter.clearOrdersOnly();
    showToast(`ล้างบิลทดสอบ ${count} บิลแล้ว · รีเซ็ตคิวเป็น #01`);
  }, [showToast]);

  const handleExportJson = useCallback(() => {
    const snapshot = localStorageBoothAdapter.exportAllData();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `booth-note-backup-${getThailandDateKey()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("ดาวน์โหลดไฟล์สำรอง JSON แล้ว");
  }, [showToast]);

  const handleImportJson = useCallback((raw: string) => {
    localStorageBoothAdapter.importAllData(raw);
  }, []);

  const handleSwitchTab = useCallback((nextTab: ActiveTab) => {
    setActiveTab(nextTab);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
  }, []);

  return (
    <div className="min-h-dvh flex flex-col bg-[#FBF8F1]">
      {/* =================================================================== */}
      {/* COMPACT TOP NAVIGATION BAR (LANDSCAPE-FIRST)                        */}
      {/* =================================================================== */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#EDE6D8]">
        <div className="max-w-7xl mx-auto px-3 sm:px-5 h-14 flex items-center justify-between gap-2">
          {/* Left: Brand + Realtime Today Summary */}
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-amber-400 text-stone-950 font-extrabold text-sm flex items-center justify-center shrink-0 shadow-2xs">
              B
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold text-stone-900 leading-none truncate">
                  {settings.boothName}
                </h1>
                {!isOnline ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-semibold shrink-0">
                    <WifiOff className="w-3 h-3" />
                    ออฟไลน์
                  </span>
                ) : (
                  <span
                    title="พร้อมใช้งานออฟไลน์ 100%"
                    className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"
                  />
                )}
              </div>
              <p className="text-[11px] sm:text-xs text-stone-500 font-medium tabular-nums truncate mt-0.5">
                วันนี้:{" "}
                <strong className="text-stone-800 font-semibold">
                  {todaySummary.cups} แก้ว
                </strong>{" "}
                |{" "}
                <strong className="text-amber-700 font-bold">
                  ฿{formatBaht(todaySummary.revenue)}
                </strong>
              </p>
            </div>
          </div>

          {/* Right: 2 Main Tab Switch Buttons */}
          <nav aria-label="เมนูหลักด้านบน" className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => handleSwitchTab("order")}
              aria-current={activeTab === "order" ? "page" : undefined}
              className={`min-h-[40px] px-3 sm:px-4 py-1.5 rounded-xl flex items-center gap-1.5 text-xs sm:text-sm font-semibold transition-all active:scale-[0.98] ${
                activeTab === "order"
                  ? "bg-stone-900 text-amber-300 shadow-2xs"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200/70"
              }`}
            >
              <ClipboardList className="w-4 h-4 shrink-0" />
              <span>จดออเดอร์</span>
              {pendingCount > 0 && (
                <span
                  className={`min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold tabular-nums inline-flex items-center justify-center ${
                    activeTab === "order"
                      ? "bg-amber-400 text-stone-950"
                      : "bg-orange-500 text-white"
                  }`}
                >
                  {pendingCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleSwitchTab("budget")}
              aria-current={activeTab === "budget" ? "page" : undefined}
              className={`min-h-[40px] px-3 sm:px-4 py-1.5 rounded-xl flex items-center gap-1.5 text-xs sm:text-sm font-semibold transition-all active:scale-[0.98] ${
                activeTab === "budget"
                  ? "bg-stone-900 text-amber-300 shadow-2xs"
                  : "bg-stone-100 text-stone-600 hover:bg-stone-200/70"
              }`}
            >
              <PieChart className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">งบ &amp; สรุปยอด</span>
              <span className="sm:hidden">งบ &amp; ยอด</span>
            </button>
          </nav>
        </div>
      </header>

      {/* Subtle Floating Toast Feedback */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed top-16 inset-x-0 z-50 flex justify-center px-4 pointer-events-none"
        >
          <div
            className={`px-4 py-2 rounded-full shadow-lg text-xs font-medium inline-flex items-center gap-2 ${
              toast.tone === "error"
                ? "bg-rose-600 text-white"
                : "bg-stone-900 text-white"
            }`}
          >
            {toast.tone === "error" ? (
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-5 pt-3 pb-4">
        {!hydrated ? (
          <div className="grid grid-cols-1 md:grid-cols-[65fr_35fr] gap-4 animate-pulse">
            <div className="h-72 rounded-3xl bg-white border border-[#EDE6D8]" />
            <div className="h-96 rounded-3xl bg-white border border-[#EDE6D8]" />
          </div>
        ) : activeTab === "order" ? (
          <OrderTab
            orders={orders}
            settings={settings}
            todayKey={todayKey}
            onAddOrder={handleAddOrder}
            onAddWasteOrder={handleAddWasteOrder}
            onUpdateOrderStatus={handleUpdateOrderStatus}
            onDeleteOrder={handleDeleteOrder}
          />
        ) : (
          <BudgetTab
            orders={orders}
            expenses={expenses}
            settings={settings}
            todayKey={todayKey}
            onUpdateSettings={handleUpdateSettings}
            onAddExpense={handleAddExpense}
            onUpdateExpense={handleUpdateExpense}
            onDeleteExpense={handleDeleteExpense}
            onClearOrdersOnly={handleClearOrdersOnly}
            onExportJson={handleExportJson}
            onImportJson={handleImportJson}
            onNotify={showToast}
          />
        )}
      </main>
    </div>
  );
}
