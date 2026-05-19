const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const CRC_TABLE = makeCrcTable();

function makeCrcTable() {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let crc = index;

    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }

    table[index] = crc >>> 0;
  }

  return table;
}

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function dosTimestamp(date = new Date()) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

  return { dosDate, dosTime };
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  const { dosDate, dosTime } = dosTimestamp();
  let offset = 0;

  entries.forEach(entry => {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, "utf8");
    const checksum = crc32(data);
    const localHeader = Buffer.alloc(30 + name.length);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localHeader.writeUInt16LE(0, 28);
    name.copy(localHeader, 30);

    const centralHeader = Buffer.alloc(46 + name.length);

    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    name.copy(centralHeader, 46);

    localParts.push(localHeader, data);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  });

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);

  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

function escapeXml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&apos;"
  }[character]));
}

function columnName(index) {
  let value = index + 1;
  let name = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - remainder) / 26);
  }

  return name;
}

function cellReference(columnIndex, rowIndex) {
  return `${columnName(columnIndex)}${rowIndex + 1}`;
}

function cellXml(cell, columnIndex, rowIndex) {
  const value = cell && typeof cell === "object" && "value" in cell ? cell.value : cell;
  const style = cell && typeof cell === "object" && cell.style ? ` s="${cell.style}"` : "";
  const reference = cellReference(columnIndex, rowIndex);

  if (value === null || value === undefined || value === "") {
    return `<c r="${reference}"${style}/>`;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${reference}"${style}><v>${value}</v></c>`;
  }

  return `<c r="${reference}"${style} t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function sheetXml(rows, dataStartRow) {
  const rowXml = rows
    .map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((cell, columnIndex) => cellXml(cell, columnIndex, rowIndex)).join("")}</row>`)
    .join("");
  const dataBarRange = dataStartRow ? `B${dataStartRow}:B${rows.length}` : "";
  const conditionalFormatting = dataBarRange
    ? `<conditionalFormatting sqref="${dataBarRange}"><cfRule type="dataBar" priority="1"><dataBar><cfvo type="min"/><cfvo type="max"/><color rgb="FF111111"/></dataBar></cfRule></conditionalFormatting>`
    : "";

  return `${XML_DECLARATION}
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:D${rows.length}"/>
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <cols>
    <col min="1" max="1" width="28" customWidth="1"/>
    <col min="2" max="2" width="14" customWidth="1"/>
    <col min="3" max="3" width="12" customWidth="1"/>
    <col min="4" max="4" width="60" customWidth="1"/>
  </cols>
  <sheetData>${rowXml}</sheetData>
  ${conditionalFormatting}
</worksheet>`;
}

function contentTypesXml() {
  return `${XML_DECLARATION}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function rootRelationshipsXml() {
  return `${XML_DECLARATION}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function workbookXml() {
  return `${XML_DECLARATION}
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Impact Metrics" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;
}

function workbookRelationshipsXml() {
  return `${XML_DECLARATION}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function stylesXml() {
  return `${XML_DECLARATION}
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function corePropertiesXml(project) {
  const createdAt = new Date().toISOString();

  return `${XML_DECLARATION}
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(project.title || "Impact metrics")}</dc:title>
  <dc:creator>Case-study builder</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${createdAt}</dcterms:modified>
</cp:coreProperties>`;
}

function appPropertiesXml() {
  return `${XML_DECLARATION}
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Case-study builder</Application>
</Properties>`;
}

function row(values) {
  return values.map(value => typeof value === "object" && value && "value" in value ? value : { value });
}

function numericValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function impactWorkbookRows(project) {
  const impact = Array.isArray(project.impact) ? project.impact : [];
  const metadataRows = [
    row([{ value: "Impact Metrics", style: 1 }]),
    row([]),
    row([{ value: "Field", style: 1 }, { value: "Value", style: 1 }]),
    row(["Project", project.title]),
    row(["Year", project.year]),
    row(["Sector", project.sector]),
    row(["Role", project.role]),
    row([]),
    row([{ value: "Metric", style: 1 }, { value: "Value", style: 1 }, { value: "Unit", style: 1 }, { value: "Description", style: 1 }])
  ];

  const impactRows = impact.map((item, index) => row([
    item.metric || `Metric ${index + 1}`,
    numericValue(item.value),
    item.unit || "",
    item.description || ""
  ]));

  return {
    rows: [...metadataRows, ...impactRows],
    dataStartRow: impactRows.length ? metadataRows.length + 1 : null
  };
}

export function createImpactWorkbook(project) {
  const { rows, dataStartRow } = impactWorkbookRows(project);

  return createZip([
    { name: "[Content_Types].xml", data: contentTypesXml() },
    { name: "_rels/.rels", data: rootRelationshipsXml() },
    { name: "xl/workbook.xml", data: workbookXml() },
    { name: "xl/_rels/workbook.xml.rels", data: workbookRelationshipsXml() },
    { name: "xl/worksheets/sheet1.xml", data: sheetXml(rows, dataStartRow) },
    { name: "xl/styles.xml", data: stylesXml() },
    { name: "docProps/core.xml", data: corePropertiesXml(project) },
    { name: "docProps/app.xml", data: appPropertiesXml() }
  ]);
}
