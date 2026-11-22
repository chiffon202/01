// ============================================================================
// Booth Note — Storage Layer (localStorage implementation)
// ----------------------------------------------------------------------------
// All read/write operations for `orders`, `expenses`, and `settings` live here
// behind clear functions and the `BoothStorageAdapter` interface so this module
// can later be swapped from localStorage to Supabase Realtime with minimal UI changes.
// ============================================================================

export type PaymentMethod = "make" | "cash";
export type OrderStatus = "pending" | "done" | "void";

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  active: boolean;
}

export interface ToppingItem {
  id: string;
  name: string;
  price: number;
  active: boolean;
}

export interface OrderTopping {
  id: string;
  name: string;
  price: number;
}

export interface OrderItem {
  id: string;
  menuId: string;
  menuName: string;
  unitPrice: number;
  toppings: OrderTopping[];
  quantity: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  queueNumber: number; // Daily sequential number: 1, 2, 3... (#01, #02)
  dateKey: string; // YYYY-MM-DD in Asia/Bangkok (+07:00)
  items: OrderItem[];
  noteTags: string[];
  note: string;
  paymentMethod: PaymentMethod;
  totalAmount: number;
  status: OrderStatus;
  createdAt: string; // ISO 8601 UTC
  updatedAt: string; // ISO 8601 UTC
  completedAt?: string; // ISO 8601 UTC
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  dateKey: string; // YYYY-MM-DD in Asia/Bangkok (+07:00)
  createdAt: string;
  updatedAt: string;
}

export interface BoothSettings {
  boothName: string;
  budgetLimit: number;
  menus: MenuItem[];
  toppings: ToppingItem[];
  quickNotes: string[];
}

export interface BoothDataSnapshot {
  version: number;
  exportedAt: string;
  orders: Order[];
  expenses: Expense[];
  settings: BoothSettings;
}

export interface NewOrderItemInput {
  menuId: string;
  menuName: string;
  unitPrice: number;
  toppings: OrderTopping[];
  quantity: number;
}

export interface NewOrderInput {
  items: NewOrderItemInput[];
  noteTags: string[];
  note: string;
  paymentMethod: PaymentMethod;
}

export interface NewExpenseInput {
  title: string;
  amount: number;
  dateKey?: string;
}

export interface BoothStorageAdapter {
  getOrders: () => Order[];
  saveOrders: (orders: Order[]) => void;
  addOrder: (input: NewOrderInput) => { order: Order; orders: Order[] };
  updateOrderStatus: (orderId: string, status: OrderStatus) => Order[];
  deleteOrder: (orderId: string) => Order[];
  clearOrdersOnly: () => Order[];

  getExpenses: () => Expense[];
  saveExpenses: (expenses: Expense[]) => void;
  addExpense: (input: NewExpenseInput) => Expense[];
  updateExpense: (
    id: string,
    patch: { title: string; amount: number }
  ) => Expense[];
  deleteExpense: (id: string) => Expense[];

  getSettings: () => BoothSettings;
  saveSettings: (settings: BoothSettings) => void;

  exportAllData: () => BoothDataSnapshot;
  importAllData: (rawJson: string) => BoothDataSnapshot;
}

export const STORAGE_KEYS = {
  ORDERS: "booth_note:v1:orders",
  EXPENSES: "booth_note:v1:expenses",
  SETTINGS: "booth_note:v1:settings",
} as const;

const STORAGE_CHANGE_EVENT = "booth-note-storage-change";
const THAILAND_OFFSET_MS = 7 * 60 * 60 * 1000;

// ----------------------------------------------------------------------------
// Thailand (+07:00) Date & Formatting Helpers
// ----------------------------------------------------------------------------

/**
 * Returns YYYY-MM-DD in Thailand time (UTC+07:00).
 * Thailand does not observe DST, so explicit +7h UTC math is deterministic
 * across all browsers and offline environments.
 */
export function getThailandDateKey(
  input: Date | string | number = new Date()
): string {
  const date = input instanceof Date ? input : new Date(input);
  const thaiMs = date.getTime() + THAILAND_OFFSET_MS;
  const thaiDate = new Date(thaiMs);
  const y = thaiDate.getUTCFullYear();
  const m = String(thaiDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(thaiDate.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function formatThailandTime(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "--:--";
  const thaiDate = new Date(date.getTime() + THAILAND_OFFSET_MS);
  const hh = String(thaiDate.getUTCHours()).padStart(2, "0");
  const mm = String(thaiDate.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

const THAI_SHORT_MONTHS = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

export function formatThaiDateLabel(dateKey: string): string {
  const parts = dateKey.split("-");
  if (parts.length !== 3) return dateKey;
  const year = Number(parts[0]);
  const monthIdx = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  const monthLabel = THAI_SHORT_MONTHS[monthIdx] ?? parts[1];
  const buddhistYearShort = String((year + 543) % 100).padStart(2, "0");
  return `${day} ${monthLabel} ${buddhistYearShort}`;
}

export function formatQueueNumber(queueNumber: number): string {
  return `#${String(queueNumber).padStart(2, "0")}`;
}

export function formatBaht(amount: number): string {
  return new Intl.NumberFormat("th-TH", {
    maximumFractionDigits: 0,
  }).format(Math.round(amount));
}

// ----------------------------------------------------------------------------
// Defaults & Seed Data
// ----------------------------------------------------------------------------

export function createDefaultSettings(): BoothSettings {
  return {
    boothName: "Booth Note",
    budgetLimit: 3000,
    menus: [
      {
        id: "corn-butter",
        name: "ข้าวโพดคลุกเนย",
        price: 25,
        active: true,
      },
    ],
    toppings: [
      {
        id: "cheese",
        name: "ชีส",
        price: 10,
        active: true,
      },
      {
        id: "whip-cream",
        name: "วิปครีม",
        price: 10,
        active: true,
      },
    ],
    quickNotes: ["หวานน้อย", "ไม่ใส่เนย", "แยกท็อปปิ้ง"],
  };
}

export function createDefaultExpenses(): Expense[] {
  const now = new Date().toISOString();
  return [
    {
      id: "seed-initial-materials",
      title: "ค่าวัตถุดิบและอุปกรณ์รอบแรก",
      amount: 1500,
      dateKey: getThailandDateKey(),
      createdAt: now,
      updatedAt: now,
    },
  ];
}

// ----------------------------------------------------------------------------
// Snapshot Cache (Referentially Stable for React useSyncExternalStore)
// ----------------------------------------------------------------------------

const SERVER_ORDERS_SNAPSHOT: Order[] = [];
const SERVER_EXPENSES_SNAPSHOT: Expense[] = [];
const SERVER_SETTINGS_SNAPSHOT: BoothSettings = createDefaultSettings();

let cachedOrdersRaw: string | null = null;
let cachedOrdersValue: Order[] = SERVER_ORDERS_SNAPSHOT;

let cachedExpensesRaw: string | null = null;
let cachedExpensesValue: Expense[] = SERVER_EXPENSES_SNAPSHOT;

let cachedSettingsRaw: string | null = null;
let cachedSettingsValue: BoothSettings = SERVER_SETTINGS_SNAPSHOT;

// ----------------------------------------------------------------------------
// Internal Helpers
// ----------------------------------------------------------------------------

function isBrowser(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

export function generateId(prefix = "id"): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function safeParseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function notifyStorageChange(): void {
  if (!isBrowser()) return;
  window.dispatchEvent(new Event(STORAGE_CHANGE_EVENT));
}

export function subscribeStorageChange(callback: () => void): () => void {
  if (!isBrowser()) return () => {};
  const onCustom = () => callback();
  const onStorage = (event: StorageEvent) => {
    if (
      event.key === STORAGE_KEYS.ORDERS ||
      event.key === STORAGE_KEYS.EXPENSES ||
      event.key === STORAGE_KEYS.SETTINGS ||
      event.key === null
    ) {
      callback();
    }
  };
  window.addEventListener(STORAGE_CHANGE_EVENT, onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(STORAGE_CHANGE_EVENT, onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

// ----------------------------------------------------------------------------
// Orders CRUD
// ----------------------------------------------------------------------------

export function getOrders(): Order[] {
  if (!isBrowser()) return [];
  const raw = window.localStorage.getItem(STORAGE_KEYS.ORDERS);
  if (raw === null) {
    window.localStorage.setItem(STORAGE_KEYS.ORDERS, "[]");
    return [];
  }
  const parsed = safeParseJson<Order[]>(raw, []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveOrders(orders: Order[]): void {
  if (!isBrowser()) return;
  const serialized = JSON.stringify(orders);
  window.localStorage.setItem(STORAGE_KEYS.ORDERS, serialized);
  cachedOrdersRaw = serialized;
  cachedOrdersValue = orders;
  notifyStorageChange();
}

export function getNextQueueNumberForDate(
  orders: Order[],
  dateKey: string
): number {
  let maxQueue = 0;
  for (const order of orders) {
    if (order.dateKey === dateKey && order.queueNumber > maxQueue) {
      maxQueue = order.queueNumber;
    }
  }
  return maxQueue + 1;
}

export function addOrder(input: NewOrderInput): {
  order: Order;
  orders: Order[];
} {
  const existing = getOrders();
  const now = new Date();
  const nowIso = now.toISOString();
  const dateKey = getThailandDateKey(now);
  const queueNumber = getNextQueueNumberForDate(existing, dateKey);

  const items: OrderItem[] = input.items.map((item) => {
    const toppingsTotal = item.toppings.reduce((sum, t) => sum + t.price, 0);
    const lineUnit = item.unitPrice + toppingsTotal;
    const qty = Math.max(1, Math.round(item.quantity));
    return {
      id: generateId("item"),
      menuId: item.menuId,
      menuName: item.menuName,
      unitPrice: item.unitPrice,
      toppings: item.toppings,
      quantity: qty,
      lineTotal: lineUnit * qty,
    };
  });

  const totalAmount = items.reduce((sum, item) => sum + item.lineTotal, 0);

  const newOrder: Order = {
    id: generateId("ord"),
    queueNumber,
    dateKey,
    items,
    noteTags: input.noteTags,
    note: input.note.trim(),
    paymentMethod: input.paymentMethod,
    totalAmount,
    status: "pending",
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const nextOrders = [...existing, newOrder];
  saveOrders(nextOrders);
  return { order: newOrder, orders: nextOrders };
}

export function updateOrderStatus(
  orderId: string,
  status: OrderStatus
): Order[] {
  const existing = getOrders();
  const nowIso = new Date().toISOString();
  const nextOrders = existing.map((order) => {
    if (order.id !== orderId) return order;
    return {
      ...order,
      status,
      updatedAt: nowIso,
      completedAt: status === "done" ? nowIso : undefined,
    };
  });
  saveOrders(nextOrders);
  return nextOrders;
}

export function deleteOrder(orderId: string): Order[] {
  const existing = getOrders();
  const nextOrders = existing.filter((order) => order.id !== orderId);
  saveOrders(nextOrders);
  return nextOrders;
}

/**
 * Clears ONLY orders (e.g. test bills before opening day).
 * Expenses (such as the initial 1,500 THB material expense) and settings remain intact.
 */
export function clearOrdersOnly(): Order[] {
  saveOrders([]);
  return [];
}

// ----------------------------------------------------------------------------
// Expenses CRUD
// ----------------------------------------------------------------------------

export function getExpenses(): Expense[] {
  if (!isBrowser()) return [];
  const raw = window.localStorage.getItem(STORAGE_KEYS.EXPENSES);
  if (raw === null) {
    const seeded = createDefaultExpenses();
    window.localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(seeded));
    return seeded;
  }
  const parsed = safeParseJson<Expense[]>(raw, []);
  return Array.isArray(parsed) ? parsed : [];
}

export function saveExpenses(expenses: Expense[]): void {
  if (!isBrowser()) return;
  const serialized = JSON.stringify(expenses);
  window.localStorage.setItem(STORAGE_KEYS.EXPENSES, serialized);
  cachedExpensesRaw = serialized;
  cachedExpensesValue = expenses;
  notifyStorageChange();
}

export function addExpense(input: NewExpenseInput): Expense[] {
  const existing = getExpenses();
  const nowIso = new Date().toISOString();
  const expense: Expense = {
    id: generateId("exp"),
    title: input.title.trim(),
    amount: Math.max(0, Number(input.amount) || 0),
    dateKey: input.dateKey ?? getThailandDateKey(),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const nextExpenses = [expense, ...existing];
  saveExpenses(nextExpenses);
  return nextExpenses;
}

export function updateExpense(
  id: string,
  patch: { title: string; amount: number }
): Expense[] {
  const existing = getExpenses();
  const nowIso = new Date().toISOString();
  const nextExpenses = existing.map((item) => {
    if (item.id !== id) return item;
    return {
      ...item,
      title: patch.title.trim(),
      amount: Math.max(0, Number(patch.amount) || 0),
      updatedAt: nowIso,
    };
  });
  saveExpenses(nextExpenses);
  return nextExpenses;
}

export function deleteExpense(id: string): Expense[] {
  const existing = getExpenses();
  const nextExpenses = existing.filter((item) => item.id !== id);
  saveExpenses(nextExpenses);
  return nextExpenses;
}

// ----------------------------------------------------------------------------
// Settings CRUD
// ----------------------------------------------------------------------------

export function getSettings(): BoothSettings {
  if (!isBrowser()) return createDefaultSettings();
  const raw = window.localStorage.getItem(STORAGE_KEYS.SETTINGS);
  const defaults = createDefaultSettings();
  if (raw === null) {
    window.localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(defaults));
    return defaults;
  }
  const parsed = safeParseJson<Partial<BoothSettings>>(raw, defaults);
  return {
    boothName:
      typeof parsed.boothName === "string" && parsed.boothName.trim()
        ? parsed.boothName
        : defaults.boothName,
    budgetLimit:
      typeof parsed.budgetLimit === "number" && parsed.budgetLimit >= 0
        ? parsed.budgetLimit
        : defaults.budgetLimit,
    menus:
      Array.isArray(parsed.menus) && parsed.menus.length > 0
        ? parsed.menus
        : defaults.menus,
    toppings: Array.isArray(parsed.toppings)
      ? parsed.toppings
      : defaults.toppings,
    quickNotes:
      Array.isArray(parsed.quickNotes) && parsed.quickNotes.length > 0
        ? parsed.quickNotes
        : defaults.quickNotes,
  };
}

export function saveSettings(settings: BoothSettings): void {
  if (!isBrowser()) return;
  const serialized = JSON.stringify(settings);
  window.localStorage.setItem(STORAGE_KEYS.SETTINGS, serialized);
  cachedSettingsRaw = serialized;
  cachedSettingsValue = settings;
  notifyStorageChange();
}

// ----------------------------------------------------------------------------
// Backup & Restore (JSON Export / Import)
// ----------------------------------------------------------------------------

export function exportAllData(): BoothDataSnapshot {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    orders: getOrders(),
    expenses: getExpenses(),
    settings: getSettings(),
  };
}

export function importAllData(rawJson: string): BoothDataSnapshot {
  const parsed = JSON.parse(rawJson) as Partial<BoothDataSnapshot>;
  if (!parsed || typeof parsed !== "object") {
    throw new Error("รูปแบบไฟล์สำรองข้อมูลไม่ถูกต้อง");
  }
  if (!Array.isArray(parsed.orders) || !Array.isArray(parsed.expenses)) {
    throw new Error("ไม่พบข้อมูล orders หรือ expenses ในไฟล์นี้");
  }
  const defaults = createDefaultSettings();
  const mergedSettings: BoothSettings = {
    boothName: parsed.settings?.boothName || defaults.boothName,
    budgetLimit:
      typeof parsed.settings?.budgetLimit === "number"
        ? parsed.settings.budgetLimit
        : defaults.budgetLimit,
    menus:
      Array.isArray(parsed.settings?.menus) && parsed.settings.menus.length > 0
        ? parsed.settings.menus
        : defaults.menus,
    toppings: Array.isArray(parsed.settings?.toppings)
      ? parsed.settings.toppings
      : defaults.toppings,
    quickNotes:
      Array.isArray(parsed.settings?.quickNotes) &&
      parsed.settings.quickNotes.length > 0
        ? parsed.settings.quickNotes
        : defaults.quickNotes,
  };

  if (isBrowser()) {
    const ordersStr = JSON.stringify(parsed.orders);
    const expensesStr = JSON.stringify(parsed.expenses);
    const settingsStr = JSON.stringify(mergedSettings);

    window.localStorage.setItem(STORAGE_KEYS.ORDERS, ordersStr);
    window.localStorage.setItem(STORAGE_KEYS.EXPENSES, expensesStr);
    window.localStorage.setItem(STORAGE_KEYS.SETTINGS, settingsStr);

    cachedOrdersRaw = ordersStr;
    cachedOrdersValue = parsed.orders;
    cachedExpensesRaw = expensesStr;
    cachedExpensesValue = parsed.expenses;
    cachedSettingsRaw = settingsStr;
    cachedSettingsValue = mergedSettings;

    notifyStorageChange();
  }

  return {
    version: 1,
    exportedAt: parsed.exportedAt || new Date().toISOString(),
    orders: parsed.orders,
    expenses: parsed.expenses,
    settings: mergedSettings,
  };
}

// ----------------------------------------------------------------------------
// Snapshot Getters (for React useSyncExternalStore)
// ----------------------------------------------------------------------------

export function getOrdersSnapshot(): Order[] {
  if (!isBrowser()) return SERVER_ORDERS_SNAPSHOT;
  let raw = window.localStorage.getItem(STORAGE_KEYS.ORDERS);
  if (raw === null) {
    const seeded = getOrders();
    raw = window.localStorage.getItem(STORAGE_KEYS.ORDERS);
    cachedOrdersRaw = raw;
    cachedOrdersValue = seeded;
    return cachedOrdersValue;
  }
  if (raw === cachedOrdersRaw) {
    return cachedOrdersValue;
  }
  cachedOrdersRaw = raw;
  cachedOrdersValue = getOrders();
  return cachedOrdersValue;
}

export function getServerOrdersSnapshot(): Order[] {
  return SERVER_ORDERS_SNAPSHOT;
}

export function getExpensesSnapshot(): Expense[] {
  if (!isBrowser()) return SERVER_EXPENSES_SNAPSHOT;
  let raw = window.localStorage.getItem(STORAGE_KEYS.EXPENSES);
  if (raw === null) {
    const seeded = getExpenses();
    raw = window.localStorage.getItem(STORAGE_KEYS.EXPENSES);
    cachedExpensesRaw = raw;
    cachedExpensesValue = seeded;
    return cachedExpensesValue;
  }
  if (raw === cachedExpensesRaw) {
    return cachedExpensesValue;
  }
  cachedExpensesRaw = raw;
  cachedExpensesValue = getExpenses();
  return cachedExpensesValue;
}

export function getServerExpensesSnapshot(): Expense[] {
  return SERVER_EXPENSES_SNAPSHOT;
}

export function getSettingsSnapshot(): BoothSettings {
  if (!isBrowser()) return SERVER_SETTINGS_SNAPSHOT;
  let raw = window.localStorage.getItem(STORAGE_KEYS.SETTINGS);
  if (raw === null) {
    const seeded = getSettings();
    raw = window.localStorage.getItem(STORAGE_KEYS.SETTINGS);
    cachedSettingsRaw = raw;
    cachedSettingsValue = seeded;
    return cachedSettingsValue;
  }
  if (raw === cachedSettingsRaw) {
    return cachedSettingsValue;
  }
  cachedSettingsRaw = raw;
  cachedSettingsValue = getSettings();
  return cachedSettingsValue;
}

export function getServerSettingsSnapshot(): BoothSettings {
  return SERVER_SETTINGS_SNAPSHOT;
}

// Unified adapter object for easy future replacement with Supabase Realtime
export const localStorageBoothAdapter: BoothStorageAdapter = {
  getOrders,
  saveOrders,
  addOrder,
  updateOrderStatus,
  deleteOrder,
  clearOrdersOnly,
  getExpenses,
  saveExpenses,
  addExpense,
  updateExpense,
  deleteExpense,
  getSettings,
  saveSettings,
  exportAllData,
  importAllData,
};
