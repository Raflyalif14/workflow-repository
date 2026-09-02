import { Router } from 'express';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import projectRoutes from './project.routes';
import documentRoutes from './document.routes';
import dashboardRoutes from './dashboard.routes';
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
import approvalOverviewRoutes from './approval-overview.routes';
import notificationRoutes from './notification.routes';
import telegramWebhookRoutes from './telegram-webhook.routes';

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
router.use('/notifications', notificationRoutes);
router.use('/telegram', telegramWebhookRoutes);
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

// Dashboard Overview endpoints: /api/dashboard
router.use('/dashboard', dashboardRoutes);

router.use('/approvals', approvalOverviewRoutes);

export default router;
