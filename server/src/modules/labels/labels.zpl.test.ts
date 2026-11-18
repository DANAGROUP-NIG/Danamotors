import { barModule, code128Modules, jobZpl, labelDate, partLabelZpl, partNumberHeight, unprintable } from "./labels.zpl";

const header = { dealer: "DANA MOTORS", store: "CPD", date: "28-10-2026" };

describe("part label ZPL", () => {
  it("prints the 2x2 label the store approved (Kia horn, 2026-10-28)", () => {
    const zpl = partLabelZpl({ partNumber: "96610H9100", description: "Horn assy-high pitch", bin: "A-12-03", copies: 2 }, header);
    expect(zpl.startsWith("^XA\n^CI28^PW406^LL402")).toBe(true);
    expect(zpl).toContain("^FDHORN ASSY-HIGH PITCH^FS");
    expect(zpl).toContain("^A0N,56,48^FB378,1,0,C^FH_^FD96610H9100^FS");
    // 10 characters: 145 modules at 2 dots = 290, centred on 406.
    expect(zpl).toContain("^BY2,3,100^FO58,182^BCN,100,N,N,N^FH_^FD>:96610H9100^FS");
    expect(zpl).toContain("^FDBIN A-12-03^FS");
    expect(zpl).toContain("^PQ2\n^XZ");
    // Never forces thermal transfer (the printer has no ribbon).
    expect(zpl).not.toContain("^MT");
  });

  it("narrows the bars and the number for long part numbers", () => {
    expect(barModule("96610H9100")).toBe(2);
    expect(barModule("888301G000XI")).toBe(2);
    expect(barModule("888301G000XIA")).toBe(2);
    // 14 characters at 2 dots would fill the label with no quiet zone left.
    expect(barModule("TRN-CLUTCH-KIT")).toBe(1);
    expect(barModule("SUZ-Brake Bulb 2 Fil")).toBe(1);
    expect(code128Modules("SUZ-Brake Bulb 2 Fil") * barModule("SUZ-Brake Bulb 2 Fil")).toBeLessThanOrEqual(378);
    expect(barModule("A1")).toBe(3);
    expect(partNumberHeight(10)).toBeGreaterThan(partNumberHeight(20));
  });

  it("leaves out the bin when the part has none, and escapes ZPL characters", () => {
    const zpl = partLabelZpl({ partNumber: "AB^C>1_", description: "odd ~ part", bin: null, copies: 1 }, header);
    expect(zpl).not.toContain("BIN");
    expect(zpl).toContain("^FDODD _7e PART^FS");
    expect(zpl).toContain("^FD>:AB_5eC><1_5f^FS");
  });

  it("joins labels into one job and spots characters a barcode cannot carry", () => {
    const zpl = jobZpl(
      [
        { partNumber: "A", description: "a", copies: 1 },
        { partNumber: "B", description: "b", copies: 3 },
      ],
      header,
    );
    expect(zpl.match(/\^XA/g)).toHaveLength(2);
    expect(unprintable("96610H9100")).toBe(false);
    expect(unprintable("PART–1")).toBe(true);
  });

  it("dates the label in Lagos time", () => {
    expect(labelDate(new Date("2026-10-28T23:30:00Z"))).toBe("29-10-2026");
  });
});
