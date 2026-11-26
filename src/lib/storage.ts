// ============================================================================
// Treasurer Note — Storage Layer (localStorage implementation)
// ----------------------------------------------------------------------------
// Offline-first ledger storage for income/expense bills, math formulas,
// categories, receipt references, claimant names, and reimbursement status.
// Designed behind clean adapter functions for easy future cloud sync.
// ============================================================================

import { roundAmount } from "./mathEval";

export type EntryType = "expense" | "income";
export type PaymentChannel = "make" | "cash" | "bank" | "other";
export type ReimburseStatus = "settled" | "pending";

export interface LedgerEntry {
  id: string;
  type: EntryType;
  title: string;
  amount: number;
  formula?: string; // e.g. "120+45*2" when calculated from an expression
  category: string;
  channel: PaymentChannel;
  receiptRef: string; // Invoice / slip / receipt number
  personName: string; // Claimant / payer / recipient
  reimburseStatus: ReimburseStatus; // "settled" | "pending" (สำรองจ่ายรอคืน)
  note: string;
  dateKey: string; // YYYY-MM-DD in Asia/Bangkok (+07:00)
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

export interface LedgerSettings {
  ledgerName: string;
  organizationName: string;
  startingBudget: number;
  expenseCategories: string[];
  incomeCategories: string[];
}

export interface LedgerDataSnapshot {
  version: number;
  exportedAt: string;
  entries: LedgerEntry[];
  settings: LedgerSettings;
}

export interface NewLedgerEntryInput {
  type: EntryType;
  title: string;
  amount: number;
  formula?: string;
  category: string;
  channel: PaymentChannel;
  receiptRef: string;
  personName: string;
  reimburseStatus: ReimburseStatus;
  note: string;
  dateKey?: string;
}

export interface UpdateLedgerEntryPatch {
  type: EntryType;
  title: string;
  amount: number;
  formula?: string;
  category: string;
  channel: PaymentChannel;
  receiptRef: string;
  personName: string;
  reimburseStatus: ReimburseStatus;
  note: string;
  dateKey: string;
}

export interface LegacyBoothSummary {
  expensesCount: number;
  expensesTotal: number;
  ordersCount: number;
  salesTotal: number;
}

export const STORAGE_KEYS = {
  ENTRIES: "treasurer_note:v1:entries",
  SETTINGS: "treasurer_note:v1:settings",
  LEGACY_BOOTH_EXPENSES: "booth_note:v1:expenses",
  LEGACY_BOOTH_ORDERS: "booth_note:v1:orders",
  LEGACY_BOOTH_SETTINGS: "booth_note:v1:settings",
} as const;

export const CHANNEL_LABELS: Record<PaymentChannel, string> = {
  make: "โอน (MAKE)",
  cash: "เงินสด",
  bank: "บัญชีธนาคาร",
  other: "อื่น ๆ",
};

export const REIMBURSE_LABELS: Record<ReimburseStatus, string> = {
  settled: "จ่าย/เคลียร์แล้ว",
  pending: "สำรองจ่าย · รอคืนเงิน",
};

const STORAGE_CHANGE_EVENT = "treasurer-note-storage-change";
const THAILAND_OFFSET_MS = 7 * 60 * 60 * 1000;

export const roundCurrency = roundAmount;

// ----------------------------------------------------------------------------
// Thailand (+07:00) Date & Formatting Helpers
// ----------------------------------------------------------------------------

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

export function formatThaiDateFull(dateKey: string): string {
  const parts = dateKey.split("-");
  if (parts.length !== 3) return dateKey;
  const year = Number(parts[0]);
  const monthIdx = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  const monthLabel = THAI_SHORT_MONTHS[monthIdx] ?? parts[1];
  const buddhistYear = year + 543;
  return `${day} ${monthLabel} ${buddhistYear}`;
}

export function formatBaht(amount: number): string {
  const safe = roundCurrency(amount);
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(safe);
}

// ----------------------------------------------------------------------------
// Defaults
// ----------------------------------------------------------------------------

export const DEFAULT_EXPENSE_CATEGORIES: string[] = [
  "ค่าวัสดุ/อุปกรณ์",
  "ค่าอาหาร/เครื่องดื่ม",
  "ค่าเดินทาง/ขนส่ง",
  "ค่าเอกสาร/ปริ้นท์",
  "ค่าสถานที่/ตกแต่ง",
  "ค่าใช้จ่ายอื่น ๆ",
];

export const DEFAULT_INCOME_CATEGORIES: string[] = [
  "งบสนับสนุน/ตั้งต้น",
  "เก็บเงินสมทบ/สมาชิก",
  "รายรับกิจกรรม",
  "เงินคืน/อื่น ๆ",
];

export function createDefaultSettings(): LedgerSettings {
  return {
    ledgerName: "สมุดงบเหรัญญิก",
    organizationName: "ฝ่ายเหรัญญิก / บันทึกบิลและงบกิจกรรม",
    startingBudget: 3000,
    expenseCategories: [...DEFAULT_EXPENSE_CATEGORIES],
    incomeCategories: [...DEFAULT_INCOME_CATEGORIES],
  };
}

// ----------------------------------------------------------------------------
// Internal Utilities & Normalization
// ----------------------------------------------------------------------------

function isBrowser(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function generateId(prefix: string): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function safeParseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function notifyStorageChange(): void {
  if (!isBrowser()) return;
  window.dispatchEvent(new CustomEvent(STORAGE_CHANGE_EVENT));
}

export function subscribeStorageChange(callback: () => void): () => void {
  if (!isBrowser()) return () => {};
  const handleCustom = () => callback();
  const handleStorage = (e: StorageEvent) => {
    if (
      e.key === null ||
      e.key === STORAGE_KEYS.ENTRIES ||
      e.key === STORAGE_KEYS.SETTINGS
    ) {
      callback();
    }
  };
  window.addEventListener(STORAGE_CHANGE_EVENT, handleCustom);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(STORAGE_CHANGE_EVENT, handleCustom);
    window.removeEventListener("storage", handleStorage);
  };
}

function normalizeEntry(raw: unknown): LedgerEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const type: EntryType = obj.type === "income" ? "income" : "expense";
  const title =
    typeof obj.title === "string" && obj.title.trim()
      ? obj.title.trim()
      : "ไม่ระบุรายการ";
  const amount = roundCurrency(Math.max(0, Number(obj.amount) || 0));
  const formula =
    typeof obj.formula === "string" && obj.formula.trim()
      ? obj.formula.trim()
      : undefined;
  const category =
    typeof obj.category === "string" && obj.category.trim()
      ? obj.category.trim()
      : type === "income"
      ? "เงินคืน/อื่น ๆ"
      : "ค่าใช้จ่ายอื่น ๆ";
  const rawChannel = obj.channel;
  const channel: PaymentChannel =
    rawChannel === "make" ||
    rawChannel === "cash" ||
    rawChannel === "bank" ||
    rawChannel === "other"
      ? rawChannel
      : "make";
  const receiptRef =
    typeof obj.receiptRef === "string" ? obj.receiptRef.trim() : "";
  const personName =
    typeof obj.personName === "string" ? obj.personName.trim() : "";
  const reimburseStatus: ReimburseStatus =
    obj.reimburseStatus === "pending" ? "pending" : "settled";
  const note = typeof obj.note === "string" ? obj.note.trim() : "";
  const createdAt =
    typeof obj.createdAt === "string" && obj.createdAt
      ? obj.createdAt
      : new Date().toISOString();
  const updatedAt =
    typeof obj.updatedAt === "string" && obj.updatedAt
      ? obj.updatedAt
      : createdAt;
  const dateKey =
    typeof obj.dateKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(obj.dateKey)
      ? obj.dateKey
      : getThailandDateKey(createdAt);

  return {
    id: typeof obj.id === "string" && obj.id ? obj.id : generateId("tx"),
    type,
    title,
    amount,
    ...(formula ? { formula } : {}),
    category,
    channel,
    receiptRef,
    personName,
    reimburseStatus,
    note,
    dateKey,
    createdAt,
    updatedAt,
  };
}

function normalizeEntries(input: unknown): LedgerEntry[] {
  if (!Array.isArray(input)) return [];
  const normalized: LedgerEntry[] = [];
  for (const row of input) {
    const entry = normalizeEntry(row);
    if (entry) normalized.push(entry);
  }
  return normalized;
}

function normalizeCategoryList(input: unknown, fallback: string[]): string[] {
  if (!Array.isArray(input)) return [...fallback];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of input) {
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (trimmed && !seen.has(trimmed)) {
        seen.add(trimmed);
        result.push(trimmed);
      }
    }
  }
  return result.length > 0 ? result : [...fallback];
}

function normalizeSettings(input: unknown): LedgerSettings {
  const defaults = createDefaultSettings();
  if (!input || typeof input !== "object") return defaults;
  const obj = input as Record<string, unknown>;
  const startingBudget =
    typeof obj.startingBudget === "number" &&
    Number.isFinite(obj.startingBudget) &&
    obj.startingBudget >= 0
      ? roundCurrency(obj.startingBudget)
      : defaults.startingBudget;

  return {
    ledgerName:
      typeof obj.ledgerName === "string" && obj.ledgerName.trim()
        ? obj.ledgerName.trim()
        : defaults.ledgerName,
    organizationName:
      typeof obj.organizationName === "string"
        ? obj.organizationName.trim()
        : defaults.organizationName,
    startingBudget,
    expenseCategories: normalizeCategoryList(
      obj.expenseCategories,
      defaults.expenseCategories
    ),
    incomeCategories: normalizeCategoryList(
      obj.incomeCategories,
      defaults.incomeCategories
    ),
  };
}

// ----------------------------------------------------------------------------
// Snapshot Caching for useSyncExternalStore
// ----------------------------------------------------------------------------

const SERVER_ENTRIES_SNAPSHOT: LedgerEntry[] = [];
const SERVER_SETTINGS_SNAPSHOT: LedgerSettings = createDefaultSettings();

let cachedEntriesRaw: string | null = null;
let cachedEntriesValue: LedgerEntry[] = SERVER_ENTRIES_SNAPSHOT;

let cachedSettingsRaw: string | null = null;
let cachedSettingsValue: LedgerSettings = SERVER_SETTINGS_SNAPSHOT;

// ----------------------------------------------------------------------------
// Entries CRUD
// ----------------------------------------------------------------------------

export function getEntries(): LedgerEntry[] {
  if (!isBrowser()) return [];
  const raw = window.localStorage.getItem(STORAGE_KEYS.ENTRIES);
  if (raw === null) {
    window.localStorage.setItem(STORAGE_KEYS.ENTRIES, "[]");
    cachedEntriesRaw = "[]";
    cachedEntriesValue = [];
    return [];
  }
  const parsed = safeParseJson<unknown>(raw);
  return normalizeEntries(parsed);
}

export function saveEntries(entries: LedgerEntry[]): void {
  if (!isBrowser()) return;
  const str = JSON.stringify(entries);
  window.localStorage.setItem(STORAGE_KEYS.ENTRIES, str);
  cachedEntriesRaw = str;
  cachedEntriesValue = entries;
  notifyStorageChange();
}

export function addEntry(input: NewLedgerEntryInput): LedgerEntry[] {
  const existing = getEntries();
  const nowIso = new Date().toISOString();
  const dateKey =
    input.dateKey && /^\d{4}-\d{2}-\d{2}$/.test(input.dateKey)
      ? input.dateKey
      : getThailandDateKey();

  const newEntry: LedgerEntry = {
    id: generateId("tx"),
    type: input.type,
    title: input.title.trim() || "ไม่ระบุรายการ",
    amount: roundCurrency(Math.max(0, input.amount)),
    ...(input.formula && input.formula.trim()
      ? { formula: input.formula.trim() }
      : {}),
    category: input.category.trim() || "ค่าใช้จ่ายอื่น ๆ",
    channel: input.channel,
    receiptRef: input.receiptRef.trim(),
    personName: input.personName.trim(),
    reimburseStatus: input.reimburseStatus,
    note: input.note.trim(),
    dateKey,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const next = [newEntry, ...existing];
  saveEntries(next);
  return next;
}

export function updateEntry(
  id: string,
  patch: UpdateLedgerEntryPatch
): LedgerEntry[] {
  const existing = getEntries();
  const nowIso = new Date().toISOString();
  const next = existing.map((entry) => {
    if (entry.id !== id) return entry;
    const updated: LedgerEntry = {
      ...entry,
      type: patch.type,
      title: patch.title.trim() || entry.title,
      amount: roundCurrency(Math.max(0, patch.amount)),
      category: patch.category.trim() || entry.category,
      channel: patch.channel,
      receiptRef: patch.receiptRef.trim(),
      personName: patch.personName.trim(),
      reimburseStatus: patch.reimburseStatus,
      note: patch.note.trim(),
      dateKey: /^\d{4}-\d{2}-\d{2}$/.test(patch.dateKey)
        ? patch.dateKey
        : entry.dateKey,
      updatedAt: nowIso,
    };
    if (patch.formula && patch.formula.trim()) {
      updated.formula = patch.formula.trim();
    } else {
      delete updated.formula;
    }
    return updated;
  });
  saveEntries(next);
  return next;
}

export function toggleReimburseStatus(id: string): LedgerEntry[] {
  const existing = getEntries();
  const nowIso = new Date().toISOString();
  const next = existing.map((entry) =>
    entry.id === id
      ? {
          ...entry,
          reimburseStatus:
            entry.reimburseStatus === "pending"
              ? ("settled" as const)
              : ("pending" as const),
          updatedAt: nowIso,
        }
      : entry
  );
  saveEntries(next);
  return next;
}

export function settlePersonPending(personName: string): LedgerEntry[] {
  const target = personName.trim();
  const existing = getEntries();
  const nowIso = new Date().toISOString();
  const next = existing.map((entry) => {
    if (
      entry.reimburseStatus === "pending" &&
      (entry.personName.trim() || "ไม่ระบุชื่อ") === target
    ) {
      return {
        ...entry,
        reimburseStatus: "settled" as const,
        updatedAt: nowIso,
      };
    }
    return entry;
  });
  saveEntries(next);
  return next;
}

export function deleteEntry(id: string): LedgerEntry[] {
  const next = getEntries().filter((entry) => entry.id !== id);
  saveEntries(next);
  return next;
}

export function clearAllEntries(): LedgerEntry[] {
  saveEntries([]);
  return [];
}

// ----------------------------------------------------------------------------
// Settings CRUD
// ----------------------------------------------------------------------------

export function getSettings(): LedgerSettings {
  if (!isBrowser()) return createDefaultSettings();
  const raw = window.localStorage.getItem(STORAGE_KEYS.SETTINGS);
  if (raw === null) {
    const defaults = createDefaultSettings();
    const str = JSON.stringify(defaults);
    window.localStorage.setItem(STORAGE_KEYS.SETTINGS, str);
    cachedSettingsRaw = str;
    cachedSettingsValue = defaults;
    return defaults;
  }
  return normalizeSettings(safeParseJson<unknown>(raw));
}

export function saveSettings(settings: LedgerSettings): void {
  if (!isBrowser()) return;
  const normalized = normalizeSettings(settings);
  const str = JSON.stringify(normalized);
  window.localStorage.setItem(STORAGE_KEYS.SETTINGS, str);
  cachedSettingsRaw = str;
  cachedSettingsValue = normalized;
  notifyStorageChange();
}

// ----------------------------------------------------------------------------
// Snapshot Export / Import & Legacy Booth Note Importer
// ----------------------------------------------------------------------------

export function exportAllData(): LedgerDataSnapshot {
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    entries: getEntries(),
    settings: getSettings(),
  };
}

export function importAllData(rawJson: string): LedgerDataSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("ไฟล์ JSON ไม่ถูกต้อง");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("โครงสร้างไฟล์สำรองข้อมูลไม่ถูกต้อง");
  }
  const obj = parsed as Record<string, unknown>;

  // Support importing either v2 Treasurer format OR v1 Booth Note backup JSON
  let entries: LedgerEntry[] = [];
  let settings: LedgerSettings = getSettings();

  if (Array.isArray(obj.entries)) {
    entries = normalizeEntries(obj.entries);
    if (obj.settings) {
      settings = normalizeSettings(obj.settings);
    }
  } else if (Array.isArray(obj.expenses) || Array.isArray(obj.orders)) {
    // Convert legacy Booth Note JSON snapshot smoothly
    const legacyExpenses = Array.isArray(obj.expenses) ? obj.expenses : [];
    const legacyOrders = Array.isArray(obj.orders) ? obj.orders : [];
    const convertedExpenses: LedgerEntry[] = [];

    for (const row of legacyExpenses) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const createdAt =
        typeof r.createdAt === "string"
          ? r.createdAt
          : new Date().toISOString();
      const dateKey =
        typeof r.dateKey === "string"
          ? r.dateKey
          : getThailandDateKey(createdAt);
      convertedExpenses.push({
        id: typeof r.id === "string" ? `imp_${r.id}` : generateId("tx"),
        type: "expense",
        title: typeof r.title === "string" ? r.title : "รายจ่ายจาก Booth Note",
        amount: roundCurrency(Math.max(0, Number(r.amount) || 0)),
        category: "ค่าวัสดุ/อุปกรณ์",
        channel: "make",
        receiptRef: "",
        personName: "",
        reimburseStatus: "settled",
        note: "นำเข้าจากไฟล์สำรอง Booth Note",
        dateKey,
        createdAt,
        updatedAt: createdAt,
      });
    }

    // Aggregate legacy non-void/non-waste sales per day as income entries
    const salesByDay = new Map<string, { make: number; cash: number; cups: number }>();
    for (const row of legacyOrders) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      if (r.status === "void" || r.status === "waste") continue;
      const dateKey =
        typeof r.dateKey === "string" ? r.dateKey : getThailandDateKey();
      const amount = roundCurrency(Math.max(0, Number(r.totalAmount) || 0));
      const cur = salesByDay.get(dateKey) ?? { make: 0, cash: 0, cups: 0 };
      if (r.paymentMethod === "cash") cur.cash += amount;
      else cur.make += amount;
      cur.cups += 1;
      salesByDay.set(dateKey, cur);
    }

    const convertedSales: LedgerEntry[] = [];
    for (const [dateKey, totals] of salesByDay.entries()) {
      if (totals.make > 0) {
        convertedSales.push({
          id: generateId("tx"),
          type: "income",
          title: `ยอดขายบูธโอน MAKE (${formatThaiDateLabel(dateKey)})`,
          amount: roundCurrency(totals.make),
          category: "รายรับกิจกรรม",
          channel: "make",
          receiptRef: `BOOTH-${dateKey}`,
          personName: "",
          reimburseStatus: "settled",
          note: "นำเข้ายอดขายโอนจาก Booth Note",
          dateKey,
          createdAt: `${dateKey}T20:00:00.000+07:00`,
          updatedAt: new Date().toISOString(),
        });
      }
      if (totals.cash > 0) {
        convertedSales.push({
          id: generateId("tx"),
          type: "income",
          title: `ยอดขายบูธเงินสด (${formatThaiDateLabel(dateKey)})`,
          amount: roundCurrency(totals.cash),
          category: "รายรับกิจกรรม",
          channel: "cash",
          receiptRef: `BOOTH-CASH-${dateKey}`,
          personName: "",
          reimburseStatus: "settled",
          note: "นำเข้ายอดขายเงินสดจาก Booth Note",
          dateKey,
          createdAt: `${dateKey}T20:05:00.000+07:00`,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    entries = [...convertedSales, ...convertedExpenses].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
    if (obj.settings && typeof obj.settings === "object") {
      const s = obj.settings as Record<string, unknown>;
      settings = {
        ...createDefaultSettings(),
        ledgerName:
          typeof s.boothName === "string" && s.boothName.trim()
            ? s.boothName.trim()
            : "สมุดงบเหรัญญิก",
        startingBudget:
          typeof s.budgetLimit === "number" && s.budgetLimit >= 0
            ? roundCurrency(s.budgetLimit)
            : 3000,
      };
    }
  } else {
    throw new Error("ไม่พบข้อมูล entries ในไฟล์สำรองข้อมูล");
  }

  saveEntries(entries);
  saveSettings(settings);

  return {
    version: 2,
    exportedAt:
      typeof obj.exportedAt === "string"
        ? obj.exportedAt
        : new Date().toISOString(),
    entries,
    settings,
  };
}

export function getLegacyBoothSummary(): LegacyBoothSummary | null {
  if (!isBrowser()) return null;
  const rawExp = window.localStorage.getItem(STORAGE_KEYS.LEGACY_BOOTH_EXPENSES);
  const rawOrd = window.localStorage.getItem(STORAGE_KEYS.LEGACY_BOOTH_ORDERS);
  const expenses = safeParseJson<unknown[]>(rawExp) ?? [];
  const orders = safeParseJson<unknown[]>(rawOrd) ?? [];
  if (!Array.isArray(expenses) && !Array.isArray(orders)) return null;

  let expensesCount = 0;
  let expensesTotal = 0;
  for (const row of expenses) {
    if (row && typeof row === "object") {
      expensesCount += 1;
      expensesTotal += Number((row as Record<string, unknown>).amount) || 0;
    }
  }

  let ordersCount = 0;
  let salesTotal = 0;
  for (const row of orders) {
    if (row && typeof row === "object") {
      const r = row as Record<string, unknown>;
      if (r.status === "void" || r.status === "waste") continue;
      ordersCount += 1;
      salesTotal += Number(r.totalAmount) || 0;
    }
  }

  if (expensesCount === 0 && ordersCount === 0) return null;
  return {
    expensesCount,
    expensesTotal: roundCurrency(expensesTotal),
    ordersCount,
    salesTotal: roundCurrency(salesTotal),
  };
}

export function importLegacyBoothFromDevice(): number {
  if (!isBrowser()) return 0;
  const rawExp = window.localStorage.getItem(STORAGE_KEYS.LEGACY_BOOTH_EXPENSES);
  const rawOrd = window.localStorage.getItem(STORAGE_KEYS.LEGACY_BOOTH_ORDERS);
  const rawSet = window.localStorage.getItem(STORAGE_KEYS.LEGACY_BOOTH_SETTINGS);
  const payload = JSON.stringify({
    expenses: safeParseJson<unknown[]>(rawExp) ?? [],
    orders: safeParseJson<unknown[]>(rawOrd) ?? [],
    settings: safeParseJson<Record<string, unknown>>(rawSet) ?? {},
  });
  const imported = importAllData(payload);
  return imported.entries.length;
}

// ----------------------------------------------------------------------------
// Snapshot Getters for React useSyncExternalStore
// ----------------------------------------------------------------------------

export function getEntriesSnapshot(): LedgerEntry[] {
  if (!isBrowser()) return SERVER_ENTRIES_SNAPSHOT;
  let raw = window.localStorage.getItem(STORAGE_KEYS.ENTRIES);
  if (raw === null) {
    const seeded = getEntries();
    raw = window.localStorage.getItem(STORAGE_KEYS.ENTRIES);
    cachedEntriesRaw = raw;
    cachedEntriesValue = seeded;
    return cachedEntriesValue;
  }
  if (raw === cachedEntriesRaw) {
    return cachedEntriesValue;
  }
  cachedEntriesRaw = raw;
  cachedEntriesValue = getEntries();
  return cachedEntriesValue;
}

export function getServerEntriesSnapshot(): LedgerEntry[] {
  return SERVER_ENTRIES_SNAPSHOT;
}

export function getSettingsSnapshot(): LedgerSettings {
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

export function getServerSettingsSnapshot(): LedgerSettings {
  return SERVER_SETTINGS_SNAPSHOT;
}
