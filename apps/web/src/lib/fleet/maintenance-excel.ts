import ExcelJS from "exceljs";
import {
  MAINTENANCE_CATEGORIES,
  MAINTENANCE_CATEGORY_LABELS,
  MAINTENANCE_IMPORT_HEADERS,
} from "@/lib/fleet/maintenance";

const HEADER_ROW = 1;
const DATA_START = 2;
const DATA_END = 501; // 500 data rows

export type MaintenanceExcelLists = {
  methodNames: string[];
  accountNames: string[];
  staffLabels: string[];
};

/** Build .xlsx template with dropdowns for category, payment method, account, paid_by. */
export async function buildMaintenanceExcelTemplate(lists: MaintenanceExcelLists): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Rental Pro Hub";
  const sheet = wb.addWorksheet("Maintenance", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  const headers = [...MAINTENANCE_IMPORT_HEADERS];
  sheet.addRow(headers);
  sheet.getRow(HEADER_ROW).font = { bold: true };
  headers.forEach((_, i) => {
    sheet.getColumn(i + 1).width = i === 2 ? 28 : 16;
  });

  // Example rows
  sheet.addRow([
    "2026-07-01",
    "service",
    "Annual service",
    245,
    "Kwik Fit",
    lists.staffLabels[0] ?? "",
    lists.methodNames.find((n) => n.toLowerCase() !== "cash") ?? lists.methodNames[0] ?? "Card",
    lists.accountNames[0] ?? "",
    "TXN-1001",
    45210,
    "",
    "",
    "",
    "",
    "",
    "2027-07-01",
    48000,
  ]);
  sheet.addRow([
    "18/06/2026",
    "mot",
    "MOT test",
    54.85,
    "Local garage",
    "",
    "Cash",
    "",
    "",
    44800,
    "18/06/2026",
    "",
    "",
    "",
    "",
    "",
    "",
  ]);
  sheet.addRow([
    "01/07/2026",
    "tax",
    "Vehicle tax",
    290,
    "DVLA",
    "",
    "Card",
    lists.accountNames[0] ?? "",
    "DVLA-REF-778",
    "",
    "",
    "",
    "2027-07-01",
    "",
    "",
    "",
    "",
  ]);
  sheet.addRow([
    "05/07/2026",
    "phv_taxi_licence",
    "PHV licence renewal",
    150,
    "Licensing authority",
    "",
    "Bank transfer",
    lists.accountNames[0] ?? "",
    "",
    "",
    "",
    "",
    "",
    "05/07/2026",
    "",
    "",
    "",
  ]);

  const listsSheet = wb.addWorksheet("_lists", { state: "hidden" });
  listsSheet.getCell("A1").value = "category";
  MAINTENANCE_CATEGORIES.forEach((c, i) => {
    listsSheet.getCell(i + 2, 1).value = c;
  });
  listsSheet.getCell("B1").value = "payment_method";
  lists.methodNames.forEach((n, i) => {
    listsSheet.getCell(i + 2, 2).value = n;
  });
  listsSheet.getCell("C1").value = "payment_account";
  lists.accountNames.forEach((n, i) => {
    listsSheet.getCell(i + 2, 3).value = n;
  });
  listsSheet.getCell("D1").value = "paid_by";
  lists.staffLabels.forEach((n, i) => {
    listsSheet.getCell(i + 2, 4).value = n;
  });

  const catEnd = Math.max(MAINTENANCE_CATEGORIES.length + 1, 2);
  const methodEnd = Math.max(lists.methodNames.length + 1, 2);
  const accountEnd = Math.max(lists.accountNames.length + 1, 2);
  const staffEnd = Math.max(lists.staffLabels.length + 1, 2);

  const colIndex = (name: (typeof MAINTENANCE_IMPORT_HEADERS)[number]) =>
    headers.indexOf(name) + 1;

  function addListValidation(col: number, formula: string) {
    for (let r = DATA_START; r <= DATA_END; r++) {
      sheet.getCell(r, col).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [formula],
        showErrorMessage: true,
        errorTitle: "Invalid value",
        error: "Please pick a value from the list.",
      };
    }
  }

  addListValidation(colIndex("category"), `'_lists'!$A$2:$A$${catEnd}`);
  addListValidation(colIndex("payment_method"), `'_lists'!$B$2:$B$${methodEnd}`);
  if (lists.accountNames.length) {
    addListValidation(colIndex("payment_account"), `'_lists'!$C$2:$C$${accountEnd}`);
  }
  if (lists.staffLabels.length) {
    addListValidation(colIndex("paid_by"), `'_lists'!$D$2:$D$${staffEnd}`);
  }

  // Note row
  const note = sheet.addRow([]);
  note.getCell(1).value =
    "Notes: Dates as YYYY-MM-DD or DD/MM/YYYY. category values: " +
    MAINTENANCE_CATEGORIES.map((c) => `${c} (${MAINTENANCE_CATEGORY_LABELS[c]})`).join(", ") +
    ". Cash: leave payment_account blank. MOT: set mot_date (defaults to occurred_on) → expiry = start + 1 year unless mot_expiry is set. Tax: set tax_expiry (required). PHV/Taxi: set phv_start_date (defaults to occurred_on) → expiry = start + 1 year unless phv_licence_expiry is set. Optional service_due_at / next_service_mileage update the vehicle.";

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function parseMaintenanceExcel(
  data: ArrayBuffer | Buffer,
): Promise<{ headers: string[]; rows: string[][] }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as ExcelJS.Buffer);
  const sheet =
    wb.getWorksheet("Maintenance") ??
    wb.worksheets.find((s) => s.name !== "_lists") ??
    wb.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };

  const matrix: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    // ExcelJS rows are 1-based; collect up to header count + a few
    const maxCol = Math.max(row.cellCount, MAINTENANCE_IMPORT_HEADERS.length);
    for (let c = 1; c <= maxCol; c++) {
      const cell = row.getCell(c);
      let v: unknown = cell.value;
      if (v && typeof v === "object" && "text" in (v as object)) v = (v as { text: string }).text;
      if (v && typeof v === "object" && "result" in (v as object)) v = (v as { result: unknown }).result;
      if (v instanceof Date) {
        const y = v.getUTCFullYear();
        const m = String(v.getUTCMonth() + 1).padStart(2, "0");
        const d = String(v.getUTCDate()).padStart(2, "0");
        values.push(`${y}-${m}-${d}`);
      } else if (v == null) {
        values.push("");
      } else {
        values.push(String(v).trim());
      }
    }
    // Skip note rows that don't look like data
    if (values[0]?.startsWith("Notes:")) return;
    matrix.push(values);
  });

  if (!matrix.length) return { headers: [], rows: [] };
  const headers = matrix[0]!.map((h) => h.trim().toLowerCase());
  const body = matrix.slice(1).filter((r) => r.some((c) => c.trim() !== ""));
  return { headers, rows: body };
}
