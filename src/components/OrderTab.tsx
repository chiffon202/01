"use client";

import React, { useMemo, useState } from "react";
import {
  Banknote,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Plus,
  QrCode,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  BoothSettings,
  MenuItem,
  NewOrderItemInput,
  Order,
  OrderStatus,
  OrderTopping,
  PaymentMethod,
  ToppingItem,
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

interface DraftCup {
  id: string;
  menuId: string;
  menuName: string;
  unitPrice: number;
  toppings: OrderTopping[];
  noteTags: string[];
}

function makeDraftCupId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `cup_${crypto.randomUUID()}`;
  }
  return `cup_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function getCupTotal(cup: DraftCup): number {
  const toppingSum = cup.toppings.reduce((sum, t) => sum + t.price, 0);
  return cup.unitPrice + toppingSum;
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

  // Resolve primary menu & standard Whip / Cheese toppings cleanly
  const primaryMenu: MenuItem = useMemo(
    () =>
      activeMenus[0] ??
      settings.menus[0] ?? {
        id: "corn-butter",
        name: "ข้าวโพดคลุกเนย",
        price: 25,
        active: true,
      },
    [activeMenus, settings.menus]
  );

  const whipTopping: ToppingItem | undefined = useMemo(
    () =>
      activeToppings.find(
        (t) => t.id === "whip-cream" || t.name.includes("วิป")
      ),
    [activeToppings]
  );

  const cheeseTopping: ToppingItem | undefined = useMemo(
    () =>
      activeToppings.find((t) => t.id === "cheese" || t.name.includes("ชีส")),
    [activeToppings]
  );

  const extraToppings = useMemo(
    () =>
      activeToppings.filter(
        (t) => t.id !== whipTopping?.id && t.id !== cheeseTopping?.id
      ),
    [activeToppings, whipTopping, cheeseTopping]
  );

  const [draftCups, setDraftCups] = useState<DraftCup[]>([]);
  const [activeCupId, setActiveCupId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("make");
  const [historyOpen, setHistoryOpen] = useState<boolean>(false);
  const [confirmDeleteOrderId, setConfirmDeleteOrderId] = useState<
    string | null
  >(null);

  const activeCup = useMemo(() => {
    if (draftCups.length === 0) return null;
    return draftCups.find((c) => c.id === activeCupId) ?? draftCups[draftCups.length - 1];
  }, [draftCups, activeCupId]);

  const billTotal = useMemo(
    () => draftCups.reduce((sum, cup) => sum + getCupTotal(cup), 0),
    [draftCups]
  );

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

  // --------------------------------------------------------------------------
  // Cup Builder Handlers
  // --------------------------------------------------------------------------
  const handleAddNewCup = (
    menu: MenuItem = primaryMenu,
    initialToppings: OrderTopping[] = [],
    initialNotes: string[] = []
  ) => {
    const newCup: DraftCup = {
      id: makeDraftCupId(),
      menuId: menu.id,
      menuName: menu.name,
      unitPrice: menu.price,
      toppings: initialToppings,
      noteTags: initialNotes,
    };
    setDraftCups((prev) => [...prev, newCup]);
    setActiveCupId(newCup.id);
  };

  const updateActiveCup = (updater: (cup: DraftCup) => DraftCup) => {
    const targetId = activeCup?.id;
    if (!targetId) return;
    setDraftCups((prev) =>
      prev.map((cup) => (cup.id === targetId ? updater(cup) : cup))
    );
  };

  const handleToggleSingleTopping = (topping: ToppingItem) => {
    const orderTop: OrderTopping = {
      id: topping.id,
      name: topping.name,
      price: topping.price,
    };
    if (!activeCup) {
      // Auto-create corn + this topping to prevent missed taps
      handleAddNewCup(primaryMenu, [orderTop], []);
      return;
    }
    updateActiveCup((cup) => {
      const exists = cup.toppings.some((t) => t.id === topping.id);
      return {
        ...cup,
        toppings: exists
          ? cup.toppings.filter((t) => t.id !== topping.id)
          : [...cup.toppings, orderTop],
      };
    });
  };

  const handleToggleWhipAndCheese = () => {
    if (!whipTopping || !cheeseTopping) return;
    const whipOrderTop: OrderTopping = {
      id: whipTopping.id,
      name: whipTopping.name,
      price: whipTopping.price,
    };
    const cheeseOrderTop: OrderTopping = {
      id: cheeseTopping.id,
      name: cheeseTopping.name,
      price: cheeseTopping.price,
    };

    if (!activeCup) {
      handleAddNewCup(primaryMenu, [whipOrderTop, cheeseOrderTop], []);
      return;
    }

    updateActiveCup((cup) => {
      const hasWhip = cup.toppings.some((t) => t.id === whipTopping.id);
      const hasCheese = cup.toppings.some((t) => t.id === cheeseTopping.id);
      const otherToppings = cup.toppings.filter(
        (t) => t.id !== whipTopping.id && t.id !== cheeseTopping.id
      );

      if (hasWhip && hasCheese) {
        return { ...cup, toppings: otherToppings };
      }
      return {
        ...cup,
        toppings: [...otherToppings, whipOrderTop, cheeseOrderTop],
      };
    });
  };

  const handleToggleNoteTag = (tag: string) => {
    if (!activeCup) {
      // Auto-create corn + this note tag
      handleAddNewCup(primaryMenu, [], [tag]);
      return;
    }
    updateActiveCup((cup) => {
      const exists = cup.noteTags.includes(tag);
      return {
        ...cup,
        noteTags: exists
          ? cup.noteTags.filter((t) => t !== tag)
          : [...cup.noteTags, tag],
      };
    });
  };

  const handleDuplicateCup = (cup: DraftCup) => {
    const cloned: DraftCup = {
      ...cup,
      id: makeDraftCupId(),
      toppings: cup.toppings.map((t) => ({ ...t })),
      noteTags: [...cup.noteTags],
    };
    setDraftCups((prev) => [...prev, cloned]);
    setActiveCupId(cloned.id);
  };

  const handleRemoveCup = (cupId: string) => {
    setDraftCups((prev) => {
      const next = prev.filter((c) => c.id !== cupId);
      if (activeCup?.id === cupId) {
        const last = next[next.length - 1];
        setActiveCupId(last ? last.id : null);
      }
      return next;
    });
  };

  const handleClearDraftBill = () => {
    setDraftCups([]);
    setActiveCupId(null);
  };

  const handleSaveOrder = () => {
    if (draftCups.length === 0) return;

    const itemsToSave: NewOrderItemInput[] = draftCups.map((cup) => ({
      menuId: cup.menuId,
      menuName: cup.menuName,
      unitPrice: cup.unitPrice,
      toppings: cup.toppings,
      noteTags: cup.noteTags,
      quantity: 1,
    }));

    onAddOrder({
      items: itemsToSave,
      noteTags: [],
      note: "",
      paymentMethod,
    });

    // Reset right panel immediately for next customer
    setDraftCups([]);
    setActiveCupId(null);
    setPaymentMethod("make");
  };

  // Active cup states for highlighting left-side buttons
  const activeHasWhip = Boolean(
    whipTopping && activeCup?.toppings.some((t) => t.id === whipTopping.id)
  );
  const activeHasCheese = Boolean(
    cheeseTopping && activeCup?.toppings.some((t) => t.id === cheeseTopping.id)
  );
  const activeHasBoth = activeHasWhip && activeHasCheese;

  return (
    <div className="flex flex-col gap-4 md:grid md:grid-cols-[minmax(0,65fr)_minmax(0,35fr)] md:gap-4 md:h-[calc(100dvh-4.5rem)] md:overflow-hidden">
      {/* =================================================================== */}
      {/* LEFT COLUMN (65% on iPad Landscape): ORDER BUTTONS + ACTIVE QUEUE   */}
      {/* On mobile portrait: `contents` flattens so Current Bill sits        */}
      {/* neatly between Buttons (order-1) and Active Queue (order-3).        */}
      {/* =================================================================== */}
      <div className="contents md:flex md:flex-col md:gap-4 md:h-full md:overflow-y-auto md:pr-1 md:pb-4">
        {/* 1. FAST-TAP ORDER BUILDER PAD */}
        <section
          aria-label="ปุ่มกดรับออเดอร์"
          className="order-1 rounded-3xl bg-white border border-[#EDE6D8] shadow-[0_2px_16px_-4px_rgba(120,74,12,0.07)] p-4 sm:p-5 space-y-4 shrink-0"
        >
          {/* Main Capsule Button(s) */}
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => handleAddNewCup(primaryMenu)}
              className="w-full min-h-[62px] px-6 py-3.5 rounded-full bg-amber-400 hover:bg-amber-300 active:scale-[0.99] text-stone-950 font-bold text-lg sm:text-xl shadow-[0_4px_14px_-4px_rgba(245,158,11,0.55)] transition-all flex items-center justify-between gap-3"
            >
              <span className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-full bg-white/85 text-amber-800 flex items-center justify-center shrink-0">
                  <Plus className="w-5 h-5 stroke-[2.75]" />
                </span>
                <span>{primaryMenu.name}</span>
              </span>
              <span className="px-3.5 py-1 rounded-full bg-stone-900 text-amber-300 text-base font-bold tabular-nums">
                {formatBaht(primaryMenu.price)}.-
              </span>
            </button>

            {activeMenus.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {activeMenus.slice(1).map((menu) => (
                  <button
                    key={menu.id}
                    type="button"
                    onClick={() => handleAddNewCup(menu)}
                    className="min-h-[46px] px-4 py-2 rounded-full bg-[#FFF7E6] hover:bg-amber-100 border border-amber-300/80 text-stone-900 font-semibold text-sm active:scale-[0.98] transition-all inline-flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4 text-amber-700" />
                    <span>{menu.name}</span>
                    <span className="text-amber-800 font-bold tabular-nums">
                      ({formatBaht(menu.price)}.-)
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Row 2: 3 Large Rounded-Square Topping Buttons */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-stone-500 px-0.5">
              <span>
                ท็อปปิ้ง{" "}
                {activeCup ? (
                  <strong className="text-orange-700 font-semibold">
                    (กำลังแก้แก้วที่{" "}
                    {draftCups.findIndex((c) => c.id === activeCup.id) + 1})
                  </strong>
                ) : (
                  <span>(กดเพื่อสร้างแก้วพร้อมท็อปปิ้งได้เลย)</span>
                )}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              {whipTopping && (
                <button
                  type="button"
                  onClick={() => handleToggleSingleTopping(whipTopping)}
                  aria-pressed={activeHasWhip}
                  className={`min-h-[64px] px-2.5 py-3 rounded-2xl border-2 font-semibold transition-all active:scale-[0.97] flex flex-col items-center justify-center gap-0.5 ${
                    activeHasWhip
                      ? "bg-orange-500 border-orange-500 text-white shadow-xs"
                      : "bg-[#FFF9F0] border-orange-200/80 text-stone-800 hover:bg-orange-50"
                  }`}
                >
                  <span className="text-sm sm:text-base font-bold flex items-center gap-1">
                    {activeHasWhip && <Check className="w-4 h-4 shrink-0" />}
                    <span>+ วิป</span>
                  </span>
                  <span
                    className={`text-xs font-semibold tabular-nums ${
                      activeHasWhip ? "text-orange-50" : "text-orange-700"
                    }`}
                  >
                    ({formatBaht(whipTopping.price)}.-)
                  </span>
                </button>
              )}

              {cheeseTopping && (
                <button
                  type="button"
                  onClick={() => handleToggleSingleTopping(cheeseTopping)}
                  aria-pressed={activeHasCheese}
                  className={`min-h-[64px] px-2.5 py-3 rounded-2xl border-2 font-semibold transition-all active:scale-[0.97] flex flex-col items-center justify-center gap-0.5 ${
                    activeHasCheese
                      ? "bg-orange-500 border-orange-500 text-white shadow-xs"
                      : "bg-[#FFF9F0] border-orange-200/80 text-stone-800 hover:bg-orange-50"
                  }`}
                >
                  <span className="text-sm sm:text-base font-bold flex items-center gap-1">
                    {activeHasCheese && <Check className="w-4 h-4 shrink-0" />}
                    <span>+ ชีส</span>
                  </span>
                  <span
                    className={`text-xs font-semibold tabular-nums ${
                      activeHasCheese ? "text-orange-50" : "text-orange-700"
                    }`}
                  >
                    ({formatBaht(cheeseTopping.price)}.-)
                  </span>
                </button>
              )}

              {whipTopping && cheeseTopping && (
                <button
                  type="button"
                  onClick={handleToggleWhipAndCheese}
                  aria-pressed={activeHasBoth}
                  className={`min-h-[64px] px-2.5 py-3 rounded-2xl border-2 font-semibold transition-all active:scale-[0.97] flex flex-col items-center justify-center gap-0.5 ${
                    activeHasBoth
                      ? "bg-stone-900 border-stone-900 text-amber-300 shadow-xs"
                      : "bg-[#FFF6E5] border-amber-300/90 text-stone-900 hover:bg-amber-100/70"
                  }`}
                >
                  <span className="text-sm sm:text-base font-bold flex items-center gap-1">
                    {activeHasBoth && <Check className="w-4 h-4 shrink-0" />}
                    <span>+ วิป+ชีส</span>
                  </span>
                  <span
                    className={`text-xs font-semibold tabular-nums ${
                      activeHasBoth ? "text-amber-200" : "text-amber-800"
                    }`}
                  >
                    ({formatBaht(whipTopping.price + cheeseTopping.price)}.-)
                  </span>
                </button>
              )}
            </div>

            {extraToppings.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {extraToppings.map((topping) => {
                  const active = Boolean(
                    activeCup?.toppings.some((t) => t.id === topping.id)
                  );
                  return (
                    <button
                      key={topping.id}
                      type="button"
                      onClick={() => handleToggleSingleTopping(topping)}
                      aria-pressed={active}
                      className={`min-h-[42px] px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition-all active:scale-[0.97] ${
                        active
                          ? "bg-orange-500 border-orange-500 text-white"
                          : "bg-[#FFF9F0] border-orange-200/80 text-stone-700"
                      }`}
                    >
                      {active ? "✓ " : "+ "}
                      {topping.name} ({formatBaht(topping.price)}.-)
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Thin Divider + Row 3: 3 Capsule Note Buttons */}
          <div className="border-t border-stone-200/70 pt-3.5">
            <div className="grid grid-cols-3 gap-2">
              {settings.quickNotes.map((tag) => {
                const active = Boolean(activeCup?.noteTags.includes(tag));
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleToggleNoteTag(tag)}
                    aria-pressed={active}
                    className={`min-h-[44px] px-3 py-2 rounded-full text-xs sm:text-sm font-semibold border transition-all active:scale-95 flex items-center justify-center gap-1.5 ${
                      active
                        ? "bg-stone-800 border-stone-800 text-amber-200 shadow-2xs"
                        : "bg-stone-50 border-stone-200/80 text-stone-700 hover:bg-stone-100"
                    }`}
                  >
                    {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                    <span className="truncate">{tag}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* 2. ACTIVE QUEUE & TODAY'S HISTORY (BOTTOM OF LEFT COLUMN) */}
        <section
          aria-label="คิวที่กำลังรอทำ"
          className="order-3 space-y-3 pb-4 md:pb-0"
        >
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <h2 className="text-[15px] font-bold text-stone-900">
                คิวที่กำลังรอทำ (Active Queue)
              </h2>
              <span className="min-w-[24px] h-6 px-2 rounded-full bg-orange-100 text-orange-800 text-xs font-bold tabular-nums inline-flex items-center justify-center">
                {pendingOrders.length}
              </span>
            </div>
            <span className="text-xs text-stone-400 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              มาก่อนอยู่บน
            </span>
          </div>

          {pendingOrders.length === 0 ? (
            <div className="rounded-2xl bg-white/80 border border-dashed border-stone-300/80 py-7 px-4 text-center space-y-1">
              <p className="text-sm font-medium text-stone-600">
                ยังไม่มีคิวรอทำในตอนนี้
              </p>
              <p className="text-xs text-stone-400">
                เลือกแก้วแล้วกด &ldquo;บันทึก &amp; ส่งคิว&rdquo; ฝั่งขวา
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {pendingOrders.map((order) => {
                const isMake = order.paymentMethod === "make";
                const isOtherDay = order.dateKey !== todayKey;
                return (
                  <article
                    key={order.id}
                    className="rounded-2xl bg-white border border-[#EDE6D8] shadow-[0_2px_10px_-4px_rgba(28,25,23,0.06)] p-4 flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-2.5">
                      {/* Queue Header */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-xl bg-amber-100 text-amber-950 font-bold text-base tabular-nums">
                            {formatQueueNumber(order.queueNumber)}
                          </span>
                          <span className="text-xs text-stone-400 tabular-nums">
                            {formatThailandTime(order.createdAt)} น.
                            {isOtherDay && (
                              <span className="ml-1 text-stone-500">
                                · {formatThaiDateLabel(order.dateKey)}
                              </span>
                            )}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              isMake
                                ? "bg-teal-50 text-teal-700 border border-teal-200/70"
                                : "bg-orange-50 text-orange-700 border border-orange-200/70"
                            }`}
                          >
                            {isMake ? "โอน MAKE" : "เงินสด"}
                          </span>
                          <span className="text-base font-bold text-stone-900 tabular-nums">
                            ฿{formatBaht(order.totalAmount)}
                          </span>
                        </div>
                      </div>

                      {/* Cup-by-Cup Breakdown */}
                      <ul className="divide-y divide-stone-100 border-t border-b border-stone-100 py-1">
                        {order.items.map((item, idx) => {
                          const cupNotes = item.noteTags ?? [];
                          return (
                            <li
                              key={item.id}
                              className="py-1.5 flex items-start justify-between gap-2 text-sm"
                            >
                              <div className="min-w-0 leading-snug">
                                <span className="text-xs font-semibold text-stone-400 mr-1.5">
                                  แก้วที่ {idx + 1}:
                                </span>
                                <span className="font-semibold text-stone-900">
                                  {item.menuName}
                                </span>
                                {item.toppings.length > 0 && (
                                  <span className="ml-1 text-orange-700 font-bold">
                                    +{" "}
                                    {item.toppings
                                      .map((t) => t.name)
                                      .join(" + ")}
                                  </span>
                                )}
                                {cupNotes.length > 0 && (
                                  <span className="ml-1.5 inline-flex flex-wrap gap-1 align-middle">
                                    {cupNotes.map((tag) => (
                                      <span
                                        key={tag}
                                        className="px-2 py-0.5 rounded-full bg-amber-100/80 text-stone-800 text-[11px] font-semibold"
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                  </span>
                                )}
                              </div>

                              {item.quantity > 1 && (
                                <span className="shrink-0 text-xs font-bold text-stone-700 tabular-nums bg-stone-100 px-2 py-0.5 rounded-md">
                                  ×{item.quantity}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>

                      {/* Legacy order-level notes if present */}
                      {(order.noteTags.length > 0 || order.note) && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {order.noteTags.map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-900 text-[11px] font-medium border border-amber-200/70"
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
                    </div>

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

          {/* Collapsible Today's Completed/Voided History */}
          <div className="rounded-2xl bg-white border border-[#EDE6D8] overflow-hidden mt-2">
            <button
              type="button"
              onClick={() => setHistoryOpen((prev) => !prev)}
              aria-expanded={historyOpen}
              className="w-full min-h-[46px] px-4 py-2.5 flex items-center justify-between text-left hover:bg-stone-50/70 transition-colors"
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
                        className={`p-3.5 space-y-2 ${
                          !isDone ? "bg-stone-50/70" : ""
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
                            .map((i) => {
                              const tops =
                                i.toppings.length > 0
                                  ? ` + ${i.toppings
                                      .map((t) => t.name)
                                      .join(" + ")}`
                                  : "";
                              const notes =
                                i.noteTags && i.noteTags.length > 0
                                  ? ` [${i.noteTags.join(", ")}]`
                                  : "";
                              const qty =
                                i.quantity > 1 ? ` ×${i.quantity}` : "";
                              return `${i.menuName}${tops}${notes}${qty}`;
                            })
                            .join(" / ")}
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
          </div>
        </section>
      </div>

      {/* =================================================================== */}
      {/* RIGHT COLUMN (35% on iPad Landscape): FULL-HEIGHT CURRENT BILL      */}
      {/* =================================================================== */}
      <aside
        aria-label="สรุปบิลปัจจุบัน"
        className="order-2 md:h-full md:min-h-0 rounded-3xl bg-white border border-[#EDE6D8] shadow-[0_4px_20px_-6px_rgba(120,74,12,0.09)] flex flex-col overflow-hidden"
      >
        {/* Right Panel Header */}
        <div className="shrink-0 px-4 py-3 border-b border-stone-100 flex items-center justify-between gap-2 bg-[#FFFDF8]">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-stone-900">บิลใหม่</span>
            <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-xs font-bold tabular-nums">
              Q {nextQueuePreview}
            </span>
          </div>

          {draftCups.length > 0 && (
            <button
              type="button"
              onClick={handleClearDraftBill}
              className="px-2.5 py-1 rounded-full bg-stone-100 hover:bg-rose-50 text-stone-500 hover:text-rose-600 text-xs font-medium transition-colors"
            >
              ล้างบิล
            </button>
          )}
        </div>

        {/* Scrollable Middle: Cup-by-Cup List */}
        <div className="flex-1 min-h-[140px] md:min-h-0 overflow-y-auto p-3 space-y-2">
          {draftCups.length === 0 ? (
            <div className="h-full min-h-[130px] flex flex-col items-center justify-center text-center px-4 py-6 text-stone-400 space-y-2">
              <Sparkles className="w-6 h-6 text-amber-400" />
              <p className="text-xs sm:text-sm font-medium text-stone-500">
                ยังไม่มีแก้วในบิล
              </p>
              <p className="text-[11px] text-stone-400 leading-relaxed">
                กดปุ่ม &ldquo;+ {primaryMenu.name}&rdquo; ด้านซ้ายเพื่อเริ่มเพิ่มแก้ว
              </p>
            </div>
          ) : (
            draftCups.map((cup, idx) => {
              const isActive = activeCup?.id === cup.id;
              const cupPrice = getCupTotal(cup);
              return (
                <div
                  key={cup.id}
                  onClick={() => setActiveCupId(cup.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setActiveCupId(cup.id);
                    }
                  }}
                  aria-current={isActive ? "true" : undefined}
                  className={`w-full text-left rounded-2xl border p-3 transition-all cursor-pointer select-none ${
                    isActive
                      ? "bg-[#FFF8EB] border-amber-400 ring-2 ring-amber-200/70 shadow-2xs"
                      : "bg-stone-50/70 border-stone-200/80 hover:bg-stone-100/70"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                            isActive
                              ? "bg-amber-400 text-stone-950"
                              : "bg-stone-200/80 text-stone-600"
                          }`}
                        >
                          แก้วที่ {idx + 1}
                        </span>
                        {isActive && (
                          <span className="text-[10px] font-semibold text-orange-700">
                            กำลังแก้ไข
                          </span>
                        )}
                      </div>

                      <div className="text-sm font-semibold text-stone-900 leading-snug">
                        {cup.menuName}
                        {cup.toppings.length > 0 && (
                          <span className="text-orange-700 font-bold ml-1">
                            + {cup.toppings.map((t) => t.name).join(" + ")}
                          </span>
                        )}
                      </div>

                      {cup.noteTags.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {cup.noteTags.map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 rounded-full bg-white border border-amber-200 text-stone-700 text-[11px] font-medium"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 flex flex-col items-end gap-1.5">
                      <span className="text-sm font-bold text-stone-900 tabular-nums">
                        {formatBaht(cupPrice)}.-
                      </span>
                      <div
                        className="flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          aria-label={`เพิ่มแก้วแบบเดียวกับแก้วที่ ${idx + 1}`}
                          onClick={() => handleDuplicateCup(cup)}
                          className="h-7 px-2 rounded-lg bg-white border border-stone-200 hover:border-amber-400 text-stone-700 text-xs font-bold active:scale-95"
                        >
                          +1
                        </button>
                        <button
                          type="button"
                          aria-label={`ลบแก้วที่ ${idx + 1}`}
                          onClick={() => handleRemoveCup(cup.id)}
                          className="w-7 h-7 rounded-lg bg-white border border-stone-200 hover:bg-rose-50 hover:border-rose-200 text-stone-400 hover:text-rose-600 flex items-center justify-center active:scale-95"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Sticky Footer: Total + Payment Switch + Save CTA */}
        <div className="shrink-0 border-t border-stone-100 bg-[#FFFDF8] p-3.5 space-y-2.5">
          <div className="flex items-baseline justify-between px-0.5">
            <span className="text-xs font-medium text-stone-500">
              รวม ({draftCups.length} แก้ว)
            </span>
            <span className="text-2xl sm:text-3xl font-bold text-stone-900 tabular-nums tracking-tight">
              รวม {formatBaht(billTotal)} บาท
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-stone-100">
            <button
              type="button"
              onClick={() => setPaymentMethod("make")}
              aria-pressed={paymentMethod === "make"}
              className={`min-h-[44px] px-2.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 ${
                paymentMethod === "make"
                  ? "bg-teal-600 text-white shadow-2xs"
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
              className={`min-h-[44px] px-2.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all active:scale-[0.98] flex items-center justify-center gap-1.5 ${
                paymentMethod === "cash"
                  ? "bg-orange-500 text-white shadow-2xs"
                  : "text-stone-600 hover:text-stone-900"
              }`}
            >
              <Banknote className="w-4 h-4 shrink-0" />
              <span>เงินสด</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleSaveOrder}
            disabled={draftCups.length === 0}
            className="w-full min-h-[54px] px-5 py-3 rounded-2xl bg-stone-900 hover:bg-stone-800 disabled:bg-stone-200 disabled:text-stone-400 text-amber-300 font-bold text-base shadow-sm active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <Check className="w-5 h-5" />
            <span>บันทึก &amp; ส่งคิว</span>
          </button>
        </div>
      </aside>
    </div>
  );
}
