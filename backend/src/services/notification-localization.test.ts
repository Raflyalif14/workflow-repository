import assert from 'node:assert/strict';
import { localizeNotificationText } from './notification-localization';

const original = { title: 'Milestone Submitted', message: "Milestone 'Design' for project 'Alpha' is waiting for review." };
assert.deepEqual(localizeNotificationText(original, {
  type: 'MILESTONE_SUBMITTED', projectName: 'Alpha', milestoneName: 'Design',
}, 'en'), original);
assert.deepEqual(localizeNotificationText(original, {
  type: 'MILESTONE_SUBMITTED', projectName: 'Alpha', milestoneName: 'Design',
}, 'id'), {
  title: 'Milestone Diajukan',
  message: "Milestone 'Design' pada proyek 'Alpha' menunggu peninjauan.",
});
assert.deepEqual(localizeNotificationText(original, { type: 'MILESTONE_SUBMITTED' }, 'id'), original);
console.log('Notification localization tests passed.');
