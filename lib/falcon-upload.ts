import { APP_NAME } from "@/lib/branding";
import { resolveFalconExportGroupKey } from "@/lib/falcon-waybill-brand";

type CsvRow = Record<string, string>;

export type FalconFilterColumn =
  | "REFERENCE"
  | "SHOPDROP REF"
  | "WAYBILL NO"
  | "Location Name";

export type FalconUploadOptions = {
  locationPrefix: string;
  filterColumn: FalconFilterColumn;
};

export type FalconUploadResult = {
  buffer: Buffer;
  totalRows: number;
  matchedRows: number;
};

export type FalconGroupedUploadResult = {
  buffer: Buffer;
  totalRows: number;
  groups: Array<{
    prefix: string;
    rowCount: number;
    fileName: string;
  }>;
};

export type FalconWaybillRow = {
  orderId?: string;
  /** Zip export bucket — order-series prefix (Cosmo 100–900; Vault 100/200/300). */
  exportGroupKey?: string;
  locationReference?: string;
  manualInvoicePrefix?: string | null;
  locationName: string;
  receiverName: string;
  receiverAddress1: string;
  receiverAddress2: string;
  receiverCity: string;
  receiverContact: string;
  pieces: string;
  weightKg: string;
  weightG: string;
  reference: string;
  amount: string;
  itemName: string;
  shortName: string;
  shopdropRef: string;
  waybillNo: string;
  barcode: string;
  customerNote: string;
};

const FALCON_COLUMNS = 25;

const SENDER = {
  name: "SupplementVault.lk",
  address1: "No 71A, 1st Lane, Pepiliyana Mw, Nugegoda.",
  city: "Nugegoda",
  contact1: "715930200",
  contact2: "703050482",
  billingType: "SENDER ACCOUNT",
  itemType: "PARCEL",
  description: "Supplements & Vitamins",
};

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseCsv(text: string) {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return headers.reduce<CsvRow>((row, header, index) => {
      row[header] = values[index] ?? "";
      return row;
    }, {});
  });
}

function clean(value: string | undefined) {
  return (value ?? "").trim();
}

function formatCod(amount: string) {
  const normalized = clean(amount).replace(/,/g, "");
  const numeric = Number(normalized);
  if (!Number.isFinite(numeric)) return normalized;
  return String(numeric);
}

function isCod(amount: string) {
  const numeric = Number(clean(amount).replace(/,/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? "YES" : "NO";
}

function getWeightGrams(row: CsvRow) {
  const grams = Number(clean(row["WEIGHT(G)"]).replace(/,/g, ""));
  if (Number.isFinite(grams) && grams > 0) return String(grams);

  const kilograms = Number(clean(row["WEIGHT(K)"]).replace(/,/g, ""));
  if (Number.isFinite(kilograms) && kilograms > 0) {
    return String(Math.round(kilograms * 1000));
  }

  return "500";
}

function getPieces(row: CsvRow) {
  const pieces = Number.parseInt(clean(row["PC's"]), 10);
  return Number.isFinite(pieces) && pieces > 0 ? String(pieces) : "1";
}

function toFalconRow(row: CsvRow) {
  return toFalconRowFromWaybill({
    locationName: clean(row["Location Name"]),
    receiverName: clean(row["Receiver Name"]),
    receiverAddress1: clean(row["RECEIVER ADDRESS 1"]),
    receiverAddress2: clean(row["RECEIVER ADDRESS 2"]),
    receiverCity: clean(row["RECEIVER CITY"]),
    receiverContact: clean(row["RECEIVER CONTACT"]),
    pieces: clean(row["PC's"]),
    weightKg: clean(row["WEIGHT(K)"]),
    weightG: clean(row["WEIGHT(G)"]),
    reference: clean(row.REFERENCE),
    amount: clean(row.AMOUNT),
    itemName: clean(row["ITEM NAME"]),
    shortName: clean(row["SHORT NAME"]),
    shopdropRef: clean(row["SHOPDROP REF"]),
    waybillNo: clean(row["WAYBILL NO"]),
    barcode: clean(row.BARCODE),
    customerNote: clean(row["CUSTOMER NOTE"]),
  });
}

function getWaybillWeightGrams(row: FalconWaybillRow) {
  return getWeightGrams({
    "WEIGHT(G)": row.weightG,
    "WEIGHT(K)": row.weightKg,
  });
}

function getWaybillPieces(row: FalconWaybillRow) {
  return getPieces({ "PC's": row.pieces });
}

function toFalconRowFromWaybill(row: FalconWaybillRow) {
  const reference = clean(row.reference) || clean(row.shopdropRef);
  const amount = formatCod(row.amount);
  const receiverName = clean(row.receiverName);

  return [
    "",
    reference,
    SENDER.name,
    SENDER.address1,
    "",
    "",
    SENDER.city,
    "",
    SENDER.contact1,
    SENDER.contact2,
    receiverName,
    clean(row.receiverAddress1),
    clean(row.receiverAddress2),
    "",
    clean(row.receiverCity),
    clean(row.receiverContact),
    "",
    "",
    getWaybillWeightGrams(row),
    SENDER.billingType,
    SENDER.itemType,
    getWaybillPieces(row),
    clean(row.itemName) || SENDER.description,
    isCod(row.amount),
    amount,
  ];
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function columnName(index: number) {
  let name = "";
  let next = index;
  while (next > 0) {
    const remainder = (next - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    next = Math.floor((next - 1) / 26);
  }
  return name;
}

function cellXml(value: string, row: number, column: number) {
  if (!value) return "";
  const ref = `${columnName(column)}${row}`;
  return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function rowXml(values: string[], rowIndex: number) {
  const cells = values
    .slice(0, FALCON_COLUMNS)
    .map((value, index) => cellXml(value, rowIndex, index + 1))
    .join("");

  return `<row r="${rowIndex}" spans="1:${FALCON_COLUMNS}">${cells}</row>`;
}

function buildSheetXml(rows: string[][]) {
  const lastRow = Math.max(3, rows.length + 2);
  const sheetRows = rows.map((row, index) => rowXml(row, index + 3)).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:Y${lastRow}"/>
  <sheetViews><sheetView workbookViewId="0"><selection activeCell="A3" sqref="A3:Y${lastRow}"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="14.4"/>
  <cols>
    <col min="3" max="3" width="18" customWidth="1"/>
    <col min="4" max="4" width="36" customWidth="1"/>
    <col min="11" max="11" width="24" customWidth="1"/>
    <col min="12" max="12" width="54" customWidth="1"/>
    <col min="15" max="15" width="18" customWidth="1"/>
  </cols>
  <sheetData>${sheetRows}</sheetData>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;
}

function emptySheetXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="14.4"/>
  <sheetData/>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;
}

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date: Date) {
  const time =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const dosDate =
    ((date.getFullYear() - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  return { time, date: dosDate };
}

function u16(value: number) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

export function createZip(files: Array<{ name: string; content: string | Buffer }>) {
  const now = dosDateTime(new Date());
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const content = Buffer.isBuffer(file.content)
      ? file.content
      : Buffer.from(file.content, "utf8");
    const crc = crc32(content);

    const localHeader = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(now.time),
      u16(now.date),
      u32(crc),
      u32(content.length),
      u32(content.length),
      u16(name.length),
      u16(0),
      name,
    ]);

    localParts.push(localHeader, content);

    centralParts.push(
      Buffer.concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0x0800),
        u16(0),
        u16(now.time),
        u16(now.date),
        u32(crc),
        u32(content.length),
        u32(content.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ])
    );

    offset += localHeader.length + content.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDirectory.length),
    u32(offset),
    u16(0),
  ]);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function createWorkbook(rows: string[][]) {
  const created = new Date().toISOString();
  return createZip([
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <bookViews><workbookView activeTab="0"/></bookViews>
  <sheets>
    <sheet name="Sheet1" sheetId="1" r:id="rId1"/>
    <sheet name="Sheet2" sheetId="2" r:id="rId2"/>
  </sheets>
  <calcPr calcId="191029"/>
</workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    { name: "xl/worksheets/sheet1.xml", content: buildSheetXml(rows) },
    { name: "xl/worksheets/sheet2.xml", content: emptySheetXml() },
    {
      name: "xl/styles.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`,
    },
    {
      name: "docProps/core.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>${escapeXml(APP_NAME)}</dc:creator>
  <cp:lastModifiedBy>${escapeXml(APP_NAME)}</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified>
</cp:coreProperties>`,
    },
    {
      name: "docProps/app.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Microsoft Excel</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>2</vt:i4></vt:variant></vt:vector></HeadingPairs>
  <TitlesOfParts><vt:vector size="2" baseType="lpstr"><vt:lpstr>Sheet1</vt:lpstr><vt:lpstr>Sheet2</vt:lpstr></vt:vector></TitlesOfParts>
</Properties>`,
    },
  ]);
}

export function buildFalconUploadWorkbook(
  csvText: string,
  options: FalconUploadOptions
): FalconUploadResult {
  const rows = parseCsv(csvText);
  const prefix = options.locationPrefix.trim();
  const matched = prefix
    ? rows.filter((row) => clean(row[options.filterColumn]).startsWith(prefix))
    : rows;

  return {
    buffer: createWorkbook(matched.map(toFalconRow)),
    totalRows: rows.length,
    matchedRows: matched.length,
  };
}

export function buildFalconUploadWorkbookFromWaybillRows(
  rows: FalconWaybillRow[],
  options: FalconUploadOptions
): FalconUploadResult {
  const matched = filterFalconWaybillRows(rows, options);

  return {
    buffer: createWorkbook(matched.map(toFalconRowFromWaybill)),
    totalRows: rows.length,
    matchedRows: matched.length,
  };
}

function getExportGroupKey(row: FalconWaybillRow) {
  return resolveFalconExportGroupKey(row);
}

export function buildGroupedFalconUploadZip(
  rows: FalconWaybillRow[],
  dispatchDate: string
): FalconGroupedUploadResult {
  const grouped = new Map<string, FalconWaybillRow[]>();
  for (const row of rows) {
    const groupKey = getExportGroupKey(row);
    const group = grouped.get(groupKey) ?? [];
    group.push(row);
    grouped.set(groupKey, group);
  }

  const groups = Array.from(grouped.entries()).sort(([a], [b]) =>
    a.localeCompare(b, undefined, { numeric: true })
  );

  const files = groups.map(([groupKey, groupRows]) => {
    const fileName = `falcon-upload-${dispatchDate}-${groupKey}.xlsx`;
    return {
      name: fileName,
      content: createWorkbook(groupRows.map(toFalconRowFromWaybill)),
      rowCount: groupRows.length,
      prefix: groupKey,
      fileName,
    };
  });

  return {
    buffer: createZip(files.map(({ name, content }) => ({ name, content }))),
    totalRows: rows.length,
    groups: files.map(({ prefix, rowCount, fileName }) => ({
      prefix,
      rowCount,
      fileName,
    })),
  };
}

export function filterFalconWaybillRows(
  rows: FalconWaybillRow[],
  options: FalconUploadOptions
) {
  const prefix = options.locationPrefix.trim();
  const valueForFilter = (row: FalconWaybillRow) => {
    if (options.filterColumn === "REFERENCE") return row.reference;
    if (options.filterColumn === "SHOPDROP REF") return row.shopdropRef;
    if (options.filterColumn === "WAYBILL NO") return row.waybillNo;
    return row.locationName;
  };

  return prefix
    ? rows.filter((row) => clean(valueForFilter(row)).startsWith(prefix))
    : rows;
}
