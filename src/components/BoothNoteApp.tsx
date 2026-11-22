"use client";

import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  CheckCircle2,
  ClipboardList,
  PieChart,
  WifiOff,
  AlertCircle,
} from "lucide-react";
import {
  BoothSettings,
  NewOrderItemInput,
  OrderStatus,
  PaymentMethod,
  formatQueueNumber,
  formatThaiDateLabel,
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
      }, 2400);
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

  const pendingCount = useMemo(
    () => orders.filter((o) => o.status === "pending").length,
    [orders]
  );

  const todayKey = hydrated ? getThailandDateKey() : "";
  const todayLabel = todayKey ? formatThaiDateLabel(todayKey) : "วันนี้";

  const handleAddOrder = useCallback(
    (input: {
      items: NewOrderItemInput[];
      noteTags: string[];
      note: string;
      paymentMethod: PaymentMethod;
    }) => {
      const { order } = localStorageBoothAdapter.addOrder(input);
      showToast(`บันทึกคิว ${formatQueueNumber(order.queueNumber)} แล้ว`);
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
    <div className="min-h-dvh flex flex-col bg-[#F6F5F2]">
      {/* Minimal Sticky Header */}
      <header className="sticky top-0 z-30 bg-[#F6F5F2]/90 backdrop-blur-md border-b border-stone-200/70">
        <div className="max-w-xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-amber-500 text-white font-bold text-sm flex items-center justify-center shadow-2xs">
              B
            </span>
            <div>
              <h1 className="text-[15px] font-bold text-stone-900 leading-none">
                {settings.boothName}
              </h1>
              <p className="text-[11px] text-stone-400 mt-0.5">{todayLabel}</p>
            </div>
          </div>

          {!isOnline ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100/90 text-amber-900 text-[11px] font-medium">
              <WifiOff className="w-3 h-3" />
              ออฟไลน์
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-stone-200/80 text-stone-500 text-[11px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              พร้อมออฟไลน์
            </span>
          )}
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
      <main className="flex-1 w-full max-w-xl mx-auto px-4 pt-4 pb-32">
        {!hydrated ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-72 rounded-3xl bg-white border border-stone-200/70" />
            <div className="h-32 rounded-2xl bg-white border border-stone-200/70" />
          </div>
        ) : activeTab === "order" ? (
          <OrderTab
            orders={orders}
            settings={settings}
            todayKey={todayKey}
            onAddOrder={handleAddOrder}
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

      {/* Airy Fixed 2-Tab Bottom Navigation Bar */}
      <nav
        aria-label="เมนูหลักด้านล่าง"
        className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200/80 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        <div className="max-w-xl mx-auto px-4 pt-2 pb-1 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleSwitchTab("order")}
            aria-current={activeTab === "order" ? "page" : undefined}
            className={`min-h-[48px] rounded-2xl px-3 py-2 flex items-center justify-center gap-2 text-sm font-semibold transition-all active:scale-[0.98] ${
              activeTab === "order"
                ? "bg-amber-50 text-amber-900"
                : "text-stone-500 hover:bg-stone-50"
            }`}
          >
            <ClipboardList
              className={`w-5 h-5 shrink-0 ${
                activeTab === "order" ? "text-amber-600" : "text-stone-400"
              }`}
            />
            <span>จดออเดอร์</span>
            {pendingCount > 0 && (
              <span
                className={`min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold tabular-nums inline-flex items-center justify-center ${
                  activeTab === "order"
                    ? "bg-amber-500 text-white"
                    : "bg-stone-200 text-stone-700"
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
            className={`min-h-[48px] rounded-2xl px-3 py-2 flex items-center justify-center gap-2 text-sm font-semibold transition-all active:scale-[0.98] ${
              activeTab === "budget"
                ? "bg-amber-50 text-amber-900"
                : "text-stone-500 hover:bg-stone-50"
            }`}
          >
            <PieChart
              className={`w-5 h-5 shrink-0 ${
                activeTab === "budget" ? "text-amber-600" : "text-stone-400"
              }`}
            />
            <span>งบ &amp; สรุปยอด</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
