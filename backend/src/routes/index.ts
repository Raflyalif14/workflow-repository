import { Router } from 'express';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import projectRoutes from './project.routes';
import documentRoutes from './document.routes';
import approvalRoutes from './approval-center.routes';
import dashboardRoutes from './dashboard.routes';
import assignmentRoutes from './assignment.routes';
import workflowEngineRoutes from './workflow-engine.routes';
import protectedExampleRoutes from './protected-example.routes';
import scenarioRoutes from './scenario.routes';
import workflowStageRoutes from './workflow-stage.routes';
import assignmentPhase5Routes from './assignment-phase5.routes';
import meRoutes from './me.routes';
import deadlineRoutes from './deadline.routes';
import milestoneRoutes from './milestone.routes';
import deadlineApprovalRoutes from './deadline-approval.routes';
import milestoneApprovalRoutes from './milestone-approval.routes';
import milestoneInitiationApprovalRoutes from './milestone-initiation-approval.routes';
import projectPlanApprovalRoutes from './project-plan-approval.routes';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Workflow Repository API',
  });
});

// Authentication endpoints: /api/auth/*
router.use('/auth', authRoutes);

// User Management endpoints: /api/users/* (Super Admin)
router.use('/users', userRoutes);
router.use('/scenarios', scenarioRoutes);
router.use('/workflow-stages', workflowStageRoutes);
router.use('/assignments', assignmentPhase5Routes);
router.use('/me', meRoutes);
router.use('/deadlines', deadlineRoutes);
router.use('/milestones', milestoneRoutes);
router.use('/deadline-approvals', deadlineApprovalRoutes);
router.use('/milestone-approvals', milestoneApprovalRoutes);
router.use('/milestone-initiation-approvals', milestoneInitiationApprovalRoutes);
router.use('/project-plan-approvals', projectPlanApprovalRoutes);

// Project Management endpoints: /api/projects/* (Sales & Team)
router.use('/projects', projectRoutes);

// Document Repository endpoints: /api/documents/*
router.use('/documents', documentRoutes);

// Approval Center endpoints: /api/approvals/* (Head SA & Super Admin)
router.use('/approvals', approvalRoutes);

// Dashboard Overview endpoints: /api/dashboard
router.use('/dashboard', dashboardRoutes);

// Assignment endpoints: /api/assignments/* (Head SA)
router.use('/assignments', assignmentRoutes);

// Dynamic Workflow Engine endpoints: /api/engine/*
router.use('/engine', workflowEngineRoutes);

// Protected Demo endpoints: /api/demo/*
router.use('/demo', protectedExampleRoutes);

export default router;
