# Phase 10A Workflow Simplification UAT and Regression Matrix

## Status legend

- PASS: verified by an automated or static check in this phase.
- FAIL: an automated or static check failed.
- NOT_RUN: intentionally not run in this phase.
- NEEDS_LIVE_VERIFY: requires a live Supabase environment, authenticated user, or browser session.

## Scope

Phase 10A replaces active per-milestone initiation approval with one initial project-plan approval. Historical initiation records remain readable, but their mutation endpoints are deprecated. This matrix does not cover Phase 10B, Phase 10C, or Phase 11.

| ID | Area | Role | Scenario | Expected result | Status |
| --- | --- | --- | --- | --- | --- |
| AUTH-01 | Authentication | All | Valid login and protected API access | Authenticated profile and role are available; unauthenticated protected requests return 401. | NEEDS_LIVE_VERIFY |
| PROJECT-01 | Project creation | SALES | Create a project with an active scenario | Project is DRAFT, Create Project is COMPLETED with completed_at, Set Deadline is IN_PROGRESS, and later stages are CREATED. | PASS |
| PROJECT-02 | Project creation | SALES | Create a project | PROJECT_CREATED activity uses project_id, user_id, action, and description. No milestone_initiation_approvals row is created. | PASS |
| PROJECT-03 | Project creation | Non-SALES | Try to create a project | Request is rejected server-side. | PASS |
| TIMELINE-01 | Initial timeline | SALES owner | Save one compact timeline payload while project is DRAFT | Executable milestones receive calculated start_date, duration_working_days, and due_date using working days and active holidays. | NEEDS_LIVE_VERIFY |
| TIMELINE-02 | Initial timeline | SALES owner | Save a partial or full timeline | Planning steps 1 and 2 cannot be edited through the executable timeline endpoint. Submission still requires all executable milestones to have a valid timeline. | PASS |
| TIMELINE-03 | Initial timeline | SALES owner | Save DRAFT timeline | No milestone deadline history or individual deadline approval is created for the initial plan. | PASS |
| TIMELINE-04 | Initial timeline | Other SALES or non-SALES | Edit another Sales project timeline | Request is rejected server-side. | PASS |
| PLAN-01 | Project plan | SALES owner | Submit a complete DRAFT timeline | One project_plan_approvals PENDING record is created; project remains DRAFT and Set Deadline remains IN_PROGRESS. | NEEDS_LIVE_VERIFY |
| PLAN-02 | Project plan | SALES owner | Submit again while a plan is pending | Request is rejected; the partial unique index also protects against duplicate pending rows. | PASS |
| PLAN-03 | Project plan | HEAD_SA | Reject a pending plan with a note | Approval becomes REJECTED; project remains DRAFT; Set Deadline remains IN_PROGRESS; SALES can edit and resubmit. | NEEDS_LIVE_VERIFY |
| PLAN-04 | Project plan | HEAD_SA | Approve a pending, valid plan | Approval becomes APPROVED; Set Deadline becomes COMPLETED; project becomes ACTIVE; the next eligible milestone starts automatically. | NEEDS_LIVE_VERIFY |
| PLAN-05 | Project plan | HEAD_SA | Review a non-pending plan | Request is rejected without a false success response. | PASS |
| PROGRESS-01 | Automatic progression | System | Complete a non-final milestone in an ACTIVE project | The next CREATED SALES or HEAD_SA stage becomes IN_PROGRESS and MILESTONE_STARTED is logged. | NEEDS_LIVE_VERIFY |
| PROGRESS-02 | Automatic progression | System | Complete a milestone before an SA stage without a PIC | Previous completion succeeds; the SA stage remains CREATED and waits for PIC assignment. | PASS |
| PROGRESS-03 | Manual fallback | Responsible actor | Start an eligible CREATED stage | POST /api/milestones/:milestoneId/start enforces ACTIVE project, completed previous stages, owner/role, and SA PIC requirements; it creates no initiation approval. | PASS |
| COMPLETE-01 | SALES stage | SALES owner | Mark an IN_PROGRESS SALES-owned stage complete | Stage becomes COMPLETED with completed_at; workflow advances automatically. | NEEDS_LIVE_VERIFY |
| COMPLETE-02 | HEAD_SA stage | HEAD_SA | Mark an IN_PROGRESS HEAD_SA-owned stage complete | Stage becomes COMPLETED with completed_at; workflow advances automatically. | NEEDS_LIVE_VERIFY |
| COMPLETE-03 | Assign PIC | HEAD_SA | Assign an eligible SA while Assign PIC is the active milestone | Assignment history is preserved; Assign PIC becomes COMPLETED; next eligible SA stage starts when PIC exists. | NEEDS_LIVE_VERIFY |
| COMPLETE-04 | Assign PIC | HEAD_SA | Assign a PIC before Assign PIC is active | Assignment does not complete an unrelated milestone. | PASS |
| SA-01 | SA submission | Assigned SA | Submit an IN_PROGRESS SA milestone | Milestone becomes SUBMITTED and milestone_approvals receives one PENDING row. | NEEDS_LIVE_VERIFY |
| SA-02 | SA submission | Other SA | Submit another SA's milestone | Request is rejected server-side. | PASS |
| SA-03 | SA review | HEAD_SA | Reject a submitted milestone with a note | Milestone becomes REJECTED; latest review remains historical evidence. | NEEDS_LIVE_VERIFY |
| SA-04 | SA revision | Assigned SA | Start revision and resubmit | REJECTED becomes IN_PROGRESS, then SUBMITTED, with a new PENDING submission approval. | NEEDS_LIVE_VERIFY |
| SA-05 | SA review | HEAD_SA | Approve the latest submitted milestone | Milestone becomes COMPLETED, completed_at is set, and automatic progression runs. | NEEDS_LIVE_VERIFY |
| DEADLINE-01 | Active deadline change | SALES owner | Request a deadline change for an ACTIVE project | Existing deadline-change approval flow creates one PENDING proposal; effective milestone deadline does not change yet. | NEEDS_LIVE_VERIFY |
| DEADLINE-02 | Active deadline change | HEAD_SA | Approve a pending deadline change | Effective milestone deadline updates only after approval. | NEEDS_LIVE_VERIFY |
| DEADLINE-03 | Active deadline change | HEAD_SA | Reject a pending deadline change | Rejected proposal remains historical context and the effective milestone deadline remains unchanged. | PASS |
| DEADLINE-04 | Draft deadline | SALES owner | Attempt legacy per-milestone deadline mutation while DRAFT | Request is rejected; DRAFT deadline edits must use the project timeline endpoint. | PASS |
| INIT-01 | Legacy compatibility | Any authenticated role | Read historical initiation approval or history | Historical records remain readable through GET endpoints. | NEEDS_LIVE_VERIFY |
| INIT-02 | Legacy compatibility | Any authenticated role | Call request-initiation-approval, initiation review mutation, or initiate mutation | Endpoint returns HTTP 410 with the safe retired-workflow message and cannot progress a milestone. | PASS |
| POSTPONE-01 | Postpone | SALES owner | Postpone an ACTIVE project with a reason | Project becomes POSTPONED with is_postponed=true and PROJECT_POSTPONED is logged; current milestone execution status does not change. | NEEDS_LIVE_VERIFY |
| POSTPONE-02 | Postpone | Workflow actors | Try start, complete, submit, revision, review, or deadline mutation while postponed | Normal workflow mutations are blocked with a safe conflict response. | PASS |
| RESUME-01 | Resume | SALES owner | Resume a POSTPONED project | Project returns to ACTIVE, PROJECT_RESUMED is logged, and the current milestone status and dates are unchanged. | NEEDS_LIVE_VERIFY |
| RESUME-02 | Resume | SALES owner | Resume a DRAFT, COMPLETED, or non-postponed project | Request is rejected. | PASS |
| FINAL-01 | Project completion | SALES owner | Complete final Tender Process stage | Final stage becomes COMPLETED; project becomes COMPLETED; PROJECT_COMPLETED is logged. | NEEDS_LIVE_VERIFY |
| FINAL-02 | Existing data | All | Read an existing project with historical APPROVED milestones or SUPERSEDED deadline proposals | COMPLETED and historical APPROVED statuses remain completed-equivalent; history remains readable without migration of old projects. | PASS |
| UI-01 | Project detail | SALES | DRAFT project detail | Compact Project Timeline supports one save action and Project Plan submission; initiation actions are absent. | NEEDS_LIVE_VERIFY |
| UI-02 | Project detail | HEAD_SA | Pending project plan detail | Project Plan review controls are present; approval/history context does not overwrite canonical milestone status or effective deadline. | NEEDS_LIVE_VERIFY |
| UI-03 | Project detail | Responsible actor | ACTIVE milestone actions | Cards show canonical CREATED, IN_PROGRESS, SUBMITTED, REJECTED, or COMPLETED state and only appropriate Start Stage, Mark Complete, Submit, Revision, or review actions. | NEEDS_LIVE_VERIFY |
| APPROVAL-01 | Approval Center | HEAD_SA | View pending approvals | Actionable categories are Project Plan, Deadline Change, and SA Submission. Historical initiation approvals are not counted as actionable work. | NEEDS_LIVE_VERIFY |
| DASH-01 | Dashboard | All scoped roles | View waiting approval KPI | Count includes pending project plans, active-project deadline changes, and SA submissions; it excludes initiation approvals. | PASS |
| DASH-02 | Dashboard | SA, SALES, HEAD_SA, SUPER_ADMIN | View scoped dashboard data | Project and approval scope remains role-aware, including zero-data states. | PASS |
| ACTIVITY-01 | Activity logs | All workflow mutations | Inspect a new Phase 10A activity row | Inserts use only the live activity_logs fields: project_id, user_id, action, and description. | PASS |
| CACHE-01 | Query cache | All | Perform a timeline, plan, assignment, stage, submission, or deadline mutation | Canonical project, milestone, approval, and dashboard query keys are invalidated so stale UI data is not retained. | PASS |
| SQL-01 | Database migration | Operator | Apply Phase 10A migration in Supabase SQL Editor | project_plan_approvals table and its partial one-PENDING-per-project index are created. | NEEDS_LIVE_VERIFY |

## Automated regression coverage

- backend/src/services/workflow-simplification.test.ts covers the 24 Phase 10A static business-rule checks: initial statuses, DRAFT timeline, active deadline-change exception, role-aware auto-start, completed-equivalent compatibility, SA review flow, route registration, migration index, retired initiation mutations, Assign PIC progression, and dashboard source selection.
- Existing regression files retained and updated for the revised behavior include milestone-created-status.test.ts, milestone-workflow-progression.test.ts, milestone-initiation.test.ts, dashboard.service.test.ts, and deadline-revised-flow.test.ts.
- Browser and live Supabase results intentionally remain NEEDS_LIVE_VERIFY until run with real role accounts and an applied migration.

## Required live test order

1. Run backend/supabase/phase10a-project-plan-approvals.sql manually in the Supabase SQL Editor.
2. Create a new SALES-owned project and confirm the DRAFT initial milestone states.
3. Save the complete timeline, submit it, reject once, edit it, resubmit, then approve it as HEAD_SA.
4. Complete each SALES and HEAD_SA stage, assign an SA during Assign PIC, and verify automatic next-stage behavior.
5. Run the SA submit, reject, revision, resubmit, and approval sequence.
6. Request, reject, and approve an ACTIVE deadline change; confirm effective deadline remains canonical until approval.
7. Postpone and resume the project; confirm mutations are blocked while postponed and dates do not shift on resume.
8. Complete the final Tender Process stage; confirm the project becomes COMPLETED.
9. Verify Project Detail, Approval Center, dashboard KPI, activity logs, and legacy initiation GET endpoints in the browser.

## Explicit non-goals

- No Phase 10B work.
- No Phase 10C work.
- No Phase 11 cleanup.
- Prisma, Docker, MinIO, schema.prisma, and historical milestone_initiation_approvals are retained.
