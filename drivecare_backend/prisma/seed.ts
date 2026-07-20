import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { ROLES, ROLE_PERMISSIONS, PERMISSIONS } from '../src/shared/constants/roles';

const prisma = new PrismaClient();

// ─── helpers ────────────────────────────────────────────────────────────────
const hash = (p: string) => bcrypt.hash(p, 10);

async function seedBranches() {
  const branches = [
    { name: 'Main Branch',        address: '1 Marina Road',     city: 'Lagos',          state: 'Lagos',      country: 'Nigeria', phoneNumber: '+2341000001', email: 'main@drivecare.com' },
    { name: 'Abuja Branch',       address: '15 Wuse Zone 3',    city: 'Abuja',          state: 'FCT',        country: 'Nigeria', phoneNumber: '+2341000002', email: 'abuja@drivecare.com' },
    { name: 'Port Harcourt Branch', address: '8 Trans-Amadi Rd', city: 'Port Harcourt', state: 'Rivers',     country: 'Nigeria', phoneNumber: '+2341000003', email: 'ph@drivecare.com' },
  ];
  const result = [];
  for (const b of branches) {
    const branch = await prisma.branch.upsert({ where: { name: b.name }, update: {}, create: { ...b, isActive: true } });
    result.push(branch);
  }
  console.log(`✅ Seeded ${result.length} branches`);
  return result;
}

async function seedPermissionsAndRoles() {
  const permissionEntries = Object.values(PERMISSIONS);
  for (const permName of permissionEntries) {
    await prisma.permission.upsert({
      where: { name: permName },
      update: {},
      create: { name: permName, description: `Permission to perform ${permName.replace(':', ' ')} operations` },
    });
  }
  console.log(`✅ Seeded ${permissionEntries.length} permissions`);

  for (const roleName of Object.values(ROLES)) {
    const dbRole = await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName, description: `${roleName} user role` },
    });
    const allowedPerms = ROLE_PERMISSIONS[roleName];
    const permRecords = await prisma.permission.findMany({ where: { name: { in: allowedPerms } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: dbRole.id } });
    if (permRecords.length > 0) {
      await prisma.rolePermission.createMany({
        data: permRecords.map((p) => ({ roleId: dbRole.id, permissionId: p.id })),
      });
    }
    console.log(`  👤 Role '${roleName}' → ${permRecords.length} permissions`);
  }
}

async function seedStaffUsers(branches: { id: string; name: string }[]) {
  const mainBranch  = branches[0];
  const abujaBranch = branches[1];
  const phBranch    = branches[2];

  const roles = await prisma.role.findMany();
  const roleMap = Object.fromEntries(roles.map((r) => [r.name, r.id]));

  const staff = [
    // SuperAdmin
    { email: process.env.SUPERADMIN_EMAIL ?? 'superadmin@drivecare.com', password: process.env.SUPERADMIN_PASSWORD ?? 'SuperAdmin@123', firstName: 'Super',    lastName: 'Admin',    role: ROLES.SUPER_ADMIN,      branchId: mainBranch.id },
    // Admins
    { email: 'admin.lagos@drivecare.com',    password: 'Admin@123',      firstName: 'Adaeze',   lastName: 'Okonkwo',  role: ROLES.ADMIN,            branchId: mainBranch.id },
    { email: 'admin.abuja@drivecare.com',    password: 'Admin@123',      firstName: 'Emeka',    lastName: 'Nwosu',    role: ROLES.ADMIN,            branchId: abujaBranch.id },
    // Receptionists
    { email: 'reception1@drivecare.com',     password: 'Recept@123',     firstName: 'Chidinma', lastName: 'Okafor',   role: ROLES.RECEPTIONIST,     branchId: mainBranch.id },
    { email: 'reception2@drivecare.com',     password: 'Recept@123',     firstName: 'Hauwa',    lastName: 'Musa',     role: ROLES.RECEPTIONIST,     branchId: abujaBranch.id },
    { email: 'reception3@drivecare.com',     password: 'Recept@123',     firstName: 'Priscilla',lastName: 'Hart',     role: ROLES.RECEPTIONIST,     branchId: phBranch.id },
    // Workshop Managers
    { email: 'wm.lagos@drivecare.com',       password: 'WManager@123',   firstName: 'Rotimi',   lastName: 'Ajayi',    role: ROLES.WORKSHOP_MANAGER, branchId: mainBranch.id },
    { email: 'wm.abuja@drivecare.com',       password: 'WManager@123',   firstName: 'Musa',     lastName: 'Ibrahim',  role: ROLES.WORKSHOP_MANAGER, branchId: abujaBranch.id },
    { email: 'wm.ph@drivecare.com',          password: 'WManager@123',   firstName: 'Godwin',   lastName: 'Peters',   role: ROLES.WORKSHOP_MANAGER, branchId: phBranch.id },
    // Service Advisors
    { email: 'advisor1@drivecare.com',       password: 'Advisor@123',    firstName: 'Chidi',    lastName: 'Eze',      role: ROLES.SERVICE_ADVISOR,  branchId: mainBranch.id },
    { email: 'advisor2@drivecare.com',       password: 'Advisor@123',    firstName: 'Fatima',   lastName: 'Bello',    role: ROLES.SERVICE_ADVISOR,  branchId: abujaBranch.id },
    { email: 'advisor3@drivecare.com',       password: 'Advisor@123',    firstName: 'Blessing', lastName: 'Obi',      role: ROLES.SERVICE_ADVISOR,  branchId: phBranch.id },
    // Technicians
    { email: 'tech1@drivecare.com',          password: 'Tech@123',       firstName: 'Tunde',    lastName: 'Akinyemi', role: ROLES.TECHNICIAN,       branchId: mainBranch.id },
    { email: 'tech2@drivecare.com',          password: 'Tech@123',       firstName: 'Kingsley', lastName: 'Okoro',    role: ROLES.TECHNICIAN,       branchId: mainBranch.id },
    { email: 'tech3@drivecare.com',          password: 'Tech@123',       firstName: 'Usman',    lastName: 'Garba',    role: ROLES.TECHNICIAN,       branchId: abujaBranch.id },
    { email: 'tech4@drivecare.com',          password: 'Tech@123',       firstName: 'Ifeanyi',  lastName: 'Chukwu',   role: ROLES.TECHNICIAN,       branchId: phBranch.id },
  ];

  const result = [];
  for (const s of staff) {
    const passwordHash = await hash(s.password);
    const user = await prisma.user.upsert({
      where: { email: s.email },
      update: {},
      create: { email: s.email, passwordHash, firstName: s.firstName, lastName: s.lastName, isActive: true, roleId: roleMap[s.role], branchId: s.branchId },
    });
    result.push(user);
  }
  console.log(`✅ Seeded ${result.length} staff users`);
  return result;
}

async function seedCustomers() {
  const customerRole = await prisma.role.findUniqueOrThrow({ where: { name: ROLES.CUSTOMER } });

  const customers = [
    { email: 'john.doe@gmail.com',      password: 'Customer@123', firstName: 'John',    lastName: 'Doe',      phone: '+2348011111111', dob: '1985-06-15', license: 'NG-LA-001234', address: '12 Allen Ave', city: 'Lagos',         state: 'Lagos',  postalCode: '100001', country: 'Nigeria' },
    { email: 'amaka.obi@gmail.com',     password: 'Customer@123', firstName: 'Amaka',   lastName: 'Obi',      phone: '+2348022222222', dob: '1990-03-22', license: 'NG-AB-005678', address: '5 Gana Street', city: 'Abuja',        state: 'FCT',    postalCode: '900001', country: 'Nigeria' },
    { email: 'seun.adeyemi@gmail.com',  password: 'Customer@123', firstName: 'Seun',    lastName: 'Adeyemi',  phone: '+2348033333333', dob: '1988-11-08', license: 'NG-LA-009012', address: '30 Broad St',   city: 'Lagos',        state: 'Lagos',  postalCode: '100002', country: 'Nigeria' },
    { email: 'biodun.alao@yahoo.com',   password: 'Customer@123', firstName: 'Biodun',  lastName: 'Alao',     phone: '+2348044444444', dob: '1979-07-30', license: 'NG-PH-003456', address: '17 Rumuola Rd', city: 'Port Harcourt', state: 'Rivers', postalCode: '500001', country: 'Nigeria' },
    { email: 'ngozi.nwosu@gmail.com',   password: 'Customer@123', firstName: 'Ngozi',   lastName: 'Nwosu',    phone: '+2348055555555', dob: '1993-01-14', license: 'NG-AB-007890', address: '9 Wuse Market', city: 'Abuja',        state: 'FCT',    postalCode: '900002', country: 'Nigeria' },
  ];

  const result = [];
  for (const c of customers) {
    const passwordHash = await hash(c.password);
    const existing = await prisma.user.findUnique({ where: { email: c.email } });
    let user = existing;
    if (!user) {
      user = await prisma.user.create({
        data: { email: c.email, passwordHash, firstName: c.firstName, lastName: c.lastName, phoneNumber: c.phone, isActive: true, roleId: customerRole.id },
      });
    }
    const customer = await prisma.customer.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        dateOfBirth: new Date(c.dob),
        driverLicenseNumber: c.license,
        address: c.address,
        city: c.city,
        state: c.state,
        postalCode: c.postalCode,
        country: c.country,
        preferredContactMethod: 'Phone',
      },
    });
    result.push({ user, customer });
  }
  console.log(`✅ Seeded ${result.length} customers`);
  return result;
}

async function seedVehicles(customers: { customer: { id: string } }[]) {
  const [c0, c1, c2, c3, c4] = customers;

  const vehicles = [
    // John Doe — 2 cars
    { customerId: c0.customer.id, vin: 'JTDBL40E299012345', make: 'Toyota',  model: 'Camry',    year: 2019, color: 'Silver', ownershipStatus: 'Owned' },
    { customerId: c0.customer.id, vin: 'WBA3A5G51DNP12345', make: 'BMW',     model: '3 Series', year: 2021, color: 'Black',  ownershipStatus: 'Owned' },
    // Amaka Obi — 2 cars
    { customerId: c1.customer.id, vin: '1HGCM82633A112233', make: 'Honda',   model: 'Accord',   year: 2018, color: 'White',  ownershipStatus: 'Owned' },
    { customerId: c1.customer.id, vin: '2T1BURHE0JC044556', make: 'Toyota',  model: 'Corolla',  year: 2020, color: 'Blue',   ownershipStatus: 'Owned' },
    // Seun Adeyemi — 1 car
    { customerId: c2.customer.id, vin: 'SALFA2BN9HA667788', make: 'Land Rover', model: 'Discovery', year: 2017, color: 'Grey', ownershipStatus: 'Owned' },
    // Biodun Alao — 2 cars
    { customerId: c3.customer.id, vin: 'YV1RS61R412112233', make: 'Volvo',   model: 'S60',      year: 2016, color: 'Red',    ownershipStatus: 'Owned' },
    { customerId: c3.customer.id, vin: 'WDD2050421F223344', make: 'Mercedes', model: 'C-Class', year: 2022, color: 'White',  ownershipStatus: 'Owned' },
    // Ngozi Nwosu — 1 car
    { customerId: c4.customer.id, vin: 'KMHD84LF8HU334455', make: 'Hyundai', model: 'Elantra',  year: 2020, color: 'Black',  ownershipStatus: 'Owned' },
  ];

  const result = [];
  for (const v of vehicles) {
    const vehicle = await prisma.vehicle.upsert({
      where: { vin: v.vin },
      update: {},
      create: { ...v, trim: 'Standard', warrantyStatus: 'Active', warrantyExpiresAt: new Date('2026-12-31') },
    });
    result.push(vehicle);
  }
  console.log(`✅ Seeded ${result.length} vehicles`);
  return result;
}

async function seedSpareParts() {
  const parts = [
    { partNumber: 'ENG-OIL-5W30', name: 'Engine Oil 5W-30 (4L)',    category: 'Lubricants',  unitPrice: 8500,  stock: 50, minimumStock: 10 },
    { partNumber: 'FIL-OIL-001',  name: 'Oil Filter',               category: 'Filters',     unitPrice: 2500,  stock: 80, minimumStock: 20 },
    { partNumber: 'FIL-AIR-001',  name: 'Air Filter',               category: 'Filters',     unitPrice: 3200,  stock: 60, minimumStock: 15 },
    { partNumber: 'BRK-PAD-F01',  name: 'Front Brake Pads (Set)',   category: 'Brakes',      unitPrice: 18000, stock: 30, minimumStock: 8 },
    { partNumber: 'BRK-DSC-F01',  name: 'Front Brake Disc',        category: 'Brakes',      unitPrice: 25000, stock: 20, minimumStock: 5 },
    { partNumber: 'SPN-SPK-001',  name: 'Spark Plug (each)',        category: 'Ignition',    unitPrice: 2800,  stock: 100, minimumStock: 30 },
    { partNumber: 'BAT-12V-60AH', name: 'Battery 12V 60Ah',        category: 'Electrical',  unitPrice: 45000, stock: 15, minimumStock: 5 },
    { partNumber: 'TYR-195-65R15', name: 'Tyre 195/65R15',         category: 'Tyres',       unitPrice: 32000, stock: 40, minimumStock: 10 },
    { partNumber: 'COO-THERM-01', name: 'Thermostat',              category: 'Cooling',     unitPrice: 7500,  stock: 25, minimumStock: 5 },
    { partNumber: 'COO-HOSE-RAD', name: 'Radiator Hose',           category: 'Cooling',     unitPrice: 5500,  stock: 30, minimumStock: 8 },
  ];

  const result = [];
  for (const p of parts) {
    const part = await prisma.sparePart.upsert({
      where: { partNumber: p.partNumber },
      update: {},
      create: { ...p, description: `${p.name} — genuine replacement part` },
    });
    result.push(part);
  }
  console.log(`✅ Seeded ${result.length} spare parts`);
  return result;
}

async function seedAppointmentsAndJobCards(
  branches:   { id: string; name: string }[],
  customers:  { user: { id: string }; customer: { id: string } }[],
  vehicles:   { id: string }[],
  staffUsers: { id: string; email: string }[],
  spareParts: { id: string; partNumber: string }[],
) {
  const [mainBranch, abujaBranch, phBranch] = branches;
  const [c0, c1, c2, c3, c4]               = customers;
  // vehicles: 0,1=John | 2,3=Amaka | 4=Seun | 5,6=Biodun | 7=Ngozi
  const [v0, v1, v2, v3, v4, v5, v6, v7]  = vehicles;

  const tech1  = staffUsers.find(u => u.email === 'tech1@drivecare.com')!;
  const tech2  = staffUsers.find(u => u.email === 'tech2@drivecare.com')!;
  const tech3  = staffUsers.find(u => u.email === 'tech3@drivecare.com')!;
  const tech4  = staffUsers.find(u => u.email === 'tech4@drivecare.com')!;
  const oilPart   = spareParts.find(p => p.partNumber === 'ENG-OIL-5W30')!;
  const filterPart = spareParts.find(p => p.partNumber === 'FIL-OIL-001')!;
  const brakePad  = spareParts.find(p => p.partNumber === 'BRK-PAD-F01')!;
  const sparkPlug = spareParts.find(p => p.partNumber === 'SPN-SPK-001')!;

  // ── Appointments ──────────────────────────────────────────────────────────
  const apptData = [
    { customerId: c0.customer.id, vehicleId: v0.id, branchId: mainBranch.id,  scheduledAt: new Date('2026-03-10T09:00:00Z'), durationMins: 120, notes: 'Full service + brake check', status: 'Completed' },
    { customerId: c0.customer.id, vehicleId: v1.id, branchId: abujaBranch.id, scheduledAt: new Date('2026-05-20T10:00:00Z'), durationMins: 90,  notes: 'Oil change and inspection',  status: 'Completed' },
    { customerId: c1.customer.id, vehicleId: v2.id, branchId: mainBranch.id,  scheduledAt: new Date('2026-04-05T08:30:00Z'), durationMins: 60,  notes: 'Routine service',            status: 'Completed' },
    { customerId: c1.customer.id, vehicleId: v3.id, branchId: phBranch.id,    scheduledAt: new Date('2026-06-01T11:00:00Z'), durationMins: 90,  notes: 'Tyre rotation + balance',   status: 'Pending' },
    { customerId: c2.customer.id, vehicleId: v4.id, branchId: mainBranch.id,  scheduledAt: new Date('2026-05-15T14:00:00Z'), durationMins: 180, notes: 'Full diagnostic scan',      status: 'Completed' },
    { customerId: c3.customer.id, vehicleId: v5.id, branchId: phBranch.id,    scheduledAt: new Date('2026-04-22T09:30:00Z'), durationMins: 120, notes: 'Brake replacement',         status: 'Completed' },
    { customerId: c3.customer.id, vehicleId: v6.id, branchId: abujaBranch.id, scheduledAt: new Date('2026-06-10T10:30:00Z'), durationMins: 60,  notes: 'Oil change',                status: 'Pending' },
    { customerId: c4.customer.id, vehicleId: v7.id, branchId: mainBranch.id,  scheduledAt: new Date('2026-06-05T15:00:00Z'), durationMins: 90,  notes: 'Spark plug replacement',    status: 'Pending' },
  ];

  const appts = [];
  for (const a of apptData) {
    // upsert by customer + vehicle + scheduledAt to stay idempotent
    const existing = await prisma.serviceAppointment.findFirst({
      where: { customerId: a.customerId, vehicleId: a.vehicleId, scheduledAt: a.scheduledAt },
    });
    const appt = existing ?? await prisma.serviceAppointment.create({ data: a });
    appts.push(appt);
  }
  console.log(`✅ Seeded ${appts.length} appointments`);
  return { appts, tech1, tech2, tech3, tech4, oilPart, filterPart, brakePad, sparkPlug };
}

async function seedJobCards(
  branches:   { id: string; name: string }[],
  customers:  { user: { id: string }; customer: { id: string } }[],
  vehicles:   { id: string }[],
  appts:      { id: string; branchId: string; customerId: string; vehicleId: string }[],
  staffUsers: { id: string; email: string }[],
  spareParts: { id: string; partNumber: string; unitPrice: number }[],
) {
  const [mainBranch, abujaBranch, phBranch] = branches;
  const [c0, c1, c2, c3, c4]               = customers;
  const [v0, v1, v2, v3, v4, v5, v6, v7]  = vehicles;
  const tech1 = staffUsers.find(u => u.email === 'tech1@drivecare.com')!;
  const tech2 = staffUsers.find(u => u.email === 'tech2@drivecare.com')!;
  const tech3 = staffUsers.find(u => u.email === 'tech3@drivecare.com')!;
  const tech4 = staffUsers.find(u => u.email === 'tech4@drivecare.com')!;
  const advisor1 = staffUsers.find(u => u.email === 'advisor1@drivecare.com')!;

  const oilPart    = spareParts.find(p => p.partNumber === 'ENG-OIL-5W30')!;
  const filterPart = spareParts.find(p => p.partNumber === 'FIL-OIL-001')!;
  const brakePad   = spareParts.find(p => p.partNumber === 'BRK-PAD-F01')!;
  const sparkPlug  = spareParts.find(p => p.partNumber === 'SPN-SPK-001')!;

  const jobCardDefs = [
    { jobNumber: 'JC-2026-001', appointmentId: appts[0].id, customerId: c0.customer.id, vehicleId: v0.id, branchId: mainBranch.id,  description: 'Full service — oil change, brake inspection, air filter',    status: 'Closed',      estimatedHours: 2,   estimatedCost: 35000, technicianId: tech1.id, qualityInspectorId: tech2.id, progress: 100, qcStatus: 'Passed' },
    { jobNumber: 'JC-2026-002', appointmentId: appts[1].id, customerId: c0.customer.id, vehicleId: v1.id, branchId: abujaBranch.id, description: 'Oil change and 20-point inspection',                           status: 'Closed',      estimatedHours: 1.5, estimatedCost: 22000, technicianId: tech3.id, qualityInspectorId: null,     progress: 100, qcStatus: 'Passed' },
    { jobNumber: 'JC-2026-003', appointmentId: appts[2].id, customerId: c1.customer.id, vehicleId: v2.id, branchId: mainBranch.id,  description: 'Routine service — oil, filters, tyre pressure',               status: 'Closed',      estimatedHours: 1,   estimatedCost: 18500, technicianId: tech2.id, qualityInspectorId: null,     progress: 100, qcStatus: 'Passed' },
    { jobNumber: 'JC-2026-004', appointmentId: appts[3].id, customerId: c1.customer.id, vehicleId: v3.id, branchId: phBranch.id,    description: 'Tyre rotation, wheel balancing, alignment check',             status: 'In Progress', estimatedHours: 1.5, estimatedCost: 15000, technicianId: tech4.id, qualityInspectorId: null,     progress: 60,  qcStatus: 'Pending' },
    { jobNumber: 'JC-2026-005', appointmentId: appts[4].id, customerId: c2.customer.id, vehicleId: v4.id, branchId: mainBranch.id,  description: 'Full diagnostic scan — check engine, transmission, ABS',      status: 'Closed',      estimatedHours: 3,   estimatedCost: 45000, technicianId: tech1.id, qualityInspectorId: tech2.id, progress: 100, qcStatus: 'Passed' },
    { jobNumber: 'JC-2026-006', appointmentId: appts[5].id, customerId: c3.customer.id, vehicleId: v5.id, branchId: phBranch.id,    description: 'Front and rear brake pad replacement',                        status: 'Closed',      estimatedHours: 2.5, estimatedCost: 52000, technicianId: tech4.id, qualityInspectorId: null,     progress: 100, qcStatus: 'Passed' },
    { jobNumber: 'JC-2026-007', appointmentId: appts[6].id, customerId: c3.customer.id, vehicleId: v6.id, branchId: abujaBranch.id, description: 'Oil change — synthetic 5W-30',                                 status: 'Open',        estimatedHours: 1,   estimatedCost: 12000, technicianId: tech3.id, qualityInspectorId: null,     progress: 0,   qcStatus: 'Pending' },
    { jobNumber: 'JC-2026-008', appointmentId: appts[7].id, customerId: c4.customer.id, vehicleId: v7.id, branchId: mainBranch.id,  description: 'Spark plug replacement — all 4 cylinders',                    status: 'Open',        estimatedHours: 1,   estimatedCost: 16200, technicianId: tech2.id, qualityInspectorId: null,     progress: 0,   qcStatus: 'Pending' },
    // Extra job card: John's Toyota at Port Harcourt (cross-branch visit)
    { jobNumber: 'JC-2026-009', appointmentId: null, customerId: c0.customer.id, vehicleId: v0.id, branchId: phBranch.id, description: 'Emergency — coolant leak investigation',                              status: 'Closed',      estimatedHours: 2,   estimatedCost: 28000, technicianId: tech4.id, qualityInspectorId: null,     progress: 100, qcStatus: 'Passed' },
  ];

  const jobCards = [];
  for (const jc of jobCardDefs) {
    const card = await prisma.jobCard.upsert({
      where: { jobNumber: jc.jobNumber },
      update: {},
      create: jc as any,
    });
    jobCards.push(card);
  }
  console.log(`✅ Seeded ${jobCards.length} job cards`);
  return { jobCards, oilPart, filterPart, brakePad, sparkPlug, tech1, advisor1 };
}

async function seedInspectionsAndEstimates(
  jobCards: { id: string; jobNumber: string; status: string }[],
  advisor1: { id: string },
) {
  // Inspections for closed job cards
  const closedCards = jobCards.filter(jc => jc.status === 'Closed');
  let inspCount = 0;
  for (const jc of closedCards) {
    const exists = await prisma.inspection.findFirst({ where: { jobCardId: jc.id } });
    if (!exists) {
      await prisma.inspection.create({
        data: { jobCardId: jc.id, inspectorId: advisor1.id, findings: `Vehicle inspected for ${jc.jobNumber}. All systems checked and within spec.`, passed: true, status: 'Passed', notes: 'No issues found.' },
      });
      inspCount++;
    }
  }
  console.log(`✅ Seeded ${inspCount} inspections (skipped existing)`);

  // Estimates for each job card
  const estimateData = [
    { idx: 0, description: 'Oil change + brake inspection + air filter replacement', amount: 35000, status: 'Approved' },
    { idx: 1, description: 'Oil and filter change with 20-point inspection',         amount: 22000, status: 'Approved' },
    { idx: 2, description: 'Routine service package',                                amount: 18500, status: 'Approved' },
    { idx: 3, description: 'Tyre rotation, balancing and alignment',                 amount: 15000, status: 'Pending' },
    { idx: 4, description: 'Full electronic diagnostic scan',                        amount: 45000, status: 'Approved' },
    { idx: 5, description: 'Front and rear brake pad set + labour',                  amount: 52000, status: 'Approved' },
    { idx: 6, description: 'Synthetic oil change — full synthetic 5W-30',            amount: 12000, status: 'Pending' },
    { idx: 7, description: 'Spark plug set replacement (4 plugs) + labour',          amount: 16200, status: 'Pending' },
    { idx: 8, description: 'Coolant system inspection and leak repair',              amount: 28000, status: 'Approved' },
  ];

  const estimates = [];
  for (const e of estimateData) {
    const existing = await prisma.estimate.findFirst({ where: { jobCardId: jobCards[e.idx].id, description: e.description } });
    const est = existing ?? await prisma.estimate.create({
      data: { jobCardId: jobCards[e.idx].id, description: e.description, amount: e.amount, currency: 'NGN', status: e.status },
    });
    estimates.push(est);
  }
  console.log(`✅ Seeded ${estimates.length} estimates (skipped existing)`);
  return estimates;
}

async function seedApprovalsPartIssuancesAndInvoices(
  jobCards:   { id: string; status: string; customerId: string | null; estimatedCost: number | null }[],
  estimates:  { id: string; status: string; amount: number }[],
  advisor1:   { id: string },
  oilPart:    { id: string; unitPrice: number },
  filterPart: { id: string; unitPrice: number },
  brakePad:   { id: string; unitPrice: number },
  sparkPlug:  { id: string; unitPrice: number },
) {
  // Customer approvals for approved estimates
  const approvedEstimates = estimates.filter(e => e.status === 'Approved');
  let approvalCount = 0;
  for (const est of approvedEstimates) {
    const jc = await prisma.jobCard.findFirst({ where: { estimates: { some: { id: est.id } } } });
    if (jc?.customerId) {
      const exists = await prisma.customerApproval.findFirst({ where: { estimateId: est.id, customerId: jc.customerId } });
      if (!exists) {
        await prisma.customerApproval.create({
          data: { estimateId: est.id, customerId: jc.customerId, approved: true, decisionDate: new Date(), comments: 'Approved via phone call', status: 'Approved' },
        });
        approvalCount++;
      }
    }
  }
  console.log(`✅ Seeded ${approvalCount} customer approvals (skipped existing)`);

  // Part issuances for closed job cards
  const issuances = [
    { jobCardIdx: 0, partId: oilPart.id,    quantity: 1 },
    { jobCardIdx: 0, partId: filterPart.id, quantity: 1 },
    { jobCardIdx: 2, partId: oilPart.id,    quantity: 1 },
    { jobCardIdx: 5, partId: brakePad.id,   quantity: 2 },
    { jobCardIdx: 7, partId: sparkPlug.id,  quantity: 4 },
    { jobCardIdx: 8, partId: oilPart.id,    quantity: 1 },
  ];
  let issuanceCount = 0;
  for (const is of issuances) {
    const jc = jobCards[is.jobCardIdx];
    if (jc) {
      const exists = await prisma.partIssuance.findFirst({ where: { jobCardId: jc.id, sparePartId: is.partId } });
      if (!exists) {
        await prisma.partIssuance.create({
          data: { jobCardId: jc.id, sparePartId: is.partId, issuedById: advisor1.id, quantity: is.quantity, issuedAt: new Date(), notes: 'Issued for job card repair' },
        });
        issuanceCount++;
      }
    }
  }
  console.log(`✅ Seeded ${issuanceCount} part issuances (skipped existing)`);

  // Invoices for closed job cards
  let invNum = 1000;
  const closedCards = jobCards.filter(jc => jc.status === 'Closed');
  const invoices = [];
  for (const jc of closedCards) {
    const existing = await prisma.invoice.findFirst({ where: { jobCardId: jc.id } });
    if (existing) { invoices.push(existing); invNum++; continue; }
    const subtotal = jc.estimatedCost ?? 0;
    const tax      = Math.round(subtotal * 0.075);
    const total    = subtotal + tax;
    const inv = await prisma.invoice.create({
      data: {
        customerId: jc.customerId!,
        jobCardId:  jc.id,
        invoiceNumber: `INV-2026-${invNum++}`,
        issuedDate: new Date(),
        dueDate:    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        subtotal, tax, total,
        status: 'Paid',
        notes: 'Payment received in full',
      },
    });
    invoices.push(inv);
  }
  console.log(`✅ Seeded ${invoices.length} invoices (skipped existing)`);
  return invoices;
}

async function seedPaymentsAndReceipts(
  invoices:  { id: string; total: number }[],
  advisor1:  { id: string },
) {
  for (const inv of invoices) {
    const existingPayment = await prisma.payment.findFirst({ where: { invoiceId: inv.id } });
    if (existingPayment) continue;
    const payment = await prisma.payment.create({
      data: {
        invoiceId:    inv.id,
        recordedById: advisor1.id,
        amount:       inv.total,
        method:       'Bank Transfer',
        paymentDate:  new Date(),
        reference:    `TRF-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        notes:        'Full payment received',
      },
    });

    await prisma.receipt.create({
      data: {
        invoiceId:  inv.id,
        issuedById: advisor1.id,
        amount:     inv.total,
        issuedAt:   new Date(),
        reference:  `RCP-${payment.id.substring(0, 8).toUpperCase()}`,
        notes:      'Receipt issued to customer',
      },
    });
  }
  console.log(`✅ Seeded ${invoices.length} payments and ${invoices.length} receipts`);
}

// ─── main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌱 Starting full database seeding...\n');

  // 1. Branches
  const branches = await seedBranches();

  // 2. Permissions & Roles
  console.log('\nSeeding permissions and roles...');
  await seedPermissionsAndRoles();

  // 3. Staff users
  console.log('\nSeeding staff users...');
  const staffUsers = await seedStaffUsers(branches);

  // 4. Customers
  console.log('\nSeeding customers...');
  const customers = await seedCustomers();

  // 5. Vehicles
  console.log('\nSeeding vehicles...');
  const vehicles = await seedVehicles(customers);

  // 6. Spare parts
  console.log('\nSeeding spare parts...');
  const spareParts = await seedSpareParts();

  // 7. Appointments
  console.log('\nSeeding appointments...');
  const { appts } = await seedAppointmentsAndJobCards(branches, customers, vehicles, staffUsers, spareParts);

  // 8. Job cards
  console.log('\nSeeding job cards...');
  const { jobCards, oilPart, filterPart, brakePad, sparkPlug, advisor1 } =
    await seedJobCards(branches, customers, vehicles, appts, staffUsers, spareParts);

  // 9. Inspections & Estimates
  console.log('\nSeeding inspections and estimates...');
  const estimates = await seedInspectionsAndEstimates(jobCards, advisor1);

  // 10. Approvals, Part Issuances & Invoices
  console.log('\nSeeding approvals, part issuances and invoices...');
  const invoices = await seedApprovalsPartIssuancesAndInvoices(
    jobCards, estimates, advisor1, oilPart, filterPart, brakePad, sparkPlug,
  );

  // 11. Payments & Receipts
  console.log('\nSeeding payments and receipts...');
  await seedPaymentsAndReceipts(invoices, advisor1);

  console.log('\n🎉 Full database seeding complete!');
}

main()
  .catch((e) => { console.error('❌ Seeding failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
