/* Seed script — creates demo users, sites, crews, tasks, attendance,
   notifications, invoices and payments for a realistic production-like dataset. */
import { PrismaClient, TaskStatus, TaskPriority } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const password = bcrypt.hashSync("password123", 10);

function daysAgo(n: number, h = 8, m = 0) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(h, m, 0, 0);
  return d;
}
function daysFromNow(n: number, h = 17, m = 0) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(h, m, 0, 0);
  return d;
}

async function main() {
  console.log("Seeding database...");

  // wipe in dependency order
  await prisma.activityLog.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.deployment.deleteMany();
  await prisma.taskAssignment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.siteMember.deleteMany();
  await prisma.crewMember.deleteMany();
  await prisma.crew.deleteMany();
  await prisma.site.deleteMany();
  await prisma.user.deleteMany();
  await prisma.appSetting.deleteMany();

  // ----- Users -----
  const admin = await prisma.user.create({
    data: {
      name: "Asha Verma",
      email: "admin@siteflow.com",
      phone: "+91 98100 10001",
      passwordHash: password,
      role: "ADMIN",
      jobTitle: "Operations Director",
      hourlyRate: 0,
    },
  });

  const mgr1 = await prisma.user.create({
    data: {
      name: "Rahul Mehta",
      email: "manager@siteflow.com",
      phone: "+91 98100 10002",
      passwordHash: password,
      role: "MANAGER",
      jobTitle: "Site Manager — North District",
      hourlyRate: 45,
    },
  });
  const mgr2 = await prisma.user.create({
    data: {
      name: "Priya Nair",
      email: "priya@siteflow.com",
      phone: "+91 98100 10003",
      passwordHash: password,
      role: "MANAGER",
      jobTitle: "Site Manager — Riverside",
      hourlyRate: 45,
    },
  });

  const workersData = [
    { name: "Vijay Kumar", email: "worker@siteflow.com", jobTitle: "Mason", hourlyRate: 18, phone: "+91 98100 20001" },
    { name: "Suresh Yadav", email: "suresh@siteflow.com", jobTitle: "Electrician", hourlyRate: 22, phone: "+91 98100 20002" },
    { name: "Anil Das", email: "anil@siteflow.com", jobTitle: "Plumber", hourlyRate: 20, phone: "+91 98100 20003" },
    { name: "Farhan Ali", email: "farhan@siteflow.com", jobTitle: "Crane Operator", hourlyRate: 26, phone: "+91 98100 20004" },
    { name: "Deepa Singh", email: "deepa@siteflow.com", jobTitle: "Welder", hourlyRate: 21, phone: "+91 98100 20005" },
    { name: "Manoj Patil", email: "manoj@siteflow.com", jobTitle: "Carpenter", hourlyRate: 19, phone: "+91 98100 20006" },
    { name: "Kiran Shah", email: "kiran@siteflow.com", jobTitle: "Painter", hourlyRate: 16, phone: "+91 98100 20007" },
    { name: "Ravi Bose", email: "ravi@siteflow.com", jobTitle: "General Laborer", hourlyRate: 12, phone: "+91 98100 20008" },
  ];
  const workers = [] as { id: string; name: string }[];
  for (const w of workersData) {
    const u = await prisma.user.create({
      data: { ...w, passwordHash: password, role: "EMPLOYEE", status: "ACTIVE" },
    });
    workers.push({ id: u.id, name: u.name });
  }

  // ----- Sites -----
  const sites = await Promise.all(
    (
      [
        {
          name: "Skyline Tower — Phase 2",
          code: "SKY-P2",
          address: "12 Marina Boulevard",
          city: "Mumbai",
          lat: 19.076,
          lng: 72.8777,
          budget: 2_400_000,
          managerId: mgr1.id,
          startDate: daysAgo(120),
          endDate: daysFromNow(200),
          description: "24-storey residential tower, structural works ongoing.",
        },
        {
          name: "Riverside Mall Extension",
          code: "RIV-EXT",
          address: "45 Riverbank Road",
          city: "Pune",
          lat: 18.5204,
          lng: 73.8567,
          budget: 1_100_000,
          managerId: mgr2.id,
          startDate: daysAgo(80),
          endDate: daysFromNow(120),
          description: "Retail wing extension — finishing stage.",
        },
        {
          name: "Green Valley Villas",
          code: "GV-V6",
          address: "Plot 6, Green Valley Enclave",
          city: "Bengaluru",
          lat: 12.9716,
          lng: 77.5946,
          budget: 800_000,
          managerId: mgr1.id,
          startDate: daysAgo(40),
          endDate: daysFromNow(300),
          description: "Six luxury villas, foundation and framing stage.",
        },
      ] as const
    ).map((s) =>
      prisma.site.create({
        data: {
          name: s.name,
          code: s.code,
          address: s.address,
          city: s.city,
          lat: s.lat,
          lng: s.lng,
          radiusM: 200,
          budget: s.budget,
          managerId: s.managerId,
          startDate: s.startDate,
          endDate: s.endDate,
          description: s.description,
        },
      })
    )
  );
  const [sky, riv, gv] = sites;

  // site memberships
  for (const w of workers) {
    await prisma.siteMember.create({ data: { siteId: sky.id, userId: w.id, role: "WORKER" } });
  }
  for (const w of workers.slice(0, 4)) {
    await prisma.siteMember.create({ data: { siteId: riv.id, userId: w.id, role: "WORKER" } });
  }
  for (const w of workers.slice(4)) {
    await prisma.siteMember.create({ data: { siteId: gv.id, userId: w.id, role: "WORKER" } });
  }

  // ----- Crews -----
  const crewMasonry = await prisma.crew.create({
    data: {
      name: "Masonry Crew A",
      skill: "Masonry",
      leaderId: workers[0].id,
      members: { create: [{ userId: workers[0].id }, { userId: workers[5].id }, { userId: workers[7].id }] },
    },
  });
  const crewMep = await prisma.crew.create({
    data: {
      name: "MEP Crew B",
      skill: "Electrical & Plumbing",
      leaderId: workers[1].id,
      members: { create: [{ userId: workers[1].id }, { userId: workers[2].id }] },
    },
  });
  const crewHeavy = await prisma.crew.create({
    data: {
      name: "Heavy Equipment Crew",
      skill: "Crane & Welding",
      leaderId: workers[3].id,
      members: { create: [{ userId: workers[3].id }, { userId: workers[4].id }] },
    },
  });

  // ----- Tasks -----
  type TaskSeed = {
    title: string;
    description: string;
    siteId: string;
    priority: TaskPriority;
    status: TaskStatus;
    start: Date;
    due: Date;
    estHours: number;
    progress: number;
    crewId?: string;
    assignees: string[];
    creatorId: string;
  };

  const taskSeeds: TaskSeed[] = [
    {
      title: "Pour concrete — 12th floor slab",
      description: "Coordinate pump truck, ensure curing compound applied after pour.",
      siteId: sky.id,
      priority: "HIGH",
      status: "IN_PROGRESS",
      start: daysAgo(2),
      due: daysFromNow(2),
      estHours: 32,
      progress: 60,
      crewId: crewMasonry.id,
      assignees: [workers[0].id, workers[5].id, workers[7].id],
      creatorId: mgr1.id,
    },
    {
      title: "Electrical conduit rough-in — wing A",
      description: "Follow revised layout drawing E-104 rev C.",
      siteId: sky.id,
      priority: "MEDIUM",
      status: "NOT_STARTED",
      start: daysFromNow(1),
      due: daysFromNow(8),
      estHours: 40,
      progress: 0,
      crewId: crewMep.id,
      assignees: [workers[1].id, workers[2].id],
      creatorId: mgr1.id,
    },
    {
      title: "Crane maintenance & safety inspection",
      description: "Quarterly inspection, replace wire rope on hoist 2.",
      siteId: sky.id,
      priority: "URGENT",
      status: "IN_PROGRESS",
      start: daysAgo(1),
      due: daysFromNow(1),
      estHours: 8,
      progress: 30,
      crewId: crewHeavy.id,
      assignees: [workers[3].id, workers[4].id],
      creatorId: mgr1.id,
    },
    {
      title: "Mall facade cladding — east elevation",
      description: "Install ACP panels per shop drawing FA-22.",
      siteId: riv.id,
      priority: "HIGH",
      status: "IN_PROGRESS",
      start: daysAgo(6),
      due: daysFromNow(4),
      estHours: 56,
      progress: 75,
      assignees: [workers[4].id, workers[6].id],
      creatorId: mgr2.id,
    },
    {
      title: "Parking area waterproofing",
      description: "Two-coat membrane, flood test after curing.",
      siteId: riv.id,
      priority: "MEDIUM",
      status: "COMPLETED",
      start: daysAgo(15),
      due: daysAgo(6),
      estHours: 24,
      progress: 100,
      assignees: [workers[2].id, workers[7].id],
      creatorId: mgr2.id,
    },
    {
      title: "Villa 3–4 foundation excavation",
      description: "Excavate to -2.4m, soil test before PCC.",
      siteId: gv.id,
      priority: "HIGH",
      status: "NOT_STARTED",
      start: daysFromNow(2),
      due: daysFromNow(10),
      estHours: 48,
      progress: 0,
      crewId: crewHeavy.id,
      assignees: [workers[3].id, workers[7].id],
      creatorId: mgr1.id,
    },
    {
      title: "Site fencing & gate installation",
      description: "Perimeter fence around villa plots 1–6.",
      siteId: gv.id,
      priority: "LOW",
      status: "COMPLETED",
      start: daysAgo(20),
      due: daysAgo(12),
      estHours: 30,
      progress: 100,
      assignees: [workers[5].id, workers[6].id],
      creatorId: mgr2.id,
    },
    {
      title: "Scaffolding erection — north shaft",
      description: "Per safety plan SP-09, inspect before use.",
      siteId: sky.id,
      priority: "MEDIUM",
      status: "COMPLETED",
      start: daysAgo(9),
      due: daysAgo(5),
      estHours: 20,
      progress: 100,
      assignees: [workers[0].id, workers[7].id],
      creatorId: mgr1.id,
    },
  ];

  const createdTasks = [] as { id: string; title: string; siteId: string; status: TaskStatus }[];
  for (const t of taskSeeds) {
    const task = await prisma.task.create({
      data: {
        title: t.title,
        description: t.description,
        siteId: t.siteId,
        status: t.status,
        priority: t.priority,
        startDate: t.start,
        dueDate: t.due,
        estimatedHours: t.estHours,
        progress: t.progress,
        completedAt: t.status === "COMPLETED" ? t.due : null,
        createdById: t.creatorId,
        crewId: t.crewId ?? null,
        assignments: {
          create: t.assignees.map((userId) => ({
            userId,
            status: t.status,
            progress: t.progress,
          })),
        },
      },
    });
    createdTasks.push({ id: task.id, title: task.title, siteId: task.siteId ?? "", status: task.status });
  }

  // ----- Attendance: last 14 days, random-ish -----
  const allWorkers = workers.map((w) => w.id);
  const shiftSites = [sky, riv, gv];
  for (let d = 14; d >= 1; d--) {
    for (let i = 0; i < allWorkers.length; i++) {
      if ((d + i) % 7 === 3) continue; // random days off
      const site = shiftSites[i % 3];
      const inH = 8 + ((i + d) % 3 === 0 ? 1 : 0); // some late arrivals
      const late = inH > 8;
      const checkIn = daysAgo(d, inH, (i * 7) % 50);
      const worked = 480 - ((i * 13) % 60);
      const checkOut = new Date(checkIn.getTime() + worked * 60_000);
      await prisma.attendance.create({
        data: {
          userId: allWorkers[i],
          siteId: site.id,
          checkInAt: checkIn,
          checkOutAt: checkOut,
          checkInLat: site.lat + 0.0002,
          checkInLng: site.lng + 0.0002,
          checkOutLat: site.lat + 0.0003,
          checkOutLng: site.lng + 0.0001,
          withinGeofence: true,
          workedMinutes: worked,
          status: late ? "LATE" : "PRESENT",
        },
      });
    }
  }

  // ----- Deployments (who is where right now / history) -----
  await prisma.deployment.create({
    data: { userId: workers[0].id, siteId: sky.id, taskId: createdTasks[0].id, startedAt: daysAgo(2), note: "Slab pour team" },
  });
  await prisma.deployment.create({
    data: { userId: workers[5].id, siteId: sky.id, taskId: createdTasks[0].id, startedAt: daysAgo(2) },
  });
  await prisma.deployment.create({
    data: { userId: workers[3].id, siteId: sky.id, taskId: createdTasks[2].id, startedAt: daysAgo(1) },
  });
  await prisma.deployment.create({
    data: { userId: workers[4].id, siteId: riv.id, taskId: createdTasks[3].id, startedAt: daysAgo(6), endedAt: daysAgo(1), note: "Cladding rotation" },
  });
  await prisma.deployment.create({
    data: { userId: workers[6].id, siteId: riv.id, taskId: createdTasks[3].id, startedAt: daysAgo(4) },
  });

  // ----- Notifications -----
  const notifs = [
    { userId: workers[0].id, title: "New task assigned", body: "Pour concrete — 12th floor slab at Skyline Tower — Phase 2", type: "TASK_ASSIGNED" as const, link: "/portal/my-day" },
    { userId: workers[3].id, title: "URGENT task assigned", body: "Crane maintenance & safety inspection — due tomorrow", type: "TASK_ASSIGNED" as const, link: "/portal/my-day" },
    { userId: workers[1].id, title: "Shift reminder", body: "Your shift at Skyline Tower starts tomorrow at 08:00", type: "REMINDER" as const, link: "/portal/my-day" },
    { userId: mgr1.id, title: "Task overdue", body: "Crane maintenance & safety inspection is past 60% expected progress", type: "SYSTEM" as const, link: "/portal/tasks" },
    { userId: admin.id, title: "Invoice payment received", body: "Invoice INV-2026-001 received a payment of $45,000", type: "SYSTEM" as const, link: "/portal/invoices" },
  ];
  for (const n of notifs) {
    await prisma.notification.create({ data: { ...n, createdAt: daysAgo(1, 9) } });
  }

  // ----- Invoices + items + payments -----
  const inv1 = await prisma.invoice.create({
    data: {
      number: "INV-2026-001",
      clientName: "Meridian Developers Ltd.",
      clientEmail: "accounts@meridiandevelopers.com",
      clientPhone: "+91 98000 30001",
      siteId: sky.id,
      status: "PARTIALLY_PAID",
      issueDate: daysAgo(20),
      dueDate: daysAgo(-10),
      taxPercent: 18,
      notes: "Milestone 4 billing — structural works up to 11th floor.",
      createdById: mgr1.id,
      items: {
        create: [
          { desc: "Structural concrete works — slab pours (m3)", qty: 420, unit: "m3", unitPrice: 180 },
          { desc: "Rebar fixing crew — man-days", qty: 160, unit: "day", unitPrice: 65 },
        ],
      },
    },
  });
  await prisma.payment.create({
    data: { invoiceId: inv1.id, amount: 45000, method: "BANK_TRANSFER", reference: "TRX-88213", paidAt: daysAgo(12), receivedBy: admin.name },
  });

  await prisma.invoice.create({
    data: {
      number: "INV-2026-002",
      clientName: "Riverside Retail Holdings",
      clientEmail: "finance@riversideretail.com",
      siteId: riv.id,
      status: "SENT",
      issueDate: daysAgo(8),
      dueDate: daysFromNow(22),
      taxPercent: 18,
      notes: "Facade cladding — east elevation progress billing.",
      createdById: mgr2.id,
      items: {
        create: [
          { desc: "ACP cladding installation (sqm)", qty: 850, unit: "sqm", unitPrice: 42 },
          { desc: "Sealant & accessories", qty: 1, unit: "lot", unitPrice: 3200 },
        ],
      },
    },
  });

  await prisma.invoice.create({
    data: {
      number: "INV-2026-003",
      clientName: "Green Valley Estates",
      clientEmail: "pm@greenvalleyestates.com",
      siteId: gv.id,
      status: "PAID",
      issueDate: daysAgo(30),
      dueDate: daysAgo(15),
      taxPercent: 18,
      notes: "Site fencing & gate installation — final.",
      createdById: mgr2.id,
      items: {
        create: [
          { desc: "Perimeter fencing (m)", qty: 320, unit: "m", unitPrice: 28 },
          { desc: "Security gate installation", qty: 2, unit: "unit", unitPrice: 900 },
        ],
      },
    },
  });
  // payments for INV-003
  const inv3 = await prisma.invoice.findUnique({ where: { number: "INV-2026-003" } });
  if (inv3) {
    await prisma.payment.create({
      data: { invoiceId: inv3.id, amount: 10944, method: "BANK_TRANSFER", reference: "TRX-88990", paidAt: daysAgo(16), receivedBy: admin.name },
    });
  }

  // ----- Nepal demo data: inventory, BOQ, PO, SO (all NPR, VAT 13%) -----
  const invData = [
    { code: "CEM-OPC-50", name: "Cement OPC 53 Grade", category: "Cement", unit: "bag", stockQty: 420, minStock: 100, lastPrice: 850 },
    { code: "REB-12MM", name: "Rebar TMT 12mm", category: "Steel", unit: "kg", stockQty: 3500, minStock: 1000, lastPrice: 118 },
    { code: "AGG-20MM", name: "Aggregate 20mm", category: "Aggregate", unit: "cu.m", stockQty: 60, minStock: 40, lastPrice: 3100 },
    { code: "SND-RIVER", name: "River Sand", category: "Aggregate", unit: "cu.m", stockQty: 35, minStock: 40, lastPrice: 4500 },
    { code: "ELW-PVC-25", name: "PVC Conduit 25mm", category: "Electrical", unit: "nos", stockQty: 180, minStock: 50, lastPrice: 210 },
    { code: "PMP-CPVC-1", name: "CPVC Pipe 1 inch", category: "Plumbing", unit: "m", stockQty: 240, minStock: 80, lastPrice: 320 },
    { code: "PNT-EXT-20", name: "Exterior Emulsion Paint 20L", category: "Paint", unit: "nos", stockQty: 18, minStock: 10, lastPrice: 7800 },
    { code: "BRK-STD", name: "Standard Bricks (class A)", category: "Masonry", unit: "nos", stockQty: 12000, minStock: 5000, lastPrice: 24 },
  ];
  const invItems: { id: string; name: string; unit: string; lastPrice: number }[] = [];
  for (const it of invData) {
    const row = await prisma.inventoryItem.create({ data: { ...it, avgCost: it.lastPrice } });
    invItems.push({ id: row.id, name: row.name, unit: row.unit, lastPrice: row.lastPrice });
  }

  // BOQ
  await prisma.boq.create({
    data: {
      ref: "BOQ-2026-001",
      title: "Skyline Tower Phase 2 — Structural works estimate",
      siteId: sky.id,
      currency: "NPR",
      status: "APPROVED",
      notes: "Rates as per Nepal PWD schedule 2082. Abstract of estimate — excludes VAT.",
      createdById: mgr1.id,
      items: {
        create: [
          { description: "Earthwork excavation in ordinary soil", unit: "cu.m", qty: 850, rate: 1250 },
          { description: "RCC 1:1.5:3 in columns & beams (incl. shuttering)", unit: "cu.m", qty: 640, rate: 21500 },
          { description: "Rebar TMT 500D supply & fixing", unit: "kg", qty: 48000, rate: 132 },
          { description: "Brick masonry 230mm in 1:4 cement mortar", unit: "cu.m", qty: 320, rate: 15800 },
          { description: "12mm cement plaster 1:4 both faces", unit: "sq.m", qty: 5600, rate: 1150 },
        ],
      },
    },
  });

  // Purchase Order
  const po = await prisma.purchaseOrder.create({
    data: {
      number: "PO-2026-001",
      vendorName: "Shivam Cement Distributors",
      vendorAddress: "Kalimati, Kathmandu",
      vendorPhone: "+977-9841000111",
      vendorVat: "302123456",
      siteId: sky.id,
      status: "APPROVED",
      orderDate: daysAgo(5),
      expectedDate: daysFromNow(3),
      taxPercent: 13,
      discountAmount: 5000,
      currency: "NPR",
      notes: "Payment: 50% advance, 50% on delivery. Please supply against this PO with VAT bill.",
      createdById: mgr1.id,
      items: {
        create: [
          { inventoryId: invItems[0].id, description: invItems[0].name, unit: "bag", qty: 300, unitPrice: 855 },
          { inventoryId: invItems[1].id, description: invItems[1].name, unit: "kg", qty: 2000, unitPrice: 121 },
        ],
      },
    },
  });
  void po;

  // Sales Order
  await prisma.salesOrder.create({
    data: {
      number: "SO-2026-001",
      customerName: "Meridian Developers Ltd.",
      customerAddress: "Durbar Marg, Kathmandu",
      customerPhone: "+977-9801222333",
      customerVat: "301987654",
      siteId: riv.id,
      status: "SUBMITTED",
      orderDate: daysAgo(2),
      deliveryDate: daysFromNow(5),
      taxPercent: 13,
      discountAmount: 0,
      currency: "NPR",
      notes: "Supply of surplus aggregates from RIV-EXT stockyard.",
      createdById: mgr2.id,
      items: {
        create: [
          { inventoryId: invItems[2].id, description: invItems[2].name, unit: "cu.m", qty: 25, unitPrice: 3600 },
          { inventoryId: invItems[3].id, description: invItems[3].name, unit: "cu.m", qty: 15, unitPrice: 5200 },
        ],
      },
    },
  });

  // ----- Settings -----
  await prisma.appSetting.createMany({
    data: [
      { key: "company.name", value: "BuildRight Constructions Pvt. Ltd." },
      { key: "company.email", value: "billing@buildright.example" },
      { key: "company.phone", value: "+977-1-4567890" },
      { key: "company.address", value: "Ward 10, Thamel, Kathmandu 44600, Nepal" },
      { key: "billing.defaultTaxPercent", value: "13" },
      { key: "billing.currency", value: "NPR" },
      { key: "notifications.reminderHours", value: "2" },
    ],
  });

  // ----- Activity log -----
  await prisma.activityLog.createMany({
    data: [
      { userId: mgr1.id, action: "TASK_CREATED", entity: "Task", entityId: createdTasks[0].id, detail: "Pour concrete — 12th floor slab", createdAt: daysAgo(2, 9) },
      { userId: admin.id, action: "PAYMENT_RECORDED", entity: "Invoice", entityId: inv1.id, detail: "$45,000 via BANK_TRANSFER", createdAt: daysAgo(12, 11) },
      { userId: mgr2.id, action: "INVOICE_SENT", entity: "Invoice", entityId: "INV-2026-002", detail: "Sent to Riverside Retail Holdings", createdAt: daysAgo(8, 10) },
    ],
  });

  console.log("Seed complete ✔");
  console.log("Logins (password: password123):");
  console.log("  admin@siteflow.com   → Admin");
  console.log("  manager@siteflow.com → Site Manager");
  console.log("  worker@siteflow.com  → Employee");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
