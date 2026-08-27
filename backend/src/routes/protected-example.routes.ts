import { Router, Response } from 'express';
import { authenticateJwt, requireRoles, AuthenticatedRequest } from '../middlewares/auth.middleware';
import { sendSuccess } from '../utils/response.util';

const router = Router();

// ============================================================================
// CONTOH IMPLEMENTASI PROTECTED ROUTES BERDASARKAN ROLE
// ============================================================================

// 1. Endpoint Umum untuk Semua User yang Terautentikasi
router.get(
  '/profile',
  authenticateJwt,
  (req: AuthenticatedRequest, res: Response) => {
    sendSuccess(res, 'Akses berhasil untuk pengguna terautentikasi', {
      user: req.user,
      message: 'Semua role yang valid dapat mengakses endpoint ini.',
    });
  }
);

// 2. Khusus SUPER_ADMIN (e.g. Master Data & System Management)
router.get(
  '/admin/master-data',
  authenticateJwt,
  requireRoles(['SUPER_ADMIN']),
  (req: AuthenticatedRequest, res: Response) => {
    sendSuccess(res, 'Akses Master Data (Super Admin only)', {
      user: req.user,
      action: 'Manage templates, scenarios, holidays, and system users.',
    });
  }
);

// 3. Khusus SALES & SUPER_ADMIN (e.g. Create Project & Choose Scenario)
router.post(
  '/projects/create',
  authenticateJwt,
  requireRoles(['SUPER_ADMIN', 'SALES']),
  (req: AuthenticatedRequest, res: Response) => {
    sendSuccess(res, 'Project baru berhasil diinisiasi oleh Sales / Admin', {
      user: req.user,
      action: 'Initiate new client project and select workflow scenario.',
    });
  }
);

// 4. Khusus HEAD_SOLUTION_ARCHITECT & SUPER_ADMIN (e.g. Milestone Approval & Assignment)
router.post(
  '/milestones/approve',
  authenticateJwt,
  requireRoles(['SUPER_ADMIN', 'HEAD_SOLUTION_ARCHITECT']),
  (req: AuthenticatedRequest, res: Response) => {
    sendSuccess(res, 'Persetujuan Milestone oleh Head SA / Admin', {
      user: req.user,
      action: 'Approve or reject milestone deliverables and document versions.',
    });
  }
);

// 5. Khusus SOLUTION_ARCHITECT (e.g. Upload Delivery Document & Update Status)
router.post(
  '/milestones/submit-deliverable',
  authenticateJwt,
  requireRoles(['SUPER_ADMIN', 'SOLUTION_ARCHITECT', 'HEAD_SOLUTION_ARCHITECT']),
  (req: AuthenticatedRequest, res: Response) => {
    sendSuccess(res, 'Deliverable berhasil disubmit oleh Solution Architect', {
      user: req.user,
      action: 'Upload document version and change milestone status to WAITING_APPROVAL.',
    });
  }
);

export default router;
