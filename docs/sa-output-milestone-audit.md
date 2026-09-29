# SA output milestone audit (2026-09-29)

Baseline: `main` at `44e0ba3678ceaf40b53387bea280c33017572de8`. Worktree already contains unrelated auth, notification, and frontend localization edits; preserve them. Latest available migration: `phase17-user-language-preference.sql` (application not verified).

Operational V2 stage sequence comes from Phase 11g/11j, carried into canonical Pra-Tender / On Submission Tender scenarios by Phase 12. Pra-Tender: Customer Assessment (SA), Assessment Report (SA), Requirement Gathering (SA), Pain Point Analysis (SA), Proposal Solution (SA), Deliverables (SA), Technical Proposal & BOQ (SA), Tender Process (Sales). On Submission Tender: Requirement Gathering (SA), Pain Point Analysis (SA), Proposal Solution (SA), Deliverables (SA), Technical Proposal & BOQ (SA), Tender Process (Sales). Project plan, PIC assignment and final Sales outcome have separate gates.

Current duplicate: `POST /milestones/:id/submit` writes `milestone_submission_packages`, attachments and `milestone_approvals`; Head SA review is via approval route. Independently, project Output Documents writes `project_output_documents` and `project_output_document_versions`, with per-file review and signed downloads. The former drives milestone progression, while the latter gates final result. Frontend has separate submission dialog/history/review plus a project-level Output Documents section. Dashboard counts `milestone_approvals`. Search and Documents already expose output files; deletion collects both stores.

Target identity: immutable stage keys assigned to `workflow_stages`, copied by FK through `project_milestones`, with each output row bound to the milestone ID at project creation. Never infer association from mutable stage name. Stage mappings are defined in `backend/src/constants/scenarios.ts`. Stages with zero selected outputs receive a PIC completion action without an upload or second review. Sales milestones remain separate.

| Scenario | SA stage key | Output keys |
| --- | --- | --- |
| Pra-Tender | CUSTOMER_ASSESSMENT | none |
| Pra-Tender | ASSESSMENT_REPORT | assessment (optional) |
| Pra-Tender | REQUIREMENT_GATHERING | kak_rfp, analisa_kebutuhan, operational_requirement (optional) |
| Pra-Tender | PAIN_POINT_ANALYSIS | kajian_teknis (optional) |
| Pra-Tender | PROPOSAL_SOLUTION | proposal_deck_solusi (required), metodologi_implementasi, arsitektur_sistem (optional) |
| Pra-Tender | DELIVERABLES | poc_demo, rencana_distribusi, poc_demo_report (optional); identitas_barang_produk (required) |
| Pra-Tender | TECHNICAL_PROPOSAL_BOQ | timeline_proyek, proposal_teknis, spesifikasi_teknis_toc (required); rab, spesifikasi_teknis (optional) |
| On Submission Tender | REQUIREMENT_GATHERING, PAIN_POINT_ANALYSIS | none |
| On Submission Tender | PROPOSAL_SOLUTION | metodologi_implementasi, arsitektur_sistem (optional) |
| On Submission Tender | DELIVERABLES | identitas_barang_produk (required), poc_demo_report (optional) |
| On Submission Tender | TECHNICAL_PROPOSAL_BOQ | proposal_teknis, timeline_proyek, spesifikasi_teknis_toc (required) |

Pra-Tender includes the On Submission Tender checklist. Both scenarios end with Sales TENDER_PROCESS, which has no SA output mapping. Optional outputs omitted by Sales are excluded from their stage completion gate.

Retirement candidates: submission package controller/service/review service, submission and attachment routes, `useSubmitMilestone`/package hooks, submission dialog/history/review components and approval category, `milestone_submission_packages`, `milestone_submission_attachments`, and SA-only `milestone_approvals` rows. Preserve milestone contributions, Sales documents, deadline/plan approval, official Documents and project records.

Rollout: apply Phase 18a, deploy the backend and frontend together, stop all old backend instances, save results from `phase18-preflight.sql`, then apply Phase 18b and run `phase18-verify.sql`. Phase 18b is deliberately after application replacement because it drops the old submission tables. Review every `storage_path` returned by preflight; delete only exact paths with `safe_to_delete_after_migration = true` after Phase 18b, never by prefix. No migration or Storage cleanup was executed in this worktree.

Verification boundary: backend and frontend TypeScript checks and `git diff --check` passed. Targeted backend tests passed after updating fixtures. Frontend runtime tests remain unrun because `tsx` is absent locally and the offline npm cache cannot resolve it. Live Supabase data counts, migration execution, signed download, browser review, and end-to-end progression remain for deployment/UAT.
