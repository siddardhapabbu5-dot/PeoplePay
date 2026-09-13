import ExcelJS from "exceljs";
import type { Response } from "express";

export async function streamWorkbook(
  res: Response,
  filename: string,
  sheets: { name: string; headers: string[]; rows: (string | number | Date | null)[][] }[],
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "PeoplePay";
  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name);
    ws.addRow(sheet.headers);
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
    sheet.rows.forEach((r) => ws.addRow(r));
    ws.columns.forEach((c) => {
      c.width = 18;
    });
  }
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
}
