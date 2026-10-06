import {
  csvRecords,
  missingColumns,
  modelKey,
  parseCsv,
  parseLegacyDate,
  parseLegacyFlag,
  parseMoney,
  parsePositiveInt,
  partKey,
  pick,
} from "./legacyImport.logic";

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, embedded commas and newlines, CRLF and a BOM", () => {
    const rows = parseCsv('﻿a,b,c\r\n1,"two, 2","say ""hi"""\r\n"multi\nline",,x\n');
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "two, 2", 'say "hi"'],
      ["multi\nline", "", "x"],
    ]);
  });

  it("skips blank lines", () => {
    expect(parseCsv("a\n\n\nb\n")).toEqual([["a"], ["b"]]);
  });
});

describe("csvRecords and pick", () => {
  it("keys records by lower-case header and picks by alias", () => {
    const { headers, records } = csvRecords("ChassisNO,SaleDate\nKNAPU81BDP7123456,12/03/2023\n");
    expect(headers).toEqual(["chassisno", "saledate"]);
    expect(pick(records[0], "VIN", "ChassisNO")).toBe("KNAPU81BDP7123456");
    expect(pick(records[0], "Missing")).toBeNull();
  });

  it("reports missing column groups", () => {
    expect(missingColumns(["code", "warrdays"], { code: ["code"], km: ["warrMileage", "warrkm"] })).toEqual(["km"]);
  });
});

describe("parseLegacyDate", () => {
  it("parses the legacy formats as calendar dates", () => {
    expect(parseLegacyDate("12/03/2023")?.toISOString()).toBe("2023-03-12T00:00:00.000Z");
    expect(parseLegacyDate("2023-03-12 00:00:00.000")?.toISOString()).toBe("2023-03-12T00:00:00.000Z");
    expect(parseLegacyDate("12-Mar-23")?.toISOString()).toBe("2023-03-12T00:00:00.000Z");
    expect(parseLegacyDate("5.1.2021 10:30")?.toISOString()).toBe("2021-01-05T00:00:00.000Z");
  });

  it("rejects blanks, placeholders and impossible dates", () => {
    expect(parseLegacyDate("")).toBeNull();
    expect(parseLegacyDate(null)).toBeNull();
    expect(parseLegacyDate("01/01/1900")).toBeNull();
    expect(parseLegacyDate("00/00/0000")).toBeNull();
    expect(parseLegacyDate("31/02/2023")).toBeNull();
    expect(parseLegacyDate("not a date")).toBeNull();
  });
});

describe("value parsers", () => {
  it("parses flags", () => {
    expect(parseLegacyFlag("Y")).toBe(true);
    expect(parseLegacyFlag("n")).toBe(false);
    expect(parseLegacyFlag("1")).toBe(true);
    expect(parseLegacyFlag("")).toBe(false);
    expect(parseLegacyFlag("maybe")).toBeNull();
  });

  it("parses numbers", () => {
    expect(parsePositiveInt("1825")).toBe(1825);
    expect(parsePositiveInt("100,000")).toBe(100000);
    expect(parsePositiveInt("0")).toBeNull();
    expect(parsePositiveInt("abc")).toBeNull();
    expect(parseMoney("₦48,500.50")).toBe(48500.5);
    expect(parseMoney("-1")).toBeNull();
  });

  it("normalises keys", () => {
    expect(partKey("27301-2B010")).toBe("273012B010");
    expect(modelKey("Kia Sportage")).toBe("SPORTAGE");
    expect(modelKey("K5")).toBe("K5");
  });
});
