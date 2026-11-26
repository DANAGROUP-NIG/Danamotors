import {
  affectedVinFileName,
  buildCsv,
  MAX_CAMPAIGN_DOCUMENT_BYTES,
  contentDisposition,
  inspectCampaignDocument,
  safeFileName,
} from "./campaign-download.logic";

const pdf = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(32, 0x20)]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);

describe("inspectCampaignDocument", () => {
  it("accepts PDF, PNG and JPEG by content and fixes the extension", () => {
    expect(inspectCampaignDocument("KIA SC-215 manual.pdf", pdf.toString("base64"))).toMatchObject({
      contentType: "application/pdf",
      fileName: "KIA SC-215 manual.pdf",
      sizeBytes: pdf.length,
    });
    expect(inspectCampaignDocument("diagram.pdf", png.toString("base64")).fileName).toBe("diagram.png");
    expect(inspectCampaignDocument("photo", jpeg.toString("base64")).contentType).toBe("image/jpeg");
  });

  it("hashes the content so a repeated upload can be detected", () => {
    const a = inspectCampaignDocument("a.pdf", pdf.toString("base64"));
    const b = inspectCampaignDocument("b.pdf", pdf.toString("base64"));
    expect(a.sha256).toHaveLength(64);
    expect(a.sha256).toBe(b.sha256);
  });

  it("rejects other formats, empty, malformed and oversized files", () => {
    expect(() => inspectCampaignDocument("notes.pdf", Buffer.from("plain text").toString("base64"))).toThrow(/PDF, PNG or JPEG/);
    expect(() => inspectCampaignDocument("x.pdf", "")).toThrow(/could not be read/);
    expect(() => inspectCampaignDocument("x.pdf", "not base64!")).toThrow(/could not be read/);
    const big = Buffer.concat([pdf, Buffer.alloc(MAX_CAMPAIGN_DOCUMENT_BYTES)]);
    expect(() => inspectCampaignDocument("big.pdf", big.toString("base64"))).toThrow(/larger than 10 MB/);
  });
});

describe("safeFileName", () => {
  it("strips unsafe characters and keeps a readable name", () => {
    expect(safeFileName("../../etc/passwd", "pdf")).toBe("etcpasswd.pdf");
    expect(safeFileName("Rappel  campagne é.PDF", "pdf")).toBe("Rappel campagne e.pdf");
    expect(safeFileName("<>:|", "png")).toBe("campaign-manual.png");
  });
});

describe("contentDisposition", () => {
  it("sends an ASCII name and a UTF-8 copy", () => {
    expect(contentDisposition('Manual "v2".pdf', false)).toBe(`attachment; filename="Manual v2.pdf"; filename*=UTF-8''Manual%20%22v2%22.pdf`);
    expect(contentDisposition("a.pdf", true)).toMatch(/^inline;/);
  });
});

describe("buildCsv", () => {
  it("writes a BOM, escapes quotes and commas, and neutralises formulas", () => {
    const csv = buildCsv(["VIN", "Customer"], [["KNAB2512AET123456", 'Okafor, "Chidi"'], ["=HYPERLINK(1)", null]]);
    expect(csv.startsWith("﻿VIN,Customer\r\n")).toBe(true);
    expect(csv).toContain('KNAB2512AET123456,"Okafor, ""Chidi"""\r\n');
    expect(csv).toContain("'=HYPERLINK(1),\r\n");
  });

  it("keeps the naira sign and accented names intact", () => {
    expect(buildCsv(["Amount"], [["₦186,800.00"]])).toContain('"₦186,800.00"');
  });
});

describe("affectedVinFileName", () => {
  it("uses the campaign code and date", () => {
    expect(affectedVinFileName("SC-215/A", "2026-11-26")).toBe("SC-215A-affected-vins-2026-11-26.csv");
    expect(affectedVinFileName("///", "2026-11-26")).toBe("campaign-affected-vins-2026-11-26.csv");
  });
});
