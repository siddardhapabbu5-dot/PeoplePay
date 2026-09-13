import PDFDocument from "pdfkit";
import type { Response } from "express";
import { amountInWords, money } from "./money.js";

type PayslipData = {
  companyName: string;
  companyAddress?: string | null;
  employeeName: string;
  employeeCode: string;
  department?: string | null;
  designation?: string | null;
  pan?: string | null;
  bankAccount?: string | null;
  period: string;
  earnings: { name: string; amount: number }[];
  deductions: { name: string; amount: number }[];
  gross: number;
  totalDeductions: number;
  net: number;
};

export function streamPayslipPdf(res: Response, data: PayslipData, filename: string) {
  const doc = new PDFDocument({ size: "A4", margin: 48 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  doc.pipe(res);

  doc.fillColor("#1e3a8a").fontSize(20).text("PeoplePay", { align: "left" });
  doc.fillColor("#111827").fontSize(14).text(data.companyName);
  if (data.companyAddress) doc.fontSize(9).fillColor("#6b7280").text(data.companyAddress);
  doc.moveDown(0.4);
  doc.fillColor("#1e3a8a").fontSize(16).text("Payslip", { align: "center" });
  doc.moveDown(0.2);
  doc.fillColor("#4b5563").fontSize(10).text(data.period, { align: "center" });
  doc.moveDown();

  const left = 48;
  doc.fillColor("#111827").fontSize(10);
  doc.text(`Employee: ${data.employeeName}`, left, doc.y);
  doc.text(`Employee ID: ${data.employeeCode}`);
  doc.text(`Department: ${data.department ?? "-"}`);
  doc.text(`Designation: ${data.designation ?? "-"}`);
  doc.text(`PAN: ${data.pan ?? "-"}`);
  doc.text(`Bank A/C: ${data.bankAccount ?? "-"}`);
  doc.moveDown();

  const startY = doc.y;
  doc.fillColor("#1e3a8a").fontSize(11).text("Earnings", left, startY);
  doc.text("Deductions", 320, startY);
  doc.fillColor("#111827").fontSize(10);
  let y = startY + 18;
  const rows = Math.max(data.earnings.length, data.deductions.length);
  for (let i = 0; i < rows; i++) {
    const e = data.earnings[i];
    const d = data.deductions[i];
    if (e) doc.text(`${e.name}`, left, y).text(money(e.amount), 200, y, { width: 80, align: "right" });
    if (d) doc.text(`${d.name}`, 320, y).text(money(d.amount), 460, y, { width: 80, align: "right" });
    y += 16;
  }
  y += 8;
  doc.moveTo(left, y).lineTo(547, y).strokeColor("#e5e7eb").stroke();
  y += 10;
  doc.fontSize(11).fillColor("#111827");
  doc.text("Gross Earnings", left, y).text(money(data.gross), 200, y, { width: 80, align: "right" });
  doc.text("Total Deductions", 320, y).text(money(data.totalDeductions), 460, y, { width: 80, align: "right" });
  y += 22;
  doc.fontSize(13).fillColor("#1e3a8a").text("Net Pay", left, y).text(`₹ ${money(data.net)}`, 400, y, { width: 140, align: "right" });
  y += 24;
  doc.fontSize(9).fillColor("#374151").text(`Net Pay in words: ${amountInWords(data.net)}`, left, y, { width: 500 });
  y += 36;
  doc.fontSize(8).fillColor("#9ca3af").text("This is a system-generated payslip from PeoplePay and does not require a signature.", left, y);

  doc.end();
}

export function streamTablePdf(
  res: Response,
  title: string,
  headers: string[],
  rows: (string | number)[][],
  filename: string,
) {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  doc.pipe(res);
  doc.fillColor("#1e3a8a").fontSize(16).text(title);
  doc.moveDown();
  const colW = (doc.page.width - 72) / headers.length;
  let x = 36;
  let y = doc.y;
  doc.fontSize(8).fillColor("#111827");
  headers.forEach((h, i) => doc.text(h, x + i * colW, y, { width: colW - 4 }));
  y += 16;
  rows.forEach((row) => {
    if (y > doc.page.height - 40) {
      doc.addPage();
      y = 36;
    }
    row.forEach((cell, i) => doc.text(String(cell ?? ""), x + i * colW, y, { width: colW - 4 }));
    y += 14;
  });
  doc.end();
}
