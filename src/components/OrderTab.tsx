"use client";

import React, { useMemo, useState } from "react";
import {
  Banknote,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Minus,
  Plus,
  QrCode,
  RotateCcw,
  Trash2,
  X,
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
  onDeleteOrder: (orderId: string) => void;
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
  onDeleteOrder,
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
  const [confirmDeleteOrderId, setConfirmDeleteOrderId] = useState<
    string | null
  >(null);

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

    onAddOrder({
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
  };

  const hasPendingVariationToAdd =
    billItems.length > 0 && (selectedToppingIds.length > 0 || quantity > 1);

  return (
    <div className="space-y-6">
      {/* =================================================================== */}
      {/* 1. STREAMLINED 2-SECOND ORDER ENTRY CARD                            */}
      {/* =================================================================== */}
      <section
        aria-label="ฟอร์มจดออเดอร์ด่วน"
        className="rounded-3xl bg-white border border-stone-200/80 shadow-[0_2px_14px_-4px_rgba(28,25,23,0.06)] p-4 sm:p-5 space-y-4"
      >
        {/* Top Row: Heading & Next Queue */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-stone-900">
            รับออเดอร์ใหม่
          </h2>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 text-xs font-semibold tabular-nums">
            คิวถัดไป {nextQueuePreview}
          </span>
        </div>

        {/* Menu Selection */}
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
                className={`min-h-[52px] px-4 py-3 rounded-2xl border text-left transition-all active:scale-[0.99] flex items-center justify-between gap-2 ${
                  isSelected
                    ? "bg-amber-50/70 border-amber-400/90 text-stone-900"
                    : "bg-stone-50/80 border-stone-200/80 text-stone-600 hover:bg-stone-100/70"
                }`}
              >
                <span className="font-semibold text-[15px] leading-snug">
                  {menu.name}
                </span>
                <span
                  className={`shrink-0 text-sm font-bold tabular-nums px-2.5 py-0.5 rounded-full ${
                    isSelected
                      ? "bg-amber-500 text-white"
                      : "bg-stone-200/80 text-stone-700"
                  }`}
                >
                  ฿{formatBaht(menu.price)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Toppings */}
        {activeToppings.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-stone-500">ท็อปปิ้ง</div>
            <div className="grid grid-cols-2 gap-2">
              {activeToppings.map((topping) => {
                const active = selectedToppingIds.includes(topping.id);
                return (
                  <button
                    key={topping.id}
                    type="button"
                    onClick={() => toggleTopping(topping.id)}
                    aria-pressed={active}
                    className={`min-h-[46px] px-3.5 py-2 rounded-2xl border text-sm font-medium transition-all active:scale-[0.98] flex items-center justify-between gap-2 ${
                      active
                        ? "bg-amber-500 border-amber-500 text-white shadow-2xs"
                        : "bg-stone-50/80 border-stone-200/80 text-stone-700 hover:bg-stone-100/70"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      {active ? (
                        <Check className="w-4 h-4 shrink-0" />
                      ) : (
                        <Plus className="w-3.5 h-3.5 shrink-0 text-stone-400" />
                      )}
                      <span className="truncate">{topping.name}</span>
                    </span>
                    <span
                      className={`text-xs font-semibold tabular-nums shrink-0 ${
                        active ? "text-amber-50" : "text-stone-500"
                      }`}
                    >
                      +{formatBaht(topping.price)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Quantity Stepper + Add to Multi-Item Bill (Single Clean Row) */}
        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-1 bg-stone-100/90 rounded-2xl p-1 shrink-0">
            <button
              type="button"
              aria-label="ลดจำนวนแก้ว"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              className="w-10 h-10 rounded-xl bg-white text-stone-700 flex items-center justify-center shadow-2xs active:scale-95 disabled:opacity-35"
            >
              <Minus className="w-4 h-4" />
            </button>
            <div className="min-w-[46px] text-center">
              <span className="text-base font-bold tabular-nums text-stone-900">
                {quantity}
              </span>
              <span className="text-[11px] text-stone-500 ml-0.5">แก้ว</span>
            </div>
            <button
              type="button"
              aria-label="เพิ่มจำนวนแก้ว"
              onClick={() => setQuantity((q) => q + 1)}
              className="w-10 h-10 rounded-xl bg-white text-stone-800 flex items-center justify-center shadow-2xs active:scale-95"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleAddToBill}
            className={`flex-1 min-h-[48px] px-3.5 py-2 rounded-2xl border text-sm font-medium transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 ${
              hasPendingVariationToAdd
                ? "bg-amber-50 border-amber-400 text-amber-900 font-semibold"
                : "bg-white border-stone-200 text-stone-700 hover:bg-stone-50"
            }`}
          >
            <Plus className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="truncate">
              เพิ่มลงบิล (฿{formatBaht(builderSubtotal)})
            </span>
          </button>
        </div>

        {/* Multi-Item Bill List (only rendered when user added items to bill) */}
        {billItems.length > 0 && (
          <div className="rounded-2xl bg-stone-50/90 border border-stone-200/70 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs text-stone-500">
              <span className="font-medium">
                รายการในบิลนี้ ({billItems.length} แบบ)
              </span>
              <button
                type="button"
                onClick={() => setBillItems([])}
                className="text-rose-600 hover:underline font-medium"
              >
                ล้างบิล
              </button>
            </div>
            <ul className="divide-y divide-stone-200/70">
              {billItems.map((item) => {
                const topSum = item.toppings.reduce((s, t) => s + t.price, 0);
                const lineTotal = (item.unitPrice + topSum) * item.quantity;
                return (
                  <li
                    key={item.draftKey}
                    className="py-2 first:pt-0.5 last:pb-0 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-stone-900 truncate">
                        {item.menuName}
                      </div>
                      <div className="text-xs text-stone-500">
                        {item.toppings.length > 0
                          ? `+${item.toppings.map((t) => t.name).join(", +")}`
                          : "ธรรมดา"}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1 bg-white rounded-xl border border-stone-200/80 p-0.5">
                        <button
                          type="button"
                          aria-label="ลดรายการนี้"
                          onClick={() =>
                            handleAdjustBillItemQty(item.draftKey, -1)
                          }
                          className="w-6 h-6 rounded-lg flex items-center justify-center text-stone-600 hover:bg-stone-100"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-5 text-center text-xs font-bold tabular-nums">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          aria-label="เพิ่มรายการนี้"
                          onClick={() =>
                            handleAdjustBillItemQty(item.draftKey, 1)
                          }
                          className="w-6 h-6 rounded-lg flex items-center justify-center text-stone-600 hover:bg-stone-100"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <span className="min-w-[42px] text-right text-sm font-semibold tabular-nums text-stone-900">
                        ฿{formatBaht(lineTotal)}
                      </span>

                      <button
                        type="button"
                        aria-label="ลบรายการนี้"
                        onClick={() => handleRemoveBillItem(item.draftKey)}
                        className="w-6 h-6 rounded-lg text-stone-400 hover:text-rose-600 flex items-center justify-center"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Quick Notes + Short Note Input */}
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
                  className={`min-h-[34px] px-3 py-1 rounded-full text-xs font-medium transition-all active:scale-95 ${
                    active
                      ? "bg-stone-800 text-white"
                      : "bg-stone-100 text-stone-600 hover:bg-stone-200/70"
                  }`}
                >
                  {active ? "✓ " : ""}
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
              placeholder="โน้ตเพิ่มเติม (ถ้ามี)..."
              maxLength={80}
              className="w-full min-h-[42px] pl-3.5 pr-9 py-2 rounded-xl bg-stone-50 border border-stone-200/70 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-amber-400 focus:bg-white transition-colors"
            />
            {customNote && (
              <button
                type="button"
                aria-label="ล้างโน้ต"
                onClick={() => setCustomNote("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-stone-200/80 text-stone-600 flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Payment Method — Clean Segmented Switch */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-stone-100">
          <button
            type="button"
            onClick={() => setPaymentMethod("make")}
            aria-pressed={paymentMethod === "make"}
            className={`min-h-[46px] px-3 py-2 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
              paymentMethod === "make"
                ? "bg-teal-600 text-white shadow-xs"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            <QrCode className="w-4 h-4 shrink-0" />
            <span>โอน (MAKE)</span>
          </button>

          <button
            type="button"
            onClick={() => setPaymentMethod("cash")}
            aria-pressed={paymentMethod === "cash"}
            className={`min-h-[46px] px-3 py-2 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${
              paymentMethod === "cash"
                ? "bg-amber-600 text-white shadow-xs"
                : "text-stone-600 hover:text-stone-900"
            }`}
          >
            <Banknote className="w-4 h-4 shrink-0" />
            <span>เงินสด</span>
          </button>
        </div>

        {/* Footer Strip: Total & Primary Save CTA */}
        <div className="pt-2 border-t border-stone-100 flex items-center justify-between gap-4">
          <div className="pl-1">
            <div className="text-xs text-stone-500">
              ยอดรวม · {effectiveCupCount} แก้ว
            </div>
            <div className="text-3xl font-bold text-stone-900 tabular-nums tracking-tight leading-tight">
              ฿{formatBaht(effectiveTotal)}
            </div>
          </div>

          <button
            type="button"
            onClick={handleSaveOrder}
            className="flex-1 max-w-[230px] min-h-[54px] px-5 py-3 rounded-2xl bg-stone-900 hover:bg-stone-800 text-white font-semibold text-base shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <Check className="w-5 h-5" />
            <span>บันทึกออเดอร์</span>
          </button>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 2. LIVE PENDING QUEUE (OLDEST -> NEWEST)                            */}
      {/* =================================================================== */}
      <section aria-label="รายการคิวที่กำลังรอทำ" className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-stone-900">
              คิวที่กำลังรอทำ
            </h2>
            <span className="min-w-[24px] h-6 px-2 rounded-full bg-amber-100 text-amber-900 text-xs font-bold tabular-nums inline-flex items-center justify-center">
              {pendingOrders.length}
            </span>
          </div>
          <span className="text-xs text-stone-400 flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            มาก่อนอยู่บน
          </span>
        </div>

        {pendingOrders.length === 0 ? (
          <div className="rounded-2xl bg-white/70 border border-dashed border-stone-300/80 py-8 px-4 text-center space-y-1">
            <p className="text-sm font-medium text-stone-600">
              ยังไม่มีคิวรอทำในตอนนี้
            </p>
            <p className="text-xs text-stone-400">
              กด &ldquo;บันทึกออเดอร์&rdquo; ด้านบน คิวจะแสดงที่นี่ทันที
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingOrders.map((order) => {
              const isMake = order.paymentMethod === "make";
              const isOtherDay = order.dateKey !== todayKey;
              return (
                <article
                  key={order.id}
                  className="rounded-2xl bg-white border border-stone-200/80 shadow-[0_1px_8px_-3px_rgba(28,25,23,0.05)] p-4 space-y-3"
                >
                  {/* Ticket Header */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="px-2.5 py-1 rounded-xl bg-amber-100/90 text-amber-950 font-bold text-base tabular-nums">
                        {formatQueueNumber(order.queueNumber)}
                      </span>
                      <span className="text-xs text-stone-400 tabular-nums">
                        {formatThailandTime(order.createdAt)} น.
                        {isOtherDay && (
                          <span className="ml-1.5 text-stone-500">
                            · {formatThaiDateLabel(order.dateKey)}
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          isMake
                            ? "bg-teal-50 text-teal-700"
                            : "bg-amber-50 text-amber-800"
                        }`}
                      >
                        {isMake ? "โอน MAKE" : "เงินสด"}
                      </span>
                      <span className="text-lg font-bold text-stone-900 tabular-nums">
                        ฿{formatBaht(order.totalAmount)}
                      </span>
                    </div>
                  </div>

                  {/* Ticket Items */}
                  <ul className="divide-y divide-stone-100 border-t border-b border-stone-100 py-1.5">
                    {order.items.map((item) => (
                      <li
                        key={item.id}
                        className="py-1.5 flex items-baseline justify-between gap-3"
                      >
                        <div className="text-[15px] font-medium text-stone-900 leading-snug">
                          <span>{item.menuName}</span>
                          {item.toppings.length > 0 && (
                            <span className="ml-1.5 text-amber-700 font-semibold">
                              +{item.toppings.map((t) => t.name).join(" +")}
                            </span>
                          )}
                        </div>
                        <span className="shrink-0 text-sm font-bold text-stone-700 tabular-nums bg-stone-100 px-2.5 py-0.5 rounded-lg">
                          ×{item.quantity}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* Notes */}
                  {(order.noteTags.length > 0 || order.note) && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {order.noteTags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-900 text-xs font-medium border border-amber-200/70"
                        >
                          {tag}
                        </span>
                      ))}
                      {order.note && (
                        <span className="text-xs text-stone-600 bg-stone-100 px-2.5 py-0.5 rounded-full">
                          โน้ต: {order.note}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => onUpdateOrderStatus(order.id, "done")}
                      className="flex-1 min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                    >
                      <Check className="w-4 h-4" />
                      <span>ส่งของแล้ว</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onUpdateOrderStatus(order.id, "void")}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-stone-100 hover:bg-rose-50 text-stone-600 hover:text-rose-600 font-medium text-xs active:scale-[0.97] transition-all"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* =================================================================== */}
      {/* 3. COLLAPSIBLE TODAY HISTORY (RESTORE / VOID / PERMANENT DELETE)    */}
      {/* =================================================================== */}
      <section
        aria-label="ประวัติบิลวันนี้ที่เสร็จแล้ว"
        className="rounded-2xl bg-white border border-stone-200/80 overflow-hidden"
      >
        <button
          type="button"
          onClick={() => setHistoryOpen((prev) => !prev)}
          aria-expanded={historyOpen}
          className="w-full min-h-[48px] px-4 py-3 flex items-center justify-between text-left hover:bg-stone-50/70 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-stone-700">
              ประวัติบิลวันนี้ที่เสร็จแล้ว
            </span>
            <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 text-xs font-semibold tabular-nums">
              {todayHistoryOrders.length}
            </span>
          </div>
          {historyOpen ? (
            <ChevronUp className="w-4 h-4 text-stone-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-stone-400" />
          )}
        </button>

        {historyOpen && (
          <div className="border-t border-stone-100 divide-y divide-stone-100">
            {todayHistoryOrders.length === 0 ? (
              <div className="p-5 text-center text-xs text-stone-400">
                ยังไม่มีบิลที่เสร็จหรือยกเลิกในวันนี้
              </div>
            ) : (
              todayHistoryOrders.map((order) => {
                const isDone = order.status === "done";
                const isMake = order.paymentMethod === "make";
                const confirmingDelete = confirmDeleteOrderId === order.id;

                return (
                  <div
                    key={order.id}
                    className={`p-4 space-y-2.5 ${
                      !isDone ? "bg-stone-50/60" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <span
                          className={`px-2 py-0.5 rounded-lg text-xs font-bold tabular-nums ${
                            isDone
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-stone-200/80 text-stone-500 line-through"
                          }`}
                        >
                          {formatQueueNumber(order.queueNumber)}
                        </span>
                        <span className="text-xs text-stone-400 tabular-nums">
                          {formatThailandTime(order.createdAt)}
                        </span>
                        <span className="text-xs text-stone-500">
                          {isMake ? "โอน MAKE" : "เงินสด"}
                        </span>
                        <span
                          className={`text-xs font-medium ${
                            isDone ? "text-emerald-700" : "text-rose-600"
                          }`}
                        >
                          · {isDone ? "เสร็จแล้ว" : "ยกเลิกแล้ว"}
                        </span>
                      </div>
                      <span
                        className={`text-sm font-bold tabular-nums ${
                          isDone
                            ? "text-stone-900"
                            : "text-stone-400 line-through"
                        }`}
                      >
                        ฿{formatBaht(order.totalAmount)}
                      </span>
                    </div>

                    <div className="text-xs text-stone-600 leading-relaxed">
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
                        <span className="text-stone-400">
                          {" "}
                          · {[...order.noteTags, order.note]
                            .filter(Boolean)
                            .join(", ")}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmDeleteOrderId(null);
                          onUpdateOrderStatus(order.id, "pending");
                        }}
                        className="px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200/70 text-stone-700 text-xs font-medium inline-flex items-center gap-1"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        กู้คืนเข้าคิว
                      </button>

                      {isDone ? (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeleteOrderId(null);
                            onUpdateOrderStatus(order.id, "void");
                          }}
                          className="px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-rose-50 text-stone-600 hover:text-rose-600 text-xs font-medium"
                        >
                          ยกเลิกบิล
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeleteOrderId(null);
                            onUpdateOrderStatus(order.id, "done");
                          }}
                          className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-medium"
                        >
                          กู้คืนเป็นเสร็จแล้ว
                        </button>
                      )}

                      {confirmingDelete ? (
                        <button
                          type="button"
                          onClick={() => {
                            setConfirmDeleteOrderId(null);
                            onDeleteOrder(order.id);
                          }}
                          className="ml-auto px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-semibold inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          ยืนยันลบถาวร
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteOrderId(order.id)}
                          className="ml-auto px-2.5 py-1.5 rounded-xl text-stone-400 hover:text-rose-600 hover:bg-rose-50 text-xs font-medium inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          ลบ
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
