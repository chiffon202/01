// ============================================================================
// Treasurer Note — Storage Layer (Multi-Project Offline Ledger)
// ----------------------------------------------------------------------------
// Clean slate per activity/project (zero default fake budgets).
// All metadata persists in localStorage; receipt photos persist in IndexedDB.
// ============================================================================

import { roundAmount } from "./mathEval";
import { deleteReceiptImage } from "./imageStore";

export type EntryType = "expense" | "income";
export type PaymentChannel = "make" | "cash" | "bank" | "other";
export type ReimburseStatus = "settled" | "pending";

export interface ActivityProject {
  id: string;
  name: string;
  organizationName: string;
  budgetLimit: number; // 0 = no fixed budget cap
  createdAt: string;
}

export interface LedgerEntry {
  id: string;
  projectId: string;
  type: EntryType;
  title: string;
  amount: number;
  formula?: string;
  category: string;
  channel: PaymentChannel;
  receiptRef: string;
  personName: string;
  reimburseStatus: ReimburseStatus;
  verified: boolean; // True once treasurer checks receipt / reconciles total
  imageId?: string; // Reference key in IndexedDB receipt store
  note: string;
  dateKey: string; // YYYY-MM-DD in Asia/Bangkok (+07:00)
  createdAt: string;
  updatedAt: string;
}

export interface LedgerSettings {
  activeProjectId: string;
  expenseCategories: string[];
  incomeCategories: string[];
}

export interface LedgerDataSnapshot {
  version: number;
  exportedAt: string;
  projects: ActivityProject[];
  entries: LedgerEntry[];
  settings: LedgerSettings;
}

export interface NewLedgerEntryInput {
  projectId: string;
  type: EntryType;
  title: string;
  amount: number;
  formula?: string;
  category: string;
  channel: PaymentChannel;
  receiptRef: string;
  personName: string;
  reimburseStatus: ReimburseStatus;
  verified?: boolean;
  imageId?: string;
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
  verified?: boolean;
  imageId?: string;
  note: string;
  dateKey: string;
}

export const STORAGE_KEYS = {
  PROJECTS: "treasurer_note:v2:projects",
  ENTRIES: "treasurer_note:v2:entries",
  SETTINGS: "treasurer_note:v2:settings",
} as const;

export const CHANNEL_LABELS: Record<PaymentChannel, string> = {
  make: "โอน (MAKE)",
  cash: "เงินสด",
  bank: "บัญชีธนาคาร",
  other: "อื่น ๆ",
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
// Defaults (Clean Slate: 0 Baht, No Dummy Data)
// ----------------------------------------------------------------------------

export const DEFAULT_PROJECT_ID = "proj_default";

export const DEFAULT_EXPENSE_CATEGORIES: string[] = [
  "ค่าวัสดุ/อุปกรณ์",
  "ค่าอาหาร/เครื่องดื่ม",
  "ค่าเดินทาง/ขนส่ง",
  "ค่าเอกสาร/ปริ้นท์",
  "อื่น ๆ",
];

export const DEFAULT_INCOME_CATEGORIES: string[] = [
  "งบกิจกรรม/สนับสนุน",
  "เก็บเงินสมาชิก",
  "รายรับอื่น ๆ",
];

export function createDefaultProject(): ActivityProject {
  return {
    id: DEFAULT_PROJECT_ID,
    name: "กิจกรรมที่ 1",
    organizationName: "",
    budgetLimit: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

export function createDefaultSettings(): LedgerSettings {
  return {
    activeProjectId: DEFAULT_PROJECT_ID,
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
      e.key === STORAGE_KEYS.PROJECTS ||
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

function normalizeProject(raw: unknown): ActivityProject | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const id =
    typeof obj.id === "string" && obj.id.trim()
      ? obj.id.trim()
      : generateId("proj");
  const name =
    typeof obj.name === "string" && obj.name.trim()
      ? obj.name.trim()
      : "กิจกรรมไม่มีชื่อ";
  const organizationName =
    typeof obj.organizationName === "string" ? obj.organizationName.trim() : "";
  const budgetLimit =
    typeof obj.budgetLimit === "number" &&
    Number.isFinite(obj.budgetLimit) &&
    obj.budgetLimit >= 0
      ? roundCurrency(obj.budgetLimit)
      : 0;
  const createdAt =
    typeof obj.createdAt === "string" && obj.createdAt
      ? obj.createdAt
      : "2026-01-01T00:00:00.000Z";
  return { id, name, organizationName, budgetLimit, createdAt };
}

function normalizeProjects(input: unknown): ActivityProject[] {
  if (!Array.isArray(input)) return [createDefaultProject()];
  const result: ActivityProject[] = [];
  for (const row of input) {
    const proj = normalizeProject(row);
    if (proj) result.push(proj);
  }
  return result.length > 0 ? result : [createDefaultProject()];
}

function normalizeEntry(
  raw: unknown,
  fallbackProjectId: string
): LedgerEntry | null {
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
      ? "รายรับอื่น ๆ"
      : "อื่น ๆ";
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
  const verified = Boolean(obj.verified);
  const imageId =
    typeof obj.imageId === "string" && obj.imageId.trim()
      ? obj.imageId.trim()
      : undefined;
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
  const projectId =
    typeof obj.projectId === "string" && obj.projectId.trim()
      ? obj.projectId.trim()
      : fallbackProjectId;

  return {
    id: typeof obj.id === "string" && obj.id ? obj.id : generateId("tx"),
    projectId,
    type,
    title,
    amount,
    ...(formula ? { formula } : {}),
    category,
    channel,
    receiptRef,
    personName,
    reimburseStatus,
    verified,
    ...(imageId ? { imageId } : {}),
    note,
    dateKey,
    createdAt,
    updatedAt,
  };
}

function normalizeEntries(
  input: unknown,
  fallbackProjectId: string
): LedgerEntry[] {
  if (!Array.isArray(input)) return [];
  const normalized: LedgerEntry[] = [];
  for (const row of input) {
    const entry = normalizeEntry(row, fallbackProjectId);
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
  return {
    activeProjectId:
      typeof obj.activeProjectId === "string" && obj.activeProjectId.trim()
        ? obj.activeProjectId.trim()
        : defaults.activeProjectId,
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

const SERVER_PROJECTS_SNAPSHOT: ActivityProject[] = [createDefaultProject()];
const SERVER_ENTRIES_SNAPSHOT: LedgerEntry[] = [];
const SERVER_SETTINGS_SNAPSHOT: LedgerSettings = createDefaultSettings();

let cachedProjectsRaw: string | null = null;
let cachedProjectsValue: ActivityProject[] = SERVER_PROJECTS_SNAPSHOT;

let cachedEntriesRaw: string | null = null;
let cachedEntriesValue: LedgerEntry[] = SERVER_ENTRIES_SNAPSHOT;

let cachedSettingsRaw: string | null = null;
let cachedSettingsValue: LedgerSettings = SERVER_SETTINGS_SNAPSHOT;

// ----------------------------------------------------------------------------
// Projects CRUD
// ----------------------------------------------------------------------------

export function getProjects(): ActivityProject[] {
  if (!isBrowser()) return SERVER_PROJECTS_SNAPSHOT;
  const raw = window.localStorage.getItem(STORAGE_KEYS.PROJECTS);
  if (raw === null) {
    const initial = [createDefaultProject()];
    const str = JSON.stringify(initial);
    window.localStorage.setItem(STORAGE_KEYS.PROJECTS, str);
    cachedProjectsRaw = str;
    cachedProjectsValue = initial;
    return initial;
  }
  return normalizeProjects(safeParseJson<unknown>(raw));
}

export function saveProjects(projects: ActivityProject[]): void {
  if (!isBrowser()) return;
  const safe = projects.length > 0 ? projects : [createDefaultProject()];
  const str = JSON.stringify(safe);
  window.localStorage.setItem(STORAGE_KEYS.PROJECTS, str);
  cachedProjectsRaw = str;
  cachedProjectsValue = safe;
  notifyStorageChange();
}

export function addProject(input: {
  name: string;
  organizationName?: string;
  budgetLimit?: number;
}): ActivityProject {
  const projects = getProjects();
  const newProj: ActivityProject = {
    id: generateId("proj"),
    name: input.name.trim() || `กิจกรรมที่ ${projects.length + 1}`,
    organizationName: input.organizationName?.trim() ?? "",
    budgetLimit: roundCurrency(Math.max(0, input.budgetLimit ?? 0)),
    createdAt: new Date().toISOString(),
  };
  saveProjects([...projects, newProj]);
  const settings = getSettings();
  saveSettings({ ...settings, activeProjectId: newProj.id });
  return newProj;
}

export function updateProject(
  id: string,
  patch: { name: string; organizationName: string; budgetLimit: number }
): void {
  const projects = getProjects();
  const next = projects.map((p) =>
    p.id === id
      ? {
          ...p,
          name: patch.name.trim() || p.name,
          organizationName: patch.organizationName.trim(),
          budgetLimit: roundCurrency(Math.max(0, patch.budgetLimit)),
        }
      : p
  );
  saveProjects(next);
}

export function deleteProject(id: string): void {
  const projects = getProjects();
  if (projects.length <= 1) return; // Always keep at least 1 project

  // Clean up entries + images belonging to this project
  const entries = getEntries();
  const toDelete = entries.filter((e) => e.projectId === id);
  for (const e of toDelete) {
    if (e.imageId) void deleteReceiptImage(e.imageId);
  }
  saveEntries(entries.filter((e) => e.projectId !== id));

  const nextProjects = projects.filter((p) => p.id !== id);
  saveProjects(nextProjects);

  const settings = getSettings();
  if (settings.activeProjectId === id) {
    saveSettings({ ...settings, activeProjectId: nextProjects[0].id });
  }
}

export function setActiveProjectId(projectId: string): void {
  const settings = getSettings();
  saveSettings({ ...settings, activeProjectId: projectId });
}

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
  return normalizeEntries(safeParseJson<unknown>(raw), DEFAULT_PROJECT_ID);
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
    projectId: input.projectId || DEFAULT_PROJECT_ID,
    type: input.type,
    title: input.title.trim() || "ไม่ระบุรายการ",
    amount: roundCurrency(Math.max(0, input.amount)),
    ...(input.formula && input.formula.trim()
      ? { formula: input.formula.trim() }
      : {}),
    category: input.category.trim() || "อื่น ๆ",
    channel: input.channel,
    receiptRef: input.receiptRef.trim(),
    personName: input.personName.trim(),
    reimburseStatus: input.reimburseStatus,
    verified: Boolean(input.verified),
    ...(input.imageId ? { imageId: input.imageId } : {}),
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
      verified: patch.verified ?? entry.verified,
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
    if (patch.imageId !== undefined) {
      if (patch.imageId) updated.imageId = patch.imageId;
      else delete updated.imageId;
    }
    return updated;
  });
  saveEntries(next);
  return next;
}

export function toggleEntryVerified(id: string): LedgerEntry[] {
  const existing = getEntries();
  const nowIso = new Date().toISOString();
  const next = existing.map((entry) =>
    entry.id === id
      ? { ...entry, verified: !entry.verified, updatedAt: nowIso }
      : entry
  );
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

export function settlePersonPending(
  projectId: string,
  personName: string
): LedgerEntry[] {
  const target = personName.trim();
  const existing = getEntries();
  const nowIso = new Date().toISOString();
  const next = existing.map((entry) => {
    if (
      entry.projectId === projectId &&
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
  const existing = getEntries();
  const target = existing.find((e) => e.id === id);
  if (target?.imageId) {
    void deleteReceiptImage(target.imageId);
  }
  const next = existing.filter((entry) => entry.id !== id);
  saveEntries(next);
  return next;
}

export function clearProjectEntries(projectId: string): LedgerEntry[] {
  const existing = getEntries();
  for (const e of existing) {
    if (e.projectId === projectId && e.imageId) {
      void deleteReceiptImage(e.imageId);
    }
  }
  const next = existing.filter((entry) => entry.projectId !== projectId);
  saveEntries(next);
  return next;
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
// Snapshot Export / Import
// ----------------------------------------------------------------------------

export function exportAllData(): LedgerDataSnapshot {
  return {
    version: 3,
    exportedAt: new Date().toISOString(),
    projects: getProjects(),
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
  if (!Array.isArray(obj.entries)) {
    throw new Error("ไม่พบข้อมูลรายการในไฟล์สำรอง");
  }

  const projects = Array.isArray(obj.projects)
    ? normalizeProjects(obj.projects)
    : getProjects();
  const fallbackProjId = projects[0]?.id ?? DEFAULT_PROJECT_ID;
  const entries = normalizeEntries(obj.entries, fallbackProjId);
  const settings = obj.settings
    ? normalizeSettings(obj.settings)
    : getSettings();

  if (!projects.some((p) => p.id === settings.activeProjectId)) {
    settings.activeProjectId = fallbackProjId;
  }

  saveProjects(projects);
  saveEntries(entries);
  saveSettings(settings);

  return {
    version: 3,
    exportedAt:
      typeof obj.exportedAt === "string"
        ? obj.exportedAt
        : new Date().toISOString(),
    projects,
    entries,
    settings,
  };
}

// ----------------------------------------------------------------------------
// Snapshot Getters for React useSyncExternalStore
// ----------------------------------------------------------------------------

export function getProjectsSnapshot(): ActivityProject[] {
  if (!isBrowser()) return SERVER_PROJECTS_SNAPSHOT;
  let raw = window.localStorage.getItem(STORAGE_KEYS.PROJECTS);
  if (raw === null) {
    const seeded = getProjects();
    raw = window.localStorage.getItem(STORAGE_KEYS.PROJECTS);
    cachedProjectsRaw = raw;
    cachedProjectsValue = seeded;
    return cachedProjectsValue;
  }
  if (raw === cachedProjectsRaw) return cachedProjectsValue;
  cachedProjectsRaw = raw;
  cachedProjectsValue = getProjects();
  return cachedProjectsValue;
}

export function getServerProjectsSnapshot(): ActivityProject[] {
  return SERVER_PROJECTS_SNAPSHOT;
}

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
  if (raw === cachedEntriesRaw) return cachedEntriesValue;
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
  if (raw === cachedSettingsRaw) return cachedSettingsValue;
  cachedSettingsRaw = raw;
  cachedSettingsValue = getSettings();
  return cachedSettingsValue;
}

export function getServerSettingsSnapshot(): LedgerSettings {
  return SERVER_SETTINGS_SNAPSHOT;
}
