import { selectMilestones } from './milestone.service';

const requiredFields = [
  'start_date',
  'duration_working_days',
  'due_date',
  'completed_at',
];

for (const field of requiredFields) {
  if (!selectMilestones.includes(field)) {
    throw new Error(`Milestone read model missing ${field}`);
  }
}

console.log('Milestone read model includes effective deadline fields and completed_at');
