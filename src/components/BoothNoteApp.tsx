"use client";

import React, { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { ClipboardList, PieChart, WifiOff } from "lucide-react";
import {
  BoothSettings,
  NewOrderItemInput,
  OrderStatus,
  PaymentMethod,
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
      return order;
    },
    []
  );

  const handleUpdateOrderStatus = useCallback(
    (orderId: string, status: OrderStatus) => {
      localStorageBoothAdapter.updateOrderStatus(orderId, status);
    },
    []
  );

  const handleUpdateSettings = useCallback((next: BoothSettings) => {
    localStorageBoothAdapter.saveSettings(next);
  }, []);

  const handleAddExpense = useCallback(
    (input: { title: string; amount: number }) => {
      localStorageBoothAdapter.addExpense(input);
    },
    []
  );

  const handleUpdateExpense = useCallback(
    (id: string, patch: { title: string; amount: number }) => {
      localStorageBoothAdapter.updateExpense(id, patch);
    },
    []
  );

  const handleDeleteExpense = useCallback((id: string) => {
    localStorageBoothAdapter.deleteExpense(id);
  }, []);

  const handleClearOrdersOnly = useCallback(() => {
    localStorageBoothAdapter.clearOrdersOnly();
  }, []);

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
  }, []);

  const handleImportJson = useCallback((raw: string) => {
    localStorageBoothAdapter.importAllData(raw);
  }, []);

  return (
    <div className="min-h-dvh flex flex-col bg-[#FFFBF2]">
      {/* Compact Sticky App Header */}
      <header className="sticky top-0 z-30 bg-[#FFFBF2]/90 backdrop-blur-md border-b border-[#E9DFCE]">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-amber-500 text-white font-black text-base flex items-center justify-center shadow-xs">
              B
            </span>
            <div>
              <h1 className="text-base font-extrabold text-stone-900 leading-none">
                {settings.boothName}
              </h1>
              <p className="text-[11px] font-medium text-stone-500 mt-0.5">
                {todayLabel} · เวลาไทย (+07:00)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {!isOnline ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 text-[11px] font-bold">
                <WifiOff className="w-3 h-3" />
                โหมดออฟไลน์
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-stone-100 text-stone-600 text-[11px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                พร้อมใช้งานออฟไลน์
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Scrollable Content */}
      <main className="flex-1 w-full max-w-2xl mx-auto px-3.5 sm:px-5 pt-4 pb-28">
        {!hydrated ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-72 rounded-3xl bg-white border border-[#E9DFCE]" />
            <div className="h-36 rounded-3xl bg-white border border-[#E9DFCE]" />
          </div>
        ) : activeTab === "order" ? (
          <OrderTab
            orders={orders}
            settings={settings}
            todayKey={todayKey}
            onAddOrder={handleAddOrder}
            onUpdateOrderStatus={handleUpdateOrderStatus}
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
          />
        )}
      </main>

      {/* Fixed 2-Tab Bottom Navigation Bar */}
      <nav
        aria-label="เมนูหลักด้านล่าง"
        className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#E9DFCE] shadow-[0_-4px_20px_-6px_rgba(28,25,23,0.08)] pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        <div className="max-w-2xl mx-auto px-3 pt-1.5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("order")}
            aria-current={activeTab === "order" ? "page" : undefined}
            className={`min-h-[54px] rounded-2xl px-3 py-2 flex items-center justify-center gap-2 font-extrabold text-sm transition-all active:scale-[0.98] ${
              activeTab === "order"
                ? "bg-stone-900 text-amber-300 shadow-xs"
                : "text-stone-600 hover:bg-stone-100"
            }`}
          >
            <ClipboardList className="w-5 h-5 shrink-0" />
            <span>จดออเดอร์</span>
            {pendingCount > 0 && (
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-extrabold tabular-nums ${
                  activeTab === "order"
                    ? "bg-amber-400 text-stone-900"
                    : "bg-amber-500 text-white"
                }`}
              >
                {pendingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("budget")}
            aria-current={activeTab === "budget" ? "page" : undefined}
            className={`min-h-[54px] rounded-2xl px-3 py-2 flex items-center justify-center gap-2 font-extrabold text-sm transition-all active:scale-[0.98] ${
              activeTab === "budget"
                ? "bg-stone-900 text-amber-300 shadow-xs"
                : "text-stone-600 hover:bg-stone-100"
            }`}
          >
            <PieChart className="w-5 h-5 shrink-0" />
            <span>งบ &amp; สรุปยอด</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
