"use client";

import React, { useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Minus,
  Plus,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  Trash2,
  Wallet,
  X,
  Banknote,
  QrCode,
} from "lucide-react";
import {
  BoothSettings,
  NewOrderItemInput,
  Order,
  OrderStatus,
  PaymentMethod,
  formatBaht,
  formatQueueNumber,
  formatThaiDateLabel,
  formatThailandTime,
  getNextQueueNumberForDate,
} from "@/lib/storage";

interface OrderTabProps {
  orders: Order[];
  settings: BoothSettings;
  todayKey: string;
  onAddOrder: (input: {
    items: NewOrderItemInput[];
    noteTags: string[];
    note: string;
    paymentMethod: PaymentMethod;
  }) => Order;
  onUpdateOrderStatus: (orderId: string, status: OrderStatus) => void;
}

interface DraftBillItem extends NewOrderItemInput {
  draftKey: string;
}

function makeDraftKey(menuId: string, toppingIds: string[]): string {
  const sorted = [...toppingIds].sort().join(",");
  return `${menuId}::${sorted}`;
}

export function OrderTab({
  orders,
  settings,
  todayKey,
  onAddOrder,
  onUpdateOrderStatus,
}: OrderTabProps) {
  const activeMenus = useMemo(
    () => settings.menus.filter((m) => m.active),
    [settings.menus]
  );
  const activeToppings = useMemo(
    () => settings.toppings.filter((t) => t.active),
    [settings.toppings]
  );

  const [selectedMenuId, setSelectedMenuId] = useState<string>(
    () => activeMenus[0]?.id ?? settings.menus[0]?.id ?? ""
  );
  const [selectedToppingIds, setSelectedToppingIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState<number>(1);
  const [billItems, setBillItems] = useState<DraftBillItem[]>([]);
  const [selectedNoteTags, setSelectedNoteTags] = useState<string[]>([]);
  const [customNote, setCustomNote] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("make");
  const [historyOpen, setHistoryOpen] = useState<boolean>(false);
  const [justSavedQueue, setJustSavedQueue] = useState<string | null>(null);

  // Ensure selectedMenuId stays valid if menus were edited in Settings
  const currentMenu = useMemo(() => {
    return (
      activeMenus.find((m) => m.id === selectedMenuId) ??
      activeMenus[0] ??
      settings.menus[0]
    );
  }, [activeMenus, selectedMenuId, settings.menus]);

  const currentToppings = useMemo(() => {
    return activeToppings.filter((t) => selectedToppingIds.includes(t.id));
  }, [activeToppings, selectedToppingIds]);

  const builderUnitPrice = useMemo(() => {
    if (!currentMenu) return 0;
    const toppingsSum = currentToppings.reduce((sum, t) => sum + t.price, 0);
    return currentMenu.price + toppingsSum;
  }, [currentMenu, currentToppings]);

  const builderSubtotal = builderUnitPrice * quantity;

  const billItemsTotal = useMemo(() => {
    return billItems.reduce((sum, item) => {
      const topSum = item.toppings.reduce((s, t) => s + t.price, 0);
      return sum + (item.unitPrice + topSum) * item.quantity;
    }, 0);
  }, [billItems]);

  const effectiveTotal = billItems.length > 0 ? billItemsTotal : builderSubtotal;
  const effectiveCupCount =
    billItems.length > 0
      ? billItems.reduce((sum, i) => sum + i.quantity, 0)
      : quantity;

  const nextQueuePreview = useMemo(
    () => formatQueueNumber(getNextQueueNumberForDate(orders, todayKey)),
    [orders, todayKey]
  );

  // Pending queue: oldest first (FIFO)
  const pendingOrders = useMemo(() => {
    return orders
      .filter((o) => o.status === "pending")
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
  }, [orders]);

  // Today's completed or voided orders: newest first
  const todayHistoryOrders = useMemo(() => {
    return orders
      .filter(
        (o) =>
          o.dateKey === todayKey && (o.status === "done" || o.status === "void")
      )
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
  }, [orders, todayKey]);

  const toggleTopping = (toppingId: string) => {
    setSelectedToppingIds((prev) =>
      prev.includes(toppingId)
        ? prev.filter((id) => id !== toppingId)
        : [...prev, toppingId]
    );
  };

  const toggleNoteTag = (tag: string) => {
    setSelectedNoteTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleAddToBill = () => {
    if (!currentMenu) return;
    const draftKey = makeDraftKey(
      currentMenu.id,
      currentToppings.map((t) => t.id)
    );
    setBillItems((prev) => {
      const existingIdx = prev.findIndex((i) => i.draftKey === draftKey);
      if (existingIdx >= 0) {
        return prev.map((item, idx) =>
          idx === existingIdx
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [
        ...prev,
        {
          draftKey,
          menuId: currentMenu.id,
          menuName: currentMenu.name,
          unitPrice: currentMenu.price,
          toppings: currentToppings.map((t) => ({
            id: t.id,
            name: t.name,
            price: t.price,
          })),
          quantity,
        },
      ];
    });
    // Reset toppings & qty so next variation can be picked in 1 tap
    setSelectedToppingIds([]);
    setQuantity(1);
  };

  const handleAdjustBillItemQty = (draftKey: string, delta: number) => {
    setBillItems((prev) =>
      prev
        .map((item) =>
          item.draftKey === draftKey
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const handleRemoveBillItem = (draftKey: string) => {
    setBillItems((prev) => prev.filter((item) => item.draftKey !== draftKey));
  };

  const handleSaveOrder = () => {
    if (!currentMenu && billItems.length === 0) return;

    const itemsToSave: NewOrderItemInput[] =
      billItems.length > 0
        ? billItems.map((item) => ({
            menuId: item.menuId,
            menuName: item.menuName,
            unitPrice: item.unitPrice,
            toppings: item.toppings,
            quantity: item.quantity,
          }))
        : [
            {
              menuId: currentMenu.id,
              menuName: currentMenu.name,
              unitPrice: currentMenu.price,
              toppings: currentToppings.map((t) => ({
                id: t.id,
                name: t.name,
                price: t.price,
              })),
              quantity,
            },
          ];

    const created = onAddOrder({
      items: itemsToSave,
      noteTags: selectedNoteTags,
      note: customNote,
      paymentMethod,
    });

    // Clear form immediately for next customer
    setBillItems([]);
    setSelectedToppingIds([]);
    setQuantity(1);
    setSelectedNoteTags([]);
    setCustomNote("");
    setPaymentMethod("make");
    if (activeMenus[0]) {
      setSelectedMenuId(activeMenus[0].id);
    }

    const qLabel = formatQueueNumber(created.queueNumber);
    setJustSavedQueue(qLabel);
    window.setTimeout(() => {
      setJustSavedQueue((curr) => (curr === qLabel ? null : curr));
    }, 2200);
  };

  const hasUnaddedBuilderChanges =
    billItems.length > 0 && (selectedToppingIds.length > 0 || quantity > 1);

  return (
    <div className="space-y-5">
      {/* =================================================================== */}
      {/* TOP SECTION: 2-SECOND FAST ORDER ENTRY FORM                         */}
      {/* =================================================================== */}
      <section
        aria-label="ฟอร์มจดออเดอร์ด่วน"
        className="rounded-3xl bg-white border border-[#E9DFCE] shadow-[0_6px_24px_-8px_rgba(120,74,12,0.12)] p-4 sm:p-5 space-y-4"
      >
        {/* Header strip */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-amber-100 text-amber-800 font-bold text-sm">
              <Sparkles className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-base font-bold text-stone-900 leading-tight">
                จดออเดอร์หน้าร้าน
              </h2>
              <p className="text-xs text-stone-500">
                คิวถัดไป:{" "}
                <span className="font-bold text-amber-700 tabular-nums">
                  {nextQueuePreview}
                </span>
              </p>
            </div>
          </div>

          {justSavedQueue && (
            <div
              role="status"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold animate-pulse"
            >
              <CheckCircle2 className="w-4 h-4" />
              บันทึก {justSavedQueue} แล้ว
            </div>
          )}
        </div>

        {/* 1. Menu Selection */}
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            เมนูหลัก
          </div>
          <div
            className={`grid gap-2 ${
              activeMenus.length === 1 ? "grid-cols-1" : "grid-cols-2"
            }`}
          >
            {activeMenus.map((menu) => {
              const isSelected = currentMenu?.id === menu.id;
              return (
                <button
                  key={menu.id}
                  type="button"
                  onClick={() => setSelectedMenuId(menu.id)}
                  className={`min-h-[54px] px-4 py-3 rounded-2xl border-2 text-left transition-all active:scale-[0.98] flex items-center justify-between gap-2 ${
                    isSelected
                      ? "bg-amber-50 border-amber-500 text-stone-900 shadow-sm"
                      : "bg-stone-50 border-stone-200 text-stone-700 hover:border-amber-300"
                  }`}
                >
                  <span className="font-bold text-base leading-snug">
                    {menu.name}
                  </span>
                  <span
                    className={`shrink-0 px-2.5 py-1 rounded-xl text-sm font-extrabold tabular-nums ${
                      isSelected
                        ? "bg-amber-500 text-white"
                        : "bg-stone-200 text-stone-700"
                    }`}
                  >
                    ฿{formatBaht(menu.price)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Toppings Toggle + Quantity Stepper */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-start">
          {/* Toppings */}
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              ท็อปปิ้ง (กดเลือกได้หลายอย่าง)
            </div>
            <div className="grid grid-cols-2 gap-2">
              {activeToppings.map((topping) => {
                const active = selectedToppingIds.includes(topping.id);
                return (
                  <button
                    key={topping.id}
                    type="button"
                    onClick={() => toggleTopping(topping.id)}
                    aria-pressed={active}
                    className={`min-h-[50px] px-3 py-2.5 rounded-2xl border-2 font-bold text-sm transition-all active:scale-[0.97] flex items-center justify-between gap-1.5 ${
                      active
                        ? "bg-amber-500 border-amber-600 text-white shadow-sm"
                        : "bg-white border-stone-200 text-stone-800 hover:border-amber-300"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      {active ? (
                        <Check className="w-4 h-4 shrink-0" />
                      ) : (
                        <Plus className="w-4 h-4 shrink-0 text-amber-600" />
                      )}
                      <span className="truncate">{topping.name}</span>
                    </span>
                    <span
                      className={`text-xs font-extrabold tabular-nums shrink-0 ${
                        active ? "text-amber-100" : "text-amber-700"
                      }`}
                    >
                      +{formatBaht(topping.price)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quantity Stepper */}
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              จำนวนแก้ว
            </div>
            <div className="flex items-center justify-between sm:justify-start gap-2 bg-[#FAF5EB] border border-[#E9DFCE] rounded-2xl p-1.5">
              <button
                type="button"
                aria-label="ลดจำนวนแก้ว"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-12 h-11 rounded-xl bg-white border border-stone-200 flex items-center justify-center text-stone-800 active:scale-95 shadow-xs disabled:opacity-40"
                disabled={quantity <= 1}
              >
                <Minus className="w-5 h-5" />
              </button>
              <div className="min-w-[56px] text-center">
                <span className="text-xl font-extrabold tabular-nums text-stone-900">
                  {quantity}
                </span>
                <span className="text-xs text-stone-500 ml-1">แก้ว</span>
              </div>
              <button
                type="button"
                aria-label="เพิ่มจำนวนแก้ว"
                onClick={() => setQuantity((q) => q + 1)}
                className="w-12 h-11 rounded-xl bg-amber-500 text-white flex items-center justify-center active:scale-95 shadow-xs"
              >
                <Plus className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* 3. Add to Multi-Item Bill Button & Current Bill Preview */}
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={handleAddToBill}
            className={`w-full min-h-[46px] px-4 py-2.5 rounded-2xl border-2 font-bold text-sm transition-all active:scale-[0.99] flex items-center justify-center gap-2 ${
              hasUnaddedBuilderChanges
                ? "border-amber-500 bg-amber-50 text-amber-900 ring-2 ring-amber-300/60"
                : "border-dashed border-amber-400 bg-[#FFFDF8] text-amber-800 hover:bg-amber-50"
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>
              + เพิ่มลงรายการบิล ({currentMenu?.name}
              {currentToppings.length > 0
                ? ` +${currentToppings.map((t) => t.name).join(" +")}`
                : ""}{" "}
              ×{quantity} = ฿{formatBaht(builderSubtotal)})
            </span>
          </button>

          {billItems.length > 0 ? (
            <div className="rounded-2xl bg-[#FAF5EB] border border-[#E9DFCE] p-3 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-stone-600">
                <span>รายการในบิลนี้ ({billItems.length} แบบ)</span>
                <button
                  type="button"
                  onClick={() => setBillItems([])}
                  className="text-rose-600 hover:underline font-semibold"
                >
                  ล้างรายการบิล
                </button>
              </div>
              <ul className="space-y-1.5">
                {billItems.map((item) => {
                  const topSum = item.toppings.reduce((s, t) => s + t.price, 0);
                  const lineTotal = (item.unitPrice + topSum) * item.quantity;
                  return (
                    <li
                      key={item.draftKey}
                      className="flex items-center justify-between gap-2 bg-white rounded-xl px-3 py-2 border border-[#EFE6D6]"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-stone-900 truncate">
                          {item.menuName}
                        </div>
                        {item.toppings.length > 0 ? (
                          <div className="text-xs font-medium text-amber-700">
                            +{item.toppings.map((t) => t.name).join(", +")}
                          </div>
                        ) : (
                          <div className="text-xs text-stone-400">ธรรมดา</div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center gap-1 bg-stone-100 rounded-lg p-0.5">
                          <button
                            type="button"
                            aria-label="ลดรายการนี้"
                            onClick={() =>
                              handleAdjustBillItemQty(item.draftKey, -1)
                            }
                            className="w-7 h-7 rounded-md bg-white flex items-center justify-center text-stone-700 shadow-2xs active:scale-95"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-6 text-center text-sm font-bold tabular-nums">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            aria-label="เพิ่มรายการนี้"
                            onClick={() =>
                              handleAdjustBillItemQty(item.draftKey, 1)
                            }
                            className="w-7 h-7 rounded-md bg-white flex items-center justify-center text-stone-700 shadow-2xs active:scale-95"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <span className="min-w-[44px] text-right text-sm font-extrabold tabular-nums text-stone-900">
                          ฿{formatBaht(lineTotal)}
                        </span>

                        <button
                          type="button"
                          aria-label="ลบรายการนี้"
                          onClick={() => handleRemoveBillItem(item.draftKey)}
                          className="w-7 h-7 rounded-lg text-stone-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <div className="rounded-xl bg-[#FAF5EB]/70 border border-[#EFE6D6] px-3 py-2 flex items-center justify-between text-xs text-stone-600">
              <span>
                พร้อมบันทึกทันที:{" "}
                <strong className="text-stone-900">
                  {currentMenu?.name}
                  {currentToppings.length > 0
                    ? ` (+${currentToppings.map((t) => t.name).join(", +")})`
                    : " (ธรรมดา)"}
                </strong>{" "}
                ×{quantity} แก้ว
              </span>
              <span className="font-bold text-amber-800 tabular-nums">
                ฿{formatBaht(builderSubtotal)}
              </span>
            </div>
          )}
        </div>

        {/* 4. Quick Note Tags + Short Note Input */}
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {settings.quickNotes.map((tag) => {
              const active = selectedNoteTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleNoteTag(tag)}
                  aria-pressed={active}
                  className={`min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all active:scale-95 ${
                    active
                      ? "bg-stone-800 border-stone-800 text-amber-300 shadow-xs"
                      : "bg-stone-100 border-stone-200 text-stone-700 hover:bg-stone-200/70"
                  }`}
                >
                  {active ? "✓ " : "+ "}
                  {tag}
                </button>
              );
            })}
          </div>

          <div className="relative">
            <input
              type="text"
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="โน้ตเพิ่มเติมสั้นๆ (ถ้ามี)..."
              maxLength={80}
              className="w-full min-h-[42px] pl-3.5 pr-9 py-2 rounded-xl bg-stone-50 border border-stone-200 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white"
            />
            {customNote && (
              <button
                type="button"
                aria-label="ล้างโน้ต"
                onClick={() => setCustomNote("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-stone-200 text-stone-600 flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 5. Payment Method (2 large buttons: MAKE default vs Cash) */}
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => setPaymentMethod("make")}
            aria-pressed={paymentMethod === "make"}
            className={`min-h-[54px] px-3 py-2.5 rounded-2xl border-2 font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
              paymentMethod === "make"
                ? "bg-teal-600 border-teal-700 text-white shadow-sm"
                : "bg-teal-50/50 border-teal-200 text-teal-800 hover:bg-teal-50"
            }`}
          >
            <QrCode className="w-5 h-5 shrink-0" />
            <span className="text-sm sm:text-base">โอน (MAKE)</span>
          </button>

          <button
            type="button"
            onClick={() => setPaymentMethod("cash")}
            aria-pressed={paymentMethod === "cash"}
            className={`min-h-[54px] px-3 py-2.5 rounded-2xl border-2 font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
              paymentMethod === "cash"
                ? "bg-orange-600 border-orange-700 text-white shadow-sm"
                : "bg-orange-50/50 border-orange-200 text-orange-800 hover:bg-orange-50"
            }`}
          >
            <Banknote className="w-5 h-5 shrink-0" />
            <span className="text-sm sm:text-base">เงินสด</span>
          </button>
        </div>

        {/* 6. Big Total + Save Order CTA */}
        <div className="pt-1 flex items-stretch gap-3">
          <div className="shrink-0 min-w-[116px] rounded-2xl bg-[#FAF5EB] border border-[#E9DFCE] px-3.5 py-2 flex flex-col justify-center">
            <span className="text-[11px] font-semibold text-stone-500">
              ยอดรวม ({effectiveCupCount} แก้ว)
            </span>
            <span className="text-2xl sm:text-3xl font-extrabold text-stone-900 tabular-nums leading-tight">
              ฿{formatBaht(effectiveTotal)}
            </span>
          </div>

          <button
            type="button"
            onClick={handleSaveOrder}
            className="flex-1 min-h-[60px] px-5 py-3 rounded-2xl bg-stone-900 hover:bg-stone-800 text-amber-300 font-extrabold text-lg shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>บันทึกออเดอร์</span>
          </button>
        </div>
      </section>

      {/* =================================================================== */}
      {/* BOTTOM SECTION: LIVE PENDING QUEUE (OLDEST -> NEWEST)               */}
      {/* =================================================================== */}
      <section aria-label="รายการคิวที่กำลังรอทำ" className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-extrabold text-stone-900">
              คิวที่กำลังรอทำ
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-white text-xs font-extrabold tabular-nums">
              {pendingOrders.length}
            </span>
          </div>
          <span className="text-xs text-stone-500 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            มาก่อนอยู่บน
          </span>
        </div>

        {pendingOrders.length === 0 ? (
          <div className="rounded-3xl bg-white/80 border border-dashed border-[#DFD2BC] p-7 text-center space-y-1">
            <p className="text-sm font-bold text-stone-600">
              ยังไม่มีคิวรอทำในตอนนี้
            </p>
            <p className="text-xs text-stone-400">
              กด &ldquo;บันทึกออเดอร์&rdquo; ด้านบนเพื่อส่งคิวเข้าหน้าร้าน
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {pendingOrders.map((order) => {
              const isMake = order.paymentMethod === "make";
              const isOtherDay = order.dateKey !== todayKey;
              return (
                <article
                  key={order.id}
                  className="rounded-3xl bg-white border border-[#E9DFCE] shadow-xs overflow-hidden"
                >
                  <div className="p-4 space-y-3">
                    {/* Queue Header */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="px-3 py-1 rounded-xl bg-amber-100 border border-amber-300 text-amber-900 font-extrabold text-lg tabular-nums">
                          {formatQueueNumber(order.queueNumber)}
                        </span>
                        <div className="text-xs text-stone-500 tabular-nums">
                          <span>{formatThailandTime(order.createdAt)} น.</span>
                          {isOtherDay && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 font-medium">
                              {formatThaiDateLabel(order.dateKey)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                            isMake
                              ? "bg-teal-100 text-teal-800"
                              : "bg-orange-100 text-orange-800"
                          }`}
                        >
                          {isMake ? (
                            <Wallet className="w-3.5 h-3.5" />
                          ) : (
                            <Banknote className="w-3.5 h-3.5" />
                          )}
                          {isMake ? "โอน (MAKE)" : "เงินสด"}
                        </span>
                        <span className="text-xl font-extrabold text-stone-900 tabular-nums">
                          ฿{formatBaht(order.totalAmount)}
                        </span>
                      </div>
                    </div>

                    {/* Order Items */}
                    <ul className="space-y-1.5 bg-[#FAF7F0] rounded-2xl p-3 border border-[#EFE6D6]">
                      {order.items.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-baseline justify-between gap-2 text-base"
                        >
                          <div className="font-bold text-stone-900 leading-snug">
                            <span>{item.menuName}</span>
                            {item.toppings.length > 0 && (
                              <span className="text-amber-700 font-extrabold ml-1.5">
                                (+{item.toppings.map((t) => t.name).join(" +")})
                              </span>
                            )}
                          </div>
                          <span className="shrink-0 font-extrabold text-stone-900 tabular-nums bg-white px-2.5 py-0.5 rounded-lg border border-[#E9DFCE]">
                            ×{item.quantity}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {/* Notes (if any) */}
                    {(order.noteTags.length > 0 || order.note) && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {order.noteTags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2.5 py-1 rounded-full bg-amber-200/80 text-stone-900 text-xs font-bold"
                          >
                            {tag}
                          </span>
                        ))}
                        {order.note && (
                          <span className="px-2.5 py-1 rounded-full bg-stone-100 text-stone-800 text-xs font-semibold">
                            โน้ต: {order.note}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={() => onUpdateOrderStatus(order.id, "done")}
                        className="flex-1 min-h-[48px] px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-base shadow-xs active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                      >
                        <Check className="w-5 h-5" />
                        <span>ส่งของแล้ว</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onUpdateOrderStatus(order.id, "void")}
                        className="min-h-[48px] px-3.5 py-2.5 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs active:scale-[0.97] transition-all flex items-center justify-center gap-1"
                      >
                        <Trash2 className="w-4 h-4" />
                        <span>ยกเลิก</span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* =================================================================== */}
      {/* COLLAPSIBLE BOTTOM BAR: TODAY'S DONE / VOID HISTORY                 */}
      {/* =================================================================== */}
      <section
        aria-label="ประวัติบิลวันนี้ที่เสร็จแล้ว"
        className="rounded-2xl bg-white border border-[#E9DFCE] overflow-hidden"
      >
        <button
          type="button"
          onClick={() => setHistoryOpen((prev) => !prev)}
          aria-expanded={historyOpen}
          className="w-full min-h-[48px] px-4 py-3 flex items-center justify-between text-left hover:bg-[#FAF5EB]/60 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-stone-700">
              ประวัติบิลวันนี้ที่เสร็จแล้ว
            </span>
            <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 text-xs font-bold tabular-nums">
              {todayHistoryOrders.length}
            </span>
          </div>
          {historyOpen ? (
            <ChevronUp className="w-4 h-4 text-stone-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-stone-500" />
          )}
        </button>

        {historyOpen && (
          <div className="border-t border-[#EFE6D6] divide-y divide-[#EFE6D6]">
            {todayHistoryOrders.length === 0 ? (
              <div className="p-4 text-center text-xs text-stone-400">
                ยังไม่มีบิลที่เสร็จหรือยกเลิกในวันนี้
              </div>
            ) : (
              todayHistoryOrders.map((order) => {
                const isDone = order.status === "done";
                const isMake = order.paymentMethod === "make";
                return (
                  <div
                    key={order.id}
                    className={`p-3.5 space-y-2 ${
                      !isDone ? "bg-rose-50/40" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`px-2 py-0.5 rounded-lg text-xs font-extrabold tabular-nums ${
                            isDone
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-rose-100 text-rose-700 line-through"
                          }`}
                        >
                          {formatQueueNumber(order.queueNumber)}
                        </span>
                        <span className="text-xs text-stone-500 tabular-nums">
                          {formatThailandTime(order.createdAt)}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            isMake
                              ? "bg-teal-50 text-teal-700"
                              : "bg-orange-50 text-orange-700"
                          }`}
                        >
                          {isMake ? "โอน" : "สด"}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            isDone
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-rose-100 text-rose-700"
                          }`}
                        >
                          {isDone ? "เสร็จแล้ว" : "ยกเลิกแล้ว"}
                        </span>
                      </div>
                      <span
                        className={`text-sm font-extrabold tabular-nums ${
                          isDone
                            ? "text-stone-900"
                            : "text-stone-400 line-through"
                        }`}
                      >
                        ฿{formatBaht(order.totalAmount)}
                      </span>
                    </div>

                    <div className="text-xs text-stone-700">
                      {order.items
                        .map(
                          (i) =>
                            `${i.menuName}${
                              i.toppings.length > 0
                                ? ` (+${i.toppings
                                    .map((t) => t.name)
                                    .join(" +")})`
                                : ""
                            } ×${i.quantity}`
                        )
                        .join(", ")}
                      {(order.noteTags.length > 0 || order.note) && (
                        <span className="text-stone-500">
                          {" "}
                          — {[...order.noteTags, order.note]
                            .filter(Boolean)
                            .join(", ")}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onUpdateOrderStatus(order.id, "pending")}
                        className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-xs font-bold flex items-center gap-1 active:scale-95"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        กู้คืนเข้าคิวรอทำ
                      </button>

                      {isDone ? (
                        <button
                          type="button"
                          onClick={() => onUpdateOrderStatus(order.id, "void")}
                          className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold active:scale-95"
                        >
                          ยกเลิกบิล
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onUpdateOrderStatus(order.id, "done")}
                          className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-bold active:scale-95"
                        >
                          กู้คืนเป็นเสร็จแล้ว
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </section>
    </div>
  );
}
