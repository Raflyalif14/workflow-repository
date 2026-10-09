# Assigned milestone badge

Follow-up: [Assigned work classification and real browser verification](assigned-work-verification/README.md)
uses the same output metadata for the waiting KPI/tab and mixed-output row
indicator. The original badge validation below describes the preceding check.

## Diagnosis and meaning

Checked on `main / 1e6f772`, with the existing approval/PIC and other dirty
changes preserved. The badge is an actionable milestone count, not a count of
all active milestones or individual outputs.

`Sidebar` reads `useMyAssignedMilestones`, which calls
`GET /me/assigned-milestones`. Its shared action filter previously used only
project pause/status and milestone `IN_PROGRESS`/`REJECTED`. Output submission
does not complete the milestone: it remains in progress until selected outputs
are approved. Consequently a waiting-only milestone was still counted even
after a correct cache refresh.

## Change

The existing assigned endpoint now embeds only output `status`, `is_required`
and `is_selected`, through the existing milestone FK. The actor PIC filter and
the returned milestone list remain unchanged. No file content, feedback,
Storage paths or new endpoint is added.

For eligible milestones in ACTIVE, non-postponed projects, count one milestone
when at least one required/selected output is `TO_DO`, `DRAFT` or
`REVISION_REQUIRED`. `SUBMITTED`, `IN_REVIEW` and `APPROVED` alone do not count;
unselected optional outputs do not count. Legacy milestones without output
collections retain the previous milestone status rule. Completed milestones
remain excluded. The existing Needs action view uses the same shared filter;
All assigned still contains waiting milestones.

The sidebar tooltip uses existing English/Indonesian labels to explain the
action count. No completion, permission or workflow mutation is changed.

## Cache and verification

Existing submit and review hooks already invalidate
`assignmentKeys.myAssignedMilestones()`. No additional invalidation or polling
is necessary for this filter defect. The query retains `staleTime: 0` and focus
refetch. A separate SA session learns a Head SA review on its next existing
refetch/focus; mutation invalidation is local to the reviewing session, not a
cross-session push. AuthProvider retains its cache clear on account changes.

Focused validation passed:

- `assignment-phase5.service.test.ts`: actor PIC scope, denied role before
  reads, explicit safe output projection, waiting rows retained in the list.
- `assigned-milestone-ux.test.ts`: draft, submit/wait, returned revision,
  mixed outputs, optional/required selection, one count per milestone,
  postponed/final exclusion and legacy fallback. Real query/mutation hooks
  with intercepted synthetic HTTP prove submit/review invalidation and badge
  values `1 → 0 → 1` after refetch.
- `settings-navigation.test.tsx`: actual Sidebar component in English and
  Indonesian for SA and HEAD_SA, desktop/drawer links, waiting badge hidden,
  revision/mixed work badge shown and explanatory tooltip.
- Backend/frontend `tsc --noEmit`, strict UTF-8 and `git diff --check`.

No browser or live database request/mutation was used for this check. These
fixtures verify code behavior, not the reported live project's state or live
PostgREST schema cache. Run the updated backend and frontend together so the
assigned response includes the new metadata. No migration is required.

Files in this scoped change:

- `backend/src/services/assignment-phase5.service.ts`
- `backend/src/services/assignment-phase5.service.test.ts`
- `frontend/src/hooks/use-projects.ts`
- `frontend/src/lib/assigned-milestone-ux.ts`
- `frontend/src/lib/assigned-milestone-ux.test.ts`
- `frontend/src/components/app-shell.tsx`
- `frontend/src/lib/settings-navigation.test.tsx`
- `docs/sa-milestone-badge.md`
