"use client";

import React from "react";
import {
  CHANNEL_LABELS,
  LedgerEntry,
  LedgerSettings,
  formatBaht,
  formatThaiDateFull,
  formatThaiDateLabel,
  roundCurrency,
} from "@/lib/storage";

interface PrintableReportProps {
  settings: LedgerSettings;
  entries: LedgerEntry[];
  dateRangeLabel: string;
  generatedDateLabel: string;
}

export function PrintableReport({
  settings,
  entries,
  dateRangeLabel,
  generatedDateLabel,
}: PrintableReportProps) {
  const sortedAsc = [...entries].sort((a, b) => {
    const dateCmp = a.dateKey.localeCompare(b.dateKey);
    if (dateCmp !== 0) return dateCmp;
    return a.createdAt.localeCompare(b.createdAt);
  });

  let totalIncome = 0;
  let totalExpense = 0;
  let pendingTotal = 0;
  let pendingCount = 0;

  const expenseByCategory = new Map<string, { amount: number; count: number }>();
  const incomeByCategory = new Map<string, { amount: number; count: number }>();
  const pendingByPerson = new Map<string, { amount: number; count: number }>();

  for (const e of sortedAsc) {
    if (e.type === "income") {
      totalIncome += e.amount;
      const cur = incomeByCategory.get(e.category) ?? { amount: 0, count: 0 };
      cur.amount += e.amount;
      cur.count += 1;
      incomeByCategory.set(e.category, cur);
    } else {
      totalExpense += e.amount;
      const cur = expenseByCategory.get(e.category) ?? { amount: 0, count: 0 };
      cur.amount += e.amount;
      cur.count += 1;
      expenseByCategory.set(e.category, cur);
    }

    if (e.reimburseStatus === "pending") {
      pendingTotal += e.amount;
      pendingCount += 1;
      const person = e.personName.trim() || "ไม่ระบุชื่อ";
      const curP = pendingByPerson.get(person) ?? { amount: 0, count: 0 };
      curP.amount += e.amount;
      curP.count += 1;
      pendingByPerson.set(person, curP);
    }
  }

  const totalPool = roundCurrency(settings.startingBudget + totalIncome);
  const netBalance = roundCurrency(totalPool - totalExpense);

  const expenseCategories = Array.from(expenseByCategory.entries()).sort(
    (a, b) => b[1].amount - a[1].amount
  );
  const incomeCategories = Array.from(incomeByCategory.entries()).sort(
    (a, b) => b[1].amount - a[1].amount
  );
  const pendingPersons = Array.from(pendingByPerson.entries()).sort(
    (a, b) => b[1].amount - a[1].amount
  );

  return (
    <div className="bg-white text-stone-900 p-6 sm:p-8 print:p-0 text-[13px] leading-relaxed">
      {/* Header */}
      <div className="border-b-2 border-stone-800 pb-4 mb-5 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-500">
            รายงานสรุปบัญชีรายรับ-รายจ่าย &amp; งบประมาณ
          </p>
          <h1 className="text-xl font-bold text-stone-900 mt-0.5">
            {settings.ledgerName}
          </h1>
          {settings.organizationName && (
            <p className="text-xs text-stone-600">{settings.organizationName}</p>
          )}
        </div>
        <div className="text-xs text-stone-600 sm:text-right space-y-0.5">
          <div>
            ช่วงข้อมูล: <span className="font-semibold text-stone-900">{dateRangeLabel}</span>
          </div>
          <div>
            วันที่จัดทำรายงาน:{" "}
            <span className="font-semibold text-stone-900">
              {generatedDateLabel || "-"}
            </span>
          </div>
          <div>
            จำนวนรายการทั้งหมด:{" "}
            <span className="font-semibold text-stone-900">{sortedAsc.length} บิล</span>
          </div>
        </div>
      </div>

      {/* 4 Summary Boxes */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5 break-inside-avoid">
        <div className="border border-stone-300 rounded-lg p-3 bg-stone-50/70">
          <div className="text-[11px] text-stone-500 font-medium">งบตั้งต้น</div>
          <div className="text-base font-bold text-stone-900 tabular-nums mt-0.5">
            ฿{formatBaht(settings.startingBudget)}
          </div>
        </div>
        <div className="border border-emerald-300 rounded-lg p-3 bg-emerald-50/50">
          <div className="text-[11px] text-emerald-700 font-medium">รายรับเพิ่มเติม</div>
          <div className="text-base font-bold text-emerald-800 tabular-nums mt-0.5">
            +฿{formatBaht(totalIncome)}
          </div>
        </div>
        <div className="border border-rose-300 rounded-lg p-3 bg-rose-50/50">
          <div className="text-[11px] text-rose-700 font-medium">รายจ่ายรวม</div>
          <div className="text-base font-bold text-rose-800 tabular-nums mt-0.5">
            -฿{formatBaht(totalExpense)}
          </div>
        </div>
        <div className="border-2 border-stone-800 rounded-lg p-3 bg-amber-50/60">
          <div className="text-[11px] text-stone-700 font-semibold">ยอดคงเหลือสุทธิ</div>
          <div
            className={`text-base font-bold tabular-nums mt-0.5 ${
              netBalance < 0 ? "text-rose-700" : "text-stone-900"
            }`}
          >
            {netBalance < 0 ? "-" : ""}฿{formatBaht(Math.abs(netBalance))}
          </div>
        </div>
      </div>

      {/* Category & Reimbursement Summaries */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 break-inside-avoid">
        <div className="border border-stone-300 rounded-lg p-3.5">
          <h2 className="text-xs font-bold text-stone-800 border-b border-stone-200 pb-1.5 mb-2">
            สรุปรายจ่ายแยกตามหมวดหมู่
          </h2>
          {expenseCategories.length === 0 ? (
            <p className="text-xs text-stone-400">ไม่มีรายการรายจ่ายในช่วงนี้</p>
          ) : (
            <table className="w-full text-xs">
              <tbody>
                {expenseCategories.map(([cat, stat]) => (
                  <tr key={cat} className="border-b border-stone-100 last:border-0">
                    <td className="py-1 text-stone-700">
                      {cat} <span className="text-stone-400">({stat.count})</span>
                    </td>
                    <td className="py-1 text-right font-semibold tabular-nums text-stone-900">
                      ฿{formatBaht(stat.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border border-stone-300 rounded-lg p-3.5 space-y-3">
          <div>
            <h2 className="text-xs font-bold text-stone-800 border-b border-stone-200 pb-1.5 mb-2">
              สรุปรายรับแยกตามหมวดหมู่
            </h2>
            {incomeCategories.length === 0 ? (
              <p className="text-xs text-stone-400">ไม่มีรายการรายรับเพิ่มเติม</p>
            ) : (
              <table className="w-full text-xs">
                <tbody>
                  {incomeCategories.map(([cat, stat]) => (
                    <tr key={cat} className="border-b border-stone-100 last:border-0">
                      <td className="py-1 text-stone-700">
                        {cat} <span className="text-stone-400">({stat.count})</span>
                      </td>
                      <td className="py-1 text-right font-semibold tabular-nums text-emerald-700">
                        +฿{formatBaht(stat.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {pendingCount > 0 && (
            <div className="pt-2 border-t border-stone-200">
              <h2 className="text-xs font-bold text-amber-900 mb-1.5">
                ยอดสำรองจ่ายรอโอนคืน ({pendingCount} บิล · ฿{formatBaht(pendingTotal)})
              </h2>
              <table className="w-full text-xs">
                <tbody>
                  {pendingPersons.map(([person, stat]) => (
                    <tr key={person}>
                      <td className="py-0.5 text-stone-700">
                        {person} ({stat.count} บิล)
                      </td>
                      <td className="py-0.5 text-right font-semibold tabular-nums text-amber-800">
                        ฿{formatBaht(stat.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Itemized Ledger Table */}
      <div className="mb-8">
        <h2 className="text-xs font-bold text-stone-800 mb-2">
          รายละเอียดบิลและหลักฐานอ้างอิง
        </h2>
        {sortedAsc.length === 0 ? (
          <div className="border border-stone-300 rounded-lg p-6 text-center text-xs text-stone-500">
            ไม่มีรายการบัญชีในช่วงที่เลือก
          </div>
        ) : (
          <table className="w-full border-collapse border border-stone-300 text-[11.5px]">
            <thead>
              <tr className="bg-stone-100 text-stone-800">
                <th className="border border-stone-300 px-2 py-1.5 text-center w-9">
                  ที่
                </th>
                <th className="border border-stone-300 px-2 py-1.5 text-left w-24">
                  วันที่
                </th>
                <th className="border border-stone-300 px-2 py-1.5 text-left w-24">
                  เลขที่บิล
                </th>
                <th className="border border-stone-300 px-2 py-1.5 text-left">
                  รายการ / หมวดหมู่ / หมายเหตุ
                </th>
                <th className="border border-stone-300 px-2 py-1.5 text-left w-28">
                  ผู้เบิก / ช่องทาง
                </th>
                <th className="border border-stone-300 px-2 py-1.5 text-right w-24">
                  รายรับ (฿)
                </th>
                <th className="border border-stone-300 px-2 py-1.5 text-right w-24">
                  รายจ่าย (฿)
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedAsc.map((entry, idx) => (
                <tr key={entry.id} className="break-inside-avoid">
                  <td className="border border-stone-300 px-2 py-1.5 text-center tabular-nums text-stone-600">
                    {idx + 1}
                  </td>
                  <td className="border border-stone-300 px-2 py-1.5 tabular-nums text-stone-700 whitespace-nowrap">
                    {formatThaiDateLabel(entry.dateKey)}
                  </td>
                  <td className="border border-stone-300 px-2 py-1.5 text-stone-700 break-all">
                    {entry.receiptRef || "-"}
                  </td>
                  <td className="border border-stone-300 px-2 py-1.5">
                    <div className="font-semibold text-stone-900">{entry.title}</div>
                    <div className="text-[10.5px] text-stone-500">
                      หมวด: {entry.category}
                      {entry.formula ? ` · สูตร (${entry.formula})` : ""}
                      {entry.note ? ` · ${entry.note}` : ""}
                    </div>
                  </td>
                  <td className="border border-stone-300 px-2 py-1.5 text-stone-700">
                    <div>{entry.personName || "-"}</div>
                    <div className="text-[10.5px] text-stone-500">
                      {CHANNEL_LABELS[entry.channel]}
                      {entry.reimburseStatus === "pending" ? " · รอคืนเงิน" : ""}
                    </div>
                  </td>
                  <td className="border border-stone-300 px-2 py-1.5 text-right tabular-nums font-medium text-emerald-800">
                    {entry.type === "income" ? formatBaht(entry.amount) : "-"}
                  </td>
                  <td className="border border-stone-300 px-2 py-1.5 text-right tabular-nums font-medium text-rose-800">
                    {entry.type === "expense" ? formatBaht(entry.amount) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-stone-100 font-bold text-stone-900">
                <td
                  colSpan={5}
                  className="border border-stone-300 px-2 py-2 text-right"
                >
                  รวมทั้งสิ้น (งบตั้งต้น ฿{formatBaht(settings.startingBudget)} + รายรับ - รายจ่าย = คงเหลือ ฿{formatBaht(netBalance)})
                </td>
                <td className="border border-stone-300 px-2 py-2 text-right tabular-nums text-emerald-800">
                  {formatBaht(totalIncome)}
                </td>
                <td className="border border-stone-300 px-2 py-2 text-right tabular-nums text-rose-800">
                  {formatBaht(totalExpense)}
                </td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>

      {/* Signature Block */}
      <div className="grid grid-cols-2 gap-8 pt-6 mt-4 border-t border-stone-200 break-inside-avoid text-xs text-stone-700">
        <div className="text-center space-y-8">
          <p>ลงชื่อ ............................................................ ผู้จัดทำ / เหรัญญิก</p>
          <p>( ............................................................ )</p>
          <p>วันที่ .......... / .................... / ....................</p>
        </div>
        <div className="text-center space-y-8">
          <p>ลงชื่อ ............................................................ ผู้ตรวจสอบ / ประธานกิจกรรม</p>
          <p>( ............................................................ )</p>
          <p>วันที่ .......... / .................... / ....................</p>
        </div>
      </div>

      <div className="mt-6 text-[10px] text-stone-400 text-right">
        ออกรายงานจาก Treasurer Note
        {sortedAsc.length > 0
          ? ` (${formatThaiDateFull(sortedAsc[0].dateKey)}${
              sortedAsc.length > 1
                ? ` – ${formatThaiDateFull(
                    sortedAsc[sortedAsc.length - 1].dateKey
                  )}`
                : ""
            })`
          : generatedDateLabel
          ? ` (${generatedDateLabel})`
          : ""}
      </div>
    </div>
  );
}
