"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
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
    const salt = await bcryptjs_1.default.genSalt(10);
    const defaultPassword = await bcryptjs_1.default.hash('Password123!', salt);
    const usersData = [
        {
            email: 'admin@company.com',
            username: 'admin',
            fullName: 'Super Administrator',
            role: client_1.UserRole.SUPER_ADMIN,
        },
        {
            email: 'sales@company.com',
            username: 'sales',
            fullName: 'Sales Executive',
            role: client_1.UserRole.SALES,
        },
        {
            email: 'head.sa@company.com',
            username: 'head_sa',
            fullName: 'Head Solution Architect',
            role: client_1.UserRole.HEAD_SOLUTION_ARCHITECT,
        },
        {
            email: 'sa1@company.com',
            username: 'sa_lead',
            fullName: 'Budi (Senior SA)',
            role: client_1.UserRole.SOLUTION_ARCHITECT,
        },
        {
            email: 'sa2@company.com',
            username: 'sa_infra',
            fullName: 'Dewi (Cloud SA)',
            role: client_1.UserRole.SOLUTION_ARCHITECT,
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
    // Scenario 1: Existing TOR (9 Sequential Stages)
    // ----------------------------------------------------
    const existingTorScenario = await prisma.scenario.upsert({
        where: { code: 'EXISTING_TOR' },
        update: {
            name: 'Existing TOR',
            slaWorkingDays: 20,
        },
        create: {
            workflowTemplateId: template.id,
            name: 'Existing TOR',
            code: 'EXISTING_TOR',
            description: 'Standard fast-track pipeline for projects with existing Term of Reference (TOR).',
            slaWorkingDays: 20,
        },
    });
    const existingTorStages = [
        { name: 'Create Project', code: 'CREATE_PROJECT', orderIndex: 1, duration: 1, approval: false },
        { name: 'MoM (Minutes of Meeting)', code: 'MOM', orderIndex: 2, duration: 2, approval: false },
        { name: 'Handover', code: 'HANDOVER', orderIndex: 3, duration: 1, approval: true },
        { name: 'Assign PIC', code: 'ASSIGN_PIC', orderIndex: 4, duration: 1, approval: true },
        { name: 'Requirement', code: 'REQUIREMENT', orderIndex: 5, duration: 3, approval: false },
        { name: 'Pain Point', code: 'PAIN_POINT', orderIndex: 6, duration: 2, approval: false },
        { name: 'Proposal', code: 'PROPOSAL', orderIndex: 7, duration: 4, approval: true },
        { name: 'Deliverables', code: 'DELIVERABLES', orderIndex: 8, duration: 3, approval: true },
        { name: 'BOQ (Bill of Quantity)', code: 'BOQ', orderIndex: 9, duration: 3, approval: true },
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
        }
        else {
            await prisma.workflowStage.create({
                data: {
                    workflowTemplateId: template.id,
                    scenarioId: existingTorScenario.id,
                    name: s.name,
                    code: s.code,
                    orderIndex: s.orderIndex,
                    defaultDurationDays: s.duration,
                    requiresApproval: s.approval,
                    approverRole: client_1.UserRole.HEAD_SOLUTION_ARCHITECT,
                },
            });
        }
    }
    console.log('✅ Scenario 1 (Existing TOR - 9 Stages) seeded');
    // ----------------------------------------------------
    // Scenario 2: Assessment (11 Sequential Stages)
    // ----------------------------------------------------
    const assessmentScenario = await prisma.scenario.upsert({
        where: { code: 'ASSESSMENT' },
        update: {
            name: 'Assessment',
            slaWorkingDays: 30,
        },
        create: {
            workflowTemplateId: template.id,
            name: 'Assessment',
            code: 'ASSESSMENT',
            description: 'Comprehensive pipeline with initial customer environment assessment and reporting.',
            slaWorkingDays: 30,
        },
    });
    const assessmentStages = [
        { name: 'Create Project', code: 'CREATE_PROJECT', orderIndex: 1, duration: 1, approval: false },
        { name: 'MoM (Minutes of Meeting)', code: 'MOM', orderIndex: 2, duration: 2, approval: false },
        { name: 'Handover', code: 'HANDOVER', orderIndex: 3, duration: 1, approval: true },
        { name: 'Assign PIC', code: 'ASSIGN_PIC', orderIndex: 4, duration: 1, approval: true },
        { name: 'Assessment', code: 'ASSESSMENT', orderIndex: 5, duration: 5, approval: false },
        { name: 'Assessment Report', code: 'ASSESSMENT_REPORT', orderIndex: 6, duration: 3, approval: true },
        { name: 'Requirement', code: 'REQUIREMENT', orderIndex: 7, duration: 3, approval: false },
        { name: 'Pain Point', code: 'PAIN_POINT', orderIndex: 8, duration: 2, approval: false },
        { name: 'Proposal', code: 'PROPOSAL', orderIndex: 9, duration: 4, approval: true },
        { name: 'Deliverables', code: 'DELIVERABLES', orderIndex: 10, duration: 4, approval: true },
        { name: 'BOQ (Bill of Quantity)', code: 'BOQ', orderIndex: 11, duration: 4, approval: true },
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
        }
        else {
            await prisma.workflowStage.create({
                data: {
                    workflowTemplateId: template.id,
                    scenarioId: assessmentScenario.id,
                    name: s.name,
                    code: s.code,
                    orderIndex: s.orderIndex,
                    defaultDurationDays: s.duration,
                    requiresApproval: s.approval,
                    approverRole: client_1.UserRole.HEAD_SOLUTION_ARCHITECT,
                },
            });
        }
    }
    console.log('✅ Scenario 2 (Assessment - 11 Stages) seeded');
}
main()
    .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map