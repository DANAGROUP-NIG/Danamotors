import { PrismaClient } from "@prisma/client";
import { sleep } from "./helpers";

export interface PartDef {
  partNumber: string;
  name: string;
  unitPrice: number;
}

export const PARTS: PartDef[] = [
  { partNumber: "ENG-OIL-5W30", name: "Engine Oil 5W-30 (4L)", unitPrice: 8500 },
  { partNumber: "ENG-OIL-10W40", name: "Engine Oil 10W-40 (4L)", unitPrice: 7500 },
  { partNumber: "ENG-OIL-20W50", name: "Engine Oil 20W-50 (4L)", unitPrice: 7000 },
  { partNumber: "TRANS-OIL-ATF", name: "ATF Transmission Fluid (1L)", unitPrice: 4500 },
  { partNumber: "BRK-FLUID-DOT4", name: "Brake Fluid DOT-4 (500ml)", unitPrice: 3200 },
  { partNumber: "COOLANT-CONC", name: "Coolant Concentrate (5L)", unitPrice: 6500 },
  { partNumber: "PWR-STEER-FLUID", name: "Power Steering Fluid (1L)", unitPrice: 3800 },
  { partNumber: "DIFF-OIL-75W90", name: "Differential Oil 75W-90 (1L)", unitPrice: 5200 },
  { partNumber: "GREASE-MP-LM", name: "Multi-Purpose Grease (400g)", unitPrice: 2800 },
  { partNumber: "FIL-OIL-001", name: "Oil Filter", unitPrice: 2500 },
  { partNumber: "FIL-OIL-002", name: "Oil Filter (Heavy Duty)", unitPrice: 3500 },
  { partNumber: "FIL-AIR-001", name: "Air Filter", unitPrice: 3200 },
  { partNumber: "FIL-AIR-002", name: "Air Filter (Performance)", unitPrice: 5800 },
  { partNumber: "FIL-CABIN-001", name: "Cabin / A/C Filter", unitPrice: 2800 },
  { partNumber: "FIL-FUEL-001", name: "Fuel Filter", unitPrice: 3500 },
  { partNumber: "FIL-FUEL-002", name: "Fuel Filter (Diesel)", unitPrice: 4500 },
  { partNumber: "FIL-TRANS-001", name: "Transmission Filter", unitPrice: 4200 },
  { partNumber: "BRK-PAD-F01", name: "Front Brake Pads (Set)", unitPrice: 18000 },
  { partNumber: "BRK-PAD-R01", name: "Rear Brake Pads (Set)", unitPrice: 16000 },
  { partNumber: "BRK-PAD-CERA", name: "Ceramic Brake Pads (Set)", unitPrice: 25000 },
  { partNumber: "BRK-DSC-F01", name: "Front Brake Disc (each)", unitPrice: 25000 },
  { partNumber: "BRK-DSC-R01", name: "Rear Brake Disc (each)", unitPrice: 22000 },
  { partNumber: "BRK-DSC-VENT", name: "Vented Brake Disc (each)", unitPrice: 32000 },
  { partNumber: "BRK-CALIPER-F", name: "Front Brake Caliper", unitPrice: 45000 },
  { partNumber: "BRK-CALIPER-R", name: "Rear Brake Caliper", unitPrice: 38000 },
  { partNumber: "BRK-LINE-SS", name: "Stainless Brake Line", unitPrice: 8500 },
  { partNumber: "BRK-SHOE-R01", name: "Rear Brake Shoes (Set)", unitPrice: 12000 },
  { partNumber: "SPN-SPK-001", name: "Spark Plug (each)", unitPrice: 2800 },
  { partNumber: "SPN-SPK-IRID", name: "Iridium Spark Plug (each)", unitPrice: 5500 },
  { partNumber: "SPN-SPK-DUAL", name: "Dual Platinum Spark Plug (each)", unitPrice: 4200 },
  { partNumber: "IGN-COIL-001", name: "Ignition Coil", unitPrice: 15000 },
  { partNumber: "IGN-COIL-PACK", name: "Ignition Coil Pack", unitPrice: 35000 },
  { partNumber: "IGN-MODULE-001", name: "Ignition Control Module", unitPrice: 22000 },
  { partNumber: "IGN-CABLE-SET", name: "Spark Plug Cable Set", unitPrice: 9500 },
  { partNumber: "BAT-12V-60AH", name: "Battery 12V 60Ah", unitPrice: 45000 },
  { partNumber: "BAT-12V-70AH", name: "Battery 12V 70Ah", unitPrice: 52000 },
  { partNumber: "BAT-12V-100AH", name: "Battery 12V 100Ah (Diesel)", unitPrice: 72000 },
  { partNumber: "ALT-100A", name: "Alternator 100A", unitPrice: 85000 },
  { partNumber: "ALT-120A", name: "Alternator 120A", unitPrice: 95000 },
  { partNumber: "STR-MOTOR-001", name: "Starter Motor", unitPrice: 78000 },
  { partNumber: "FUSE-BOX-MAIN", name: "Main Fuse Box", unitPrice: 12000 },
  { partNumber: "RELAY-BOSCH", name: "Relay (Bosch Type)", unitPrice: 2500 },
  { partNumber: "HL-BULB-LED", name: "LED Headlight Bulb (Pair)", unitPrice: 15000 },
  { partNumber: "TL-BULB-LED", name: "LED Tail Light Bulb (Pair)", unitPrice: 8500 },
  { partNumber: "FOG-LAMP-LED", name: "LED Fog Light (each)", unitPrice: 12000 },
  { partNumber: "TYR-175-70R14", name: "Tyre 175/70R14", unitPrice: 28000 },
  { partNumber: "TYR-185-65R15", name: "Tyre 185/65R15", unitPrice: 30000 },
  { partNumber: "TYR-195-65R15", name: "Tyre 195/65R15", unitPrice: 32000 },
  { partNumber: "TYR-205-55R16", name: "Tyre 205/55R16", unitPrice: 38000 },
  { partNumber: "TYR-215-55R17", name: "Tyre 215/55R17", unitPrice: 45000 },
  { partNumber: "TYR-225-45R18", name: "Tyre 225/45R18", unitPrice: 55000 },
  { partNumber: "TYR-265-65R17", name: "Tyre 265/65R17 (SUV/4x4)", unitPrice: 68000 },
  { partNumber: "TYR-SPARE-SEAL", name: "Tyre Puncture Repair Kit", unitPrice: 4500 },
  { partNumber: "TYR-VALVE-TPMS", name: "TPMS Valve (each)", unitPrice: 3500 },
  { partNumber: "COO-THERM-01", name: "Thermostat", unitPrice: 7500 },
  { partNumber: "COO-HOSE-RAD", name: "Radiator Hose (Upper)", unitPrice: 5500 },
  { partNumber: "COO-HOSE-LWR", name: "Radiator Hose (Lower)", unitPrice: 5500 },
  { partNumber: "COO-HOSE-HEAT", name: "Heater Hose", unitPrice: 4500 },
  { partNumber: "COO-RAD-ALM", name: "Aluminium Radiator", unitPrice: 65000 },
  { partNumber: "COO-FAN-ELEC", name: "Electric Cooling Fan", unitPrice: 28000 },
  { partNumber: "COO-FAN-CLUTCH", name: "Fan Clutch", unitPrice: 18000 },
  { partNumber: "COO-WP-001", name: "Water Pump", unitPrice: 22000 },
  { partNumber: "COO-EXP-TANK", name: "Coolant Expansion Tank", unitPrice: 8500 },
  { partNumber: "COO-TEMP-SENS", name: "Coolant Temperature Sensor", unitPrice: 4500 },
  { partNumber: "SUS-SHOCK-F01", name: "Front Shock Absorber (each)", unitPrice: 35000 },
  { partNumber: "SUS-SHOCK-R01", name: "Rear Shock Absorber (each)", unitPrice: 32000 },
  { partNumber: "SUS-STRUT-F01", name: "Front Strut Assembly (each)", unitPrice: 55000 },
  { partNumber: "SUS-SPRING-F01", name: "Front Coil Spring (each)", unitPrice: 15000 },
  { partNumber: "SUS-SPRING-R01", name: "Rear Coil Spring (each)", unitPrice: 14000 },
  { partNumber: "SUS-CONT-ARM", name: "Control Arm (Lower)", unitPrice: 28000 },
  { partNumber: "SUS-BALL-JNT", name: "Ball Joint", unitPrice: 8500 },
  { partNumber: "SUS-TIE-ROD", name: "Tie Rod End", unitPrice: 7500 },
  { partNumber: "SUS-SWAY-BAR", name: "Sway Bar Link", unitPrice: 6500 },
  { partNumber: "SUS-BUSH-KIT", name: "Suspension Bush Kit", unitPrice: 12000 },
  { partNumber: "STR-RACK-001", name: "Steering Rack (assembly)", unitPrice: 95000 },
  { partNumber: "STR-PUMP-001", name: "Power Steering Pump", unitPrice: 55000 },
  { partNumber: "STR-COULM-JNT", name: "Steering Column Joint", unitPrice: 12000 },
  { partNumber: "STR-BELLOW-KIT", name: "Steering Rack Bellows Kit", unitPrice: 6500 },
  { partNumber: "TRN-CLUTCH-KIT", name: "Clutch Kit (Plate+Disk+Release)", unitPrice: 85000 },
  { partNumber: "TRN-CLUTCH-DSK", name: "Clutch Disc", unitPrice: 35000 },
  { partNumber: "TRN-CLUTCH-PLT", name: "Clutch Pressure Plate", unitPrice: 40000 },
  { partNumber: "TRN-REL-BRG", name: "Clutch Release Bearing", unitPrice: 8500 },
  { partNumber: "TRN-MT-OIL", name: "Manual Transmission Oil (4L)", unitPrice: 12000 },
  { partNumber: "TRN-MOUNT-001", name: "Transmission Mount", unitPrice: 9500 },
  { partNumber: "TRN-CV-AXLE-F", name: "Front CV Axle (each)", unitPrice: 45000 },
  { partNumber: "TRN-CV-BOOT-KIT", name: "CV Boot Kit", unitPrice: 5500 },
  { partNumber: "BDY-WIPER-BLADE", name: "Wiper Blade (Pair)", unitPrice: 4500 },
  { partNumber: "BDY-WIPER-BEAM", name: "Beam Wiper Blade (Pair)", unitPrice: 7500 },
  { partNumber: "BDY-SIDE-MIRROR", name: "Side Mirror (each)", unitPrice: 15000 },
  { partNumber: "BDY-DOOR-HANDLE", name: "Door Handle (each)", unitPrice: 5500 },
  { partNumber: "BDY-BUMPER-F01", name: "Front Bumper Cover", unitPrice: 35000 },
  { partNumber: "BDY-BUMPER-R01", name: "Rear Bumper Cover", unitPrice: 30000 },
  { partNumber: "BDY-GRILLE-001", name: "Grille Assembly", unitPrice: 12000 },
  { partNumber: "BDY-LOCK-ACT", name: "Door Lock Actuator", unitPrice: 9500 },
  { partNumber: "BDY-WIN-REG", name: "Window Regulator", unitPrice: 18000 },
  { partNumber: "AC-COMP-001", name: "A/C Compressor", unitPrice: 95000 },
  { partNumber: "AC-COND-001", name: "A/C Condenser", unitPrice: 45000 },
  { partNumber: "AC-EVAP-001", name: "A/C Evaporator", unitPrice: 38000 },
  { partNumber: "AC-RECV-DRY", name: "Receiver Drier / Accumulator", unitPrice: 8500 },
  { partNumber: "AC-EXP-VALVE", name: "Expansion Valve", unitPrice: 7500 },
  { partNumber: "AC-HOSE-HP", name: "A/C High-Pressure Hose", unitPrice: 12000 },
  { partNumber: "AC-HOSE-LP", name: "A/C Low-Pressure Hose", unitPrice: 11000 },
  { partNumber: "AC-BLOWER-MTR", name: "Blower Motor", unitPrice: 25000 },
  { partNumber: "AC-FAN-RES", name: "Blower Motor Resistor", unitPrice: 6500 },
  { partNumber: "AC-GAS-R134A", name: "Refrigerant R-134a (330g)", unitPrice: 5500 },
  { partNumber: "AC-GAS-1234YF", name: "Refrigerant 1234yf (330g)", unitPrice: 12000 },
  { partNumber: "BELT-ALT-001", name: "Alternator Belt", unitPrice: 3500 },
  { partNumber: "BELT-SERP-001", name: "Serpentine Belt", unitPrice: 6500 },
  { partNumber: "BELT-SERP-002", name: "Serpentine Belt (Heavy Duty)", unitPrice: 8500 },
  { partNumber: "BELT-TIMING-KIT", name: "Timing Belt Kit", unitPrice: 35000 },
  { partNumber: "BELT-TIMING-TEN", name: "Timing Belt Tensioner", unitPrice: 12000 },
  { partNumber: "BELT-TIMING-IDL", name: "Timing Belt Idler Pulley", unitPrice: 8500 },
  { partNumber: "BELT-AC-001", name: "A/C Compressor Belt", unitPrice: 3500 },
  { partNumber: "ENG-HEAD-GSKT", name: "Cylinder Head Gasket", unitPrice: 12000 },
  { partNumber: "ENG-VALVE-IN", name: "Intake Valve (each)", unitPrice: 4500 },
  { partNumber: "ENG-VALVE-EX", name: "Exhaust Valve (each)", unitPrice: 5000 },
  { partNumber: "ENG-OIL-PMP", name: "Oil Pump", unitPrice: 25000 },
  { partNumber: "ENG-TIMING-CHN", name: "Timing Chain", unitPrice: 22000 },
  { partNumber: "ENG-PISTON-RNG", name: "Piston Ring Set", unitPrice: 18000 },
  { partNumber: "ENG-MAIN-BRG", name: "Main Bearing Set", unitPrice: 15000 },
  { partNumber: "ENG-CON-ROD-BRG", name: "Connecting Rod Bearing Set", unitPrice: 12000 },
  { partNumber: "ENG-OIL-PAN", name: "Oil Pan", unitPrice: 15000 },
  { partNumber: "ENG-VALVE-COVER", name: "Valve Cover Gasket", unitPrice: 5500 },
  { partNumber: "EXH-MUFF-001", name: "Muffler", unitPrice: 28000 },
  { partNumber: "EXH-CAT-001", name: "Catalytic Converter", unitPrice: 85000 },
  { partNumber: "EXH-O2-SENS", name: "Oxygen Sensor", unitPrice: 18000 },
  { partNumber: "EXH-GASKET", name: "Exhaust Manifold Gasket", unitPrice: 4500 },
  { partNumber: "EXH-HANG-KIT", name: "Exhaust Hanger Kit", unitPrice: 3500 },
  { partNumber: "SNS-MAP-001", name: "MAP Sensor", unitPrice: 12000 },
  { partNumber: "SNS-MAF-001", name: "MAF Sensor", unitPrice: 25000 },
  { partNumber: "SNS-CKP-001", name: "Crankshaft Position Sensor", unitPrice: 8500 },
  { partNumber: "SNS-CMP-001", name: "Camshaft Position Sensor", unitPrice: 8500 },
  { partNumber: "SNS-KNOCK-001", name: "Knock Sensor", unitPrice: 9500 },
  { partNumber: "SNS-ABS-001", name: "ABS Wheel Speed Sensor", unitPrice: 12000 },
  { partNumber: "SNS-PARK-001", name: "Parking Sensor (each)", unitPrice: 5500 },
];

export default async function seedSpareParts(prisma: PrismaClient) {
  const BATCH_SIZE = 50;
  for (let i = 0; i < PARTS.length; i += BATCH_SIZE) {
    const batch = PARTS.slice(i, i + BATCH_SIZE);
    await prisma.sparePart.createMany({
      data: batch.map((p) => ({
        partNumber: p.partNumber,
        name: p.name,
        unitPrice: p.unitPrice,
        description: `${p.name} — genuine replacement part`,
      })),
      skipDuplicates: true,
    });
    console.log(`  ⏳ ${Math.min(i + BATCH_SIZE, PARTS.length)}/${PARTS.length} spare parts seeded...`);
    await sleep(300);
  }
  const result = await prisma.sparePart.findMany({ orderBy: { createdAt: "asc" } });
  console.log(`✅ Seeded ${result.length} spare parts`);
  return result;
}

// Self-execute when run directly: `npx ts-node prisma/seed/spareParts.ts`
if (require.main === module) {
  (async () => {
    const prisma = new PrismaClient();
    try {
      await seedSpareParts(prisma);
    } finally {
      await prisma.$disconnect();
    }
  })();
}
