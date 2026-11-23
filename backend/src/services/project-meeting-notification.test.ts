import assert from 'node:assert/strict';
import { supabaseAdmin } from '../config/supabase';
import { CreateNotificationInput, NotificationService } from './notification.service';
import {
  notifyProjectMeetingAction,
  notifyMeetingMinutesSaved,
  buildMeetingNotification,
} from './project-meeting-notification.service';
import { localizeNotificationText } from './notification-localization';

const project = {
  id: 'project-123',
  name: 'Sistem Pengadaan Kapal',
  sales_id: 'sales-1',
  pic_id: 'sa-pic-1',
};

const meeting = {
  id: 'meeting-456',
  title: 'Kickoff & Sizing Rapat',
};

const originalFrom = supabaseAdmin.from;
const originalCreateNotification = NotificationService.createNotification;
const originalConsoleError = console.error;

async function run(): Promise<void> {
  try {
    const requestedNotifications: CreateNotificationInput[] = [];

    (NotificationService as any).createNotification = async (input: CreateNotificationInput) => {
      requestedNotifications.push(input);
      return {};
    };

    (supabaseAdmin as any).from = (table: string) => {
      assert.equal(table, 'users', 'Recipients must be queried from users table');
      const query: any = {
        select: () => query,
        eq: () => query,
        then: (resolve: (v: any) => any, reject: (err: any) => any) =>
          Promise.resolve({
            data: [{ id: 'headsa-1' }, { id: 'headsa-2' }],
            error: null,
          }).then(resolve, reject),
      };
      return query;
    };

    // Test 1: CREATE meeting -> Notifies all active HEAD_SA, excludes creator
    requestedNotifications.length = 0;
    await notifyProjectMeetingAction({
      project,
      meeting,
      action: 'CREATE',
      actorUserId: 'sales-1',
    });
    assert.equal(requestedNotifications.length, 2, 'Must notify 2 active Head SAs');
    assert(
      requestedNotifications.every(
        (n) =>
          n.type === 'MEETING_REQUESTED' &&
          n.actionUrl === '/projects/project-123#project-meetings' &&
          n.meetingTitle === 'Kickoff & Sizing Rapat' &&
          n.projectName === 'Sistem Pengadaan Kapal'
      ),
      'Notification payload must match meeting details'
    );
    assert(!requestedNotifications.some((n) => n.userId === 'sales-1'), 'Actor must not be notified');
    console.log('PASS Test 1: CREATE meeting notifies active Head SAs');

    // Test 2: APPROVE meeting -> Notifies Sales and PIC SA, excludes Head SA actor
    requestedNotifications.length = 0;
    await notifyProjectMeetingAction({
      project,
      meeting,
      action: 'APPROVE',
      actorUserId: 'headsa-1',
    });
    assert.equal(requestedNotifications.length, 2, 'Must notify Sales and PIC SA');
    assert(requestedNotifications.some((n) => n.userId === 'sales-1'));
    assert(requestedNotifications.some((n) => n.userId === 'sa-pic-1'));
    assert(requestedNotifications.every((n) => n.type === 'MEETING_APPROVED'));
    console.log('PASS Test 2: APPROVE meeting notifies Sales and PIC SA');

    // Test 3: REJECT meeting -> Notifies Sales
    requestedNotifications.length = 0;
    await notifyProjectMeetingAction({
      project,
      meeting,
      action: 'REJECT',
      actorUserId: 'headsa-1',
    });
    assert.equal(requestedNotifications.length, 1, 'Must notify Sales');
    assert.equal(requestedNotifications[0].userId, 'sales-1');
    assert.equal(requestedNotifications[0].type, 'MEETING_REJECTED');
    console.log('PASS Test 3: REJECT meeting notifies Sales');

    // Test 4: RESCHEDULE -> Notifies Head SAs
    requestedNotifications.length = 0;
    await notifyProjectMeetingAction({
      project,
      meeting,
      action: 'RESCHEDULE',
      actorUserId: 'sales-1',
    });
    assert.equal(requestedNotifications.length, 2);
    assert(requestedNotifications.every((n) => n.type === 'MEETING_RESCHEDULE'));
    console.log('PASS Test 4: RESCHEDULE meeting notifies Head SAs');

    // Test 5: APPROVE_RESCHEDULE -> Notifies Sales and PIC SA
    requestedNotifications.length = 0;
    await notifyProjectMeetingAction({
      project,
      meeting,
      action: 'APPROVE_RESCHEDULE',
      actorUserId: 'headsa-1',
    });
    assert.equal(requestedNotifications.length, 2);
    assert(requestedNotifications.every((n) => n.type === 'MEETING_APPROVE_RESCHEDULE'));
    console.log('PASS Test 5: APPROVE_RESCHEDULE notifies Sales and PIC SA');

    // Test 6: CANCEL -> Notifies other parties
    requestedNotifications.length = 0;
    await notifyProjectMeetingAction({
      project,
      meeting,
      action: 'CANCEL',
      actorUserId: 'sales-1',
    });
    assert(requestedNotifications.length >= 2);
    assert(requestedNotifications.every((n) => n.type === 'MEETING_CANCELLED'));
    assert(!requestedNotifications.some((n) => n.userId === 'sales-1'));
    console.log('PASS Test 6: CANCEL meeting notifies other parties');

    // Test 7: MINUTES_SAVED -> Notifies other stakeholders
    requestedNotifications.length = 0;
    await notifyMeetingMinutesSaved({
      project,
      meeting,
      actorUserId: 'sa-pic-1',
    });
    assert(requestedNotifications.length >= 2);
    assert(requestedNotifications.every((n) => n.type === 'MEETING_MINUTES_SAVED'));
    assert(!requestedNotifications.some((n) => n.userId === 'sa-pic-1'));
    console.log('PASS Test 7: MINUTES_SAVED notifies other stakeholders');

    // Test 8: Failure resilience (best effort)
    let failureLogged = false;
    (NotificationService as any).createNotification = async () => {
      throw new Error('Database down');
    };
    console.error = (...args: unknown[]) => {
      failureLogged = String(args[0]).includes('[NotificationDispatch]');
    };
    await notifyProjectMeetingAction({
      project,
      meeting,
      action: 'CREATE',
      actorUserId: 'sales-1',
    });
    assert(failureLogged, 'Failure must be caught and logged best-effort');
    console.log('PASS Test 8: Meeting notification runs best-effort without throwing');

    // Test 9: Indonesian Localization
    const notif = buildMeetingNotification('u1', project, meeting, 'CREATE');
    const localized = localizeNotificationText(
      { title: notif.title, message: notif.message },
      { type: notif.type, projectName: notif.projectName, meetingTitle: notif.meetingTitle },
      'id'
    );
    assert.equal(localized.title, 'Pengajuan Rapat Proyek');
    assert.equal(
      localized.message,
      "Pengajuan rapat 'Kickoff & Sizing Rapat' pada proyek 'Sistem Pengadaan Kapal' menunggu peninjauan."
    );

    const approvedNotif = buildMeetingNotification('u1', project, meeting, 'APPROVE');
    const localizedApproved = localizeNotificationText(
      { title: approvedNotif.title, message: approvedNotif.message },
      { type: approvedNotif.type, projectName: approvedNotif.projectName, meetingTitle: approvedNotif.meetingTitle },
      'id'
    );
    assert.equal(localizedApproved.title, 'Rapat Proyek Disetujui');
    assert.equal(
      localizedApproved.message,
      "Rapat 'Kickoff & Sizing Rapat' pada proyek 'Sistem Pengadaan Kapal' telah disetujui."
    );
    console.log('PASS Test 9: Indonesian notification localization is accurate');
  } finally {
    (supabaseAdmin as any).from = originalFrom;
    (NotificationService as any).createNotification = originalCreateNotification;
    console.error = originalConsoleError;
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
