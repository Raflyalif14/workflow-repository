export type NotificationLanguage = 'en' | 'id';

type NotificationText = { title: string; message: string };
type NotificationContext = {
  type: string;
  projectName?: string;
  milestoneName?: string;
};

export function localizeNotificationText(
  original: NotificationText,
  context: NotificationContext,
  language: NotificationLanguage
): NotificationText {
  if (language !== 'id') return original;

  const project = context.projectName;
  const milestone = context.milestoneName;
  switch (context.type) {
    case 'PROJECT_PLAN_SUBMITTED':
      return project ? { title: 'Rencana Proyek Diajukan', message: `Rencana proyek '${project}' menunggu peninjauan.` } : original;
    case 'PROJECT_PLAN_APPROVED':
      return project ? { title: 'Rencana Proyek Disetujui', message: `Rencana proyek '${project}' telah disetujui.` } : original;
    case 'PROJECT_PLAN_REJECTED':
      return project ? { title: 'Rencana Proyek Ditolak', message: `Rencana proyek '${project}' ditolak dan memerlukan revisi.` } : original;
    case 'PIC_ASSIGNED':
    case 'PIC_REASSIGNED': {
      if (!project) return original;
      const suffix = milestone ? ` untuk milestone '${milestone}'` : '';
      return {
        title: context.type === 'PIC_REASSIGNED' ? 'Pergantian PIC' : 'Penugasan PIC',
        message: `${context.type === 'PIC_REASSIGNED' ? 'Anda kini ditugaskan' : 'Anda telah ditugaskan'} sebagai PIC${suffix} pada proyek '${project}'.`,
      };
    }
    case 'MILESTONE_STARTED':
      return project && milestone ? { title: 'Milestone Sales Siap', message: `Milestone '${milestone}' pada proyek '${project}' siap Anda tindak lanjuti.` } : original;
    case 'MILESTONE_SUBMITTED':
      return project && milestone ? { title: 'Milestone Diajukan', message: `Milestone '${milestone}' pada proyek '${project}' menunggu peninjauan.` } : original;
    case 'MILESTONE_APPROVED':
      return project && milestone ? { title: 'Milestone Disetujui', message: `Milestone '${milestone}' pada proyek '${project}' telah disetujui.` } : original;
    case 'MILESTONE_REJECTED':
      return project && milestone ? { title: 'Milestone Ditolak', message: `Milestone '${milestone}' pada proyek '${project}' ditolak dan memerlukan revisi.` } : original;
    case 'DEADLINE_CHANGE_REQUESTED':
      return project && milestone ? { title: 'Perubahan Tenggat Diajukan', message: `Perubahan tenggat milestone '${milestone}' pada proyek '${project}' menunggu peninjauan.` } : original;
    case 'DEADLINE_CHANGE_APPROVED':
      return project && milestone ? { title: 'Perubahan Tenggat Disetujui', message: `Perubahan tenggat milestone '${milestone}' pada proyek '${project}' disetujui.` } : original;
    case 'DEADLINE_CHANGE_REJECTED':
      return project && milestone ? { title: 'Perubahan Tenggat Ditolak', message: `Perubahan tenggat milestone '${milestone}' pada proyek '${project}' ditolak.` } : original;
    case 'PROJECT_WAITING_RESULT':
      return project ? { title: 'Hasil Proyek Diperlukan', message: `Pekerjaan proyek '${project}' selesai. Catat hasil tender sebagai WON atau LOST.` } : original;
    default:
      return original;
  }
}
