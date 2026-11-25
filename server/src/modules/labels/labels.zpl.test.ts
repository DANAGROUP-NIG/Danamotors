import { KIA_BADGE, KIA_LOGO } from "./labels.logo";
import {
  barModule,
  code128Modules,
  displayPartNumber,
  jobZpl,
  labelDate,
  partLabelZpl,
  partNumberHeight,
  unprintable,
} from "./labels.zpl";

const header = { dealer: "DANA MOTORS", store: "CPD", date: "28-10-2026" };

describe("part label ZPL", () => {
  it("prints the Kia Genuine Parts layout (Kia horn box label, 2026-11-23)", () => {
    const zpl = partLabelZpl({ partNumber: "96610H9100", description: "Horn assy-high pitch", bin: "A-12-03", copies: 2 }, header);
    expect(zpl.startsWith("^XA\n^CI28^PW406^LL402")).toBe(true);
    expect(zpl).toContain("^FDHORN ASSY-HIGH PITCH^FS");
    // The Kia logo and "Genuine Parts" top right, the black badge at the bottom.
    expect(zpl).toContain(`^FO280,12${KIA_LOGO.zpl}^FS`);
    expect(zpl).toContain("^FDGenuine Parts^FS");
    expect(zpl).toContain(`${KIA_BADGE.zpl}^FS`);
    // Shown split as Kia prints it; the barcode and the QR code carry the number as stored.
    expect(zpl).toContain("^FD96610 H9100^FS");
    // 10 characters: 145 modules at 2 dots = 290, centred on 406.
    expect(zpl).toContain("^BY2,3,80^FO58,142^BCN,80,N,N,N^FH_^FD>:96610H9100^FS");
    expect(zpl).toContain("^BQN,2,3^FH_^FDMA,96610H9100^FS");
    expect(zpl).toContain("^FDBIN A-12-03^FS");
    expect(zpl).toContain("^FD28-10-2026^FS");
    expect(zpl).toContain("^FDDANA MOTORS^FS");
    expect(zpl).toContain("^FDCPD^FS");
    expect(zpl).toContain("^PQ2\n^XZ");
    // No QTY (user decision 2026-10-28) and no "Made in": we hold no origin data.
    expect(zpl).not.toMatch(/QTY|MADE IN/);
    // Never forces thermal transfer (the printer has no ribbon).
    expect(zpl).not.toContain("^MT");
  });

  it("splits Kia part numbers after the fifth character and leaves others as stored", () => {
    expect(displayPartNumber("96610H9100")).toBe("96610 H9100");
    expect(displayPartNumber("1864761566")).toBe("18647 61566");
    expect(displayPartNumber("888301G000XI")).toBe("88830 1G000XI");
    expect(displayPartNumber("39175-2A086")).toBe("39175-2A086");
    expect(displayPartNumber("SUZ-Brake Bulb 2 Fil")).toBe("SUZ-Brake Bulb 2 Fil");
    expect(displayPartNumber("ABC123")).toBe("ABC123");
  });

  it("keeps the logo graphics the size the layout expects", () => {
    expect(KIA_LOGO.width).toBe(112);
    expect(KIA_LOGO.zpl.startsWith(`^GFA,${14 * KIA_LOGO.height},`)).toBe(true);
    expect(KIA_BADGE.zpl.startsWith(`^GFA,${13 * KIA_BADGE.height},`)).toBe(true);
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
