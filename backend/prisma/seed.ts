import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding Workflow Repository Management System...');

  // 1. Seed Holidays for working day calculation
  const holidaysData = [
    { name: 'Tahun Baru Masehi', date: new Date('2026-01-01') },
    { name: 'Isra Miraj', date: new Date('2026-01-16') },
    { name: 'Tahun Baru Imlek', date: new Date('2026-02-17') },
    { name: 'Hari Suci Nyepi', date: new Date('2026-03-19') },
    { name: 'Hari Raya Idul Fitri', date: new Date('2026-03-20') },
    { name: 'Hari Raya Idul Fitri (Hari ke-2)', date: new Date('2026-03-21') },
    { name: 'Wafat Isa Almasih', date: new Date('2026-04-03') },
    { name: 'Hari Buruh Internasional', date: new Date('2026-05-01') },
    { name: 'Kenaikan Isa Almasih', date: new Date('2026-05-14') },
    { name: 'Hari Raya Waisak', date: new Date('2026-05-31') },
    { name: 'Hari Lahir Pancasila', date: new Date('2026-06-01') },
    { name: 'Hari Kemerdekaan RI', date: new Date('2026-08-17') },
    { name: 'Maulid Nabi Muhammad SAW', date: new Date('2026-08-25') },
    { name: 'Hari Raya Natal', date: new Date('2026-12-25') },
  ];

  for (const h of holidaysData) {
    await prisma.holiday.upsert({
      where: { date: h.date },
      update: { name: h.name },
      create: { name: h.name, date: h.date },
    });
  }
  console.log('✅ Holidays seeded');

  // 2. Seed Default Users
  const salt = await bcrypt.genSalt(10);
  const defaultPassword = await bcrypt.hash('Password123!', salt);

  const usersData = [
    {
      email: 'admin@company.com',
      username: 'admin',
      fullName: 'Super Administrator',
      role: UserRole.SUPER_ADMIN,
    },
    {
      email: 'sales@company.com',
      username: 'sales',
      fullName: 'Sales Executive',
      role: UserRole.SALES,
    },
    {
      email: 'head.sa@company.com',
      username: 'head_sa',
      fullName: 'Head Solution Architect',
      role: UserRole.HEAD_SOLUTION_ARCHITECT,
    },
    {
      email: 'sa1@company.com',
      username: 'sa_lead',
      fullName: 'Budi (Senior SA)',
      role: UserRole.SOLUTION_ARCHITECT,
    },
    {
      email: 'sa2@company.com',
      username: 'sa_infra',
      fullName: 'Dewi (Cloud SA)',
      role: UserRole.SOLUTION_ARCHITECT,
    },
  ];

  for (const u of usersData) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: { role: u.role, fullName: u.fullName },
      create: {
        email: u.email,
        username: u.username,
        fullName: u.fullName,
        passwordHash: defaultPassword,
        role: u.role,
      },
    });
  }
  console.log('✅ Users seeded');

  // 3. Seed Master Workflow Template
  const template = await prisma.workflowTemplate.upsert({
    where: { code: 'PRE-SALES-STANDARD' },
    update: {},
    create: {
      name: 'Pre-Sales Solution Architecture Pipeline',
      code: 'PRE-SALES-STANDARD',
      description: 'Standard end-to-end solution design and presales process.',
    },
  });

  // ----------------------------------------------------
  // Scenario 1: Existing TOR (11 Sequential Stages)
  // ----------------------------------------------------
  const existingTorScenario = await prisma.scenario.upsert({
    where: { code: 'EXISTING_TOR' },
    update: {
      name: 'Existing TOR',
      slaWorkingDays: 25,
    },
    create: {
      workflowTemplateId: template.id,
      name: 'Existing TOR',
      code: 'EXISTING_TOR',
      description: 'Standard fast-track pipeline for projects with existing Term of Reference (TOR).',
      slaWorkingDays: 25,
    },
  });

  const existingTorStages = [
    { name: 'Create Project', code: 'CREATE_PROJECT', orderIndex: 1, duration: 1, approval: false },
    { name: 'Set Deadline', code: 'SET_DEADLINE', orderIndex: 2, duration: 1, approval: true },
    { name: 'MoM (Minutes of Meeting)', code: 'MOM', orderIndex: 3, duration: 2, approval: true },
    { name: 'Handover Project to SA', code: 'HANDOVER', orderIndex: 4, duration: 1, approval: false },
    { name: 'Assign PIC', code: 'ASSIGN_PIC', orderIndex: 5, duration: 1, approval: false },
    { name: 'Requirement Gathering', code: 'REQUIREMENT', orderIndex: 6, duration: 3, approval: true },
    { name: 'Pain Point Analysis', code: 'PAIN_POINT', orderIndex: 7, duration: 2, approval: true },
    { name: 'Proposal Solution', code: 'PROPOSAL', orderIndex: 8, duration: 4, approval: true },
    { name: 'Deliverables', code: 'DELIVERABLES', orderIndex: 9, duration: 3, approval: true },
    { name: 'Technical Proposal & BOQ', code: 'BOQ', orderIndex: 10, duration: 3, approval: true },
    { name: 'Tender Process', code: 'TENDER', orderIndex: 11, duration: 4, approval: false },
  ];

  for (const s of existingTorStages) {
    const existing = await prisma.workflowStage.findFirst({
      where: { scenarioId: existingTorScenario.id, orderIndex: s.orderIndex },
    });
    if (existing) {
      await prisma.workflowStage.update({
        where: { id: existing.id },
        data: {
          name: s.name,
          code: s.code,
          defaultDurationDays: s.duration,
          requiresApproval: s.approval,
        },
      });
    } else {
      await prisma.workflowStage.create({
        data: {
          workflowTemplateId: template.id,
          scenarioId: existingTorScenario.id,
          name: s.name,
          code: s.code,
          orderIndex: s.orderIndex,
          defaultDurationDays: s.duration,
          requiresApproval: s.approval,
          approverRole: UserRole.HEAD_SOLUTION_ARCHITECT,
        },
      });
    }
  }
  console.log('✅ Scenario 1 (Existing TOR - 11 Stages) seeded');

  // ----------------------------------------------------
  // Scenario 2: Assessment (13 Sequential Stages)
  // ----------------------------------------------------
  const assessmentScenario = await prisma.scenario.upsert({
    where: { code: 'ASSESSMENT' },
    update: {
      name: 'Assessment',
      slaWorkingDays: 35,
    },
    create: {
      workflowTemplateId: template.id,
      name: 'Assessment',
      code: 'ASSESSMENT',
      description: 'Comprehensive pipeline with initial customer environment assessment and reporting.',
      slaWorkingDays: 35,
    },
  });

  const assessmentStages = [
    { name: 'Create Project', code: 'CREATE_PROJECT', orderIndex: 1, duration: 1, approval: false },
    { name: 'Set Deadline', code: 'SET_DEADLINE', orderIndex: 2, duration: 1, approval: true },
    { name: 'MoM (Minutes of Meeting)', code: 'MOM', orderIndex: 3, duration: 2, approval: true },
    { name: 'Handover Project to SA', code: 'HANDOVER', orderIndex: 4, duration: 1, approval: false },
    { name: 'Assign PIC', code: 'ASSIGN_PIC', orderIndex: 5, duration: 1, approval: false },
    { name: 'Assessment Customer', code: 'ASSESSMENT', orderIndex: 6, duration: 5, approval: true },
    { name: 'Assessment Report', code: 'ASSESSMENT_REPORT', orderIndex: 7, duration: 3, approval: true },
    { name: 'Requirement Gathering', code: 'REQUIREMENT', orderIndex: 8, duration: 3, approval: true },
    { name: 'Pain Point Analysis', code: 'PAIN_POINT', orderIndex: 9, duration: 2, approval: true },
    { name: 'Proposal Solution', code: 'PROPOSAL', orderIndex: 10, duration: 4, approval: true },
    { name: 'Deliverables', code: 'DELIVERABLES', orderIndex: 11, duration: 4, approval: true },
    { name: 'Technical Proposal & BOQ', code: 'BOQ', orderIndex: 12, duration: 4, approval: true },
    { name: 'Tender Process', code: 'TENDER', orderIndex: 13, duration: 4, approval: false },
  ];

  for (const s of assessmentStages) {
    const existing = await prisma.workflowStage.findFirst({
      where: { scenarioId: assessmentScenario.id, orderIndex: s.orderIndex },
    });
    if (existing) {
      await prisma.workflowStage.update({
        where: { id: existing.id },
        data: {
          name: s.name,
          code: s.code,
          defaultDurationDays: s.duration,
          requiresApproval: s.approval,
        },
      });
    } else {
      await prisma.workflowStage.create({
        data: {
          workflowTemplateId: template.id,
          scenarioId: assessmentScenario.id,
          name: s.name,
          code: s.code,
          orderIndex: s.orderIndex,
          defaultDurationDays: s.duration,
          requiresApproval: s.approval,
          approverRole: UserRole.HEAD_SOLUTION_ARCHITECT,
        },
      });
    }
  }
  console.log('✅ Scenario 2 (Assessment - 13 Stages) seeded');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
