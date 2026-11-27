import assert from "node:assert/strict";
import React, { isValidElement, type ReactNode } from "react";
import * as authHooks from "../components/auth/auth-provider";
import * as scopeHooks from "../hooks/use-scope-changes";
import * as outputHooks from "../hooks/use-output-documents";
import * as languageProvider from "../components/i18n/language-provider";
import { ProjectScopeChanges } from "../components/projects/project-scope-changes";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { setActiveLanguage, translate } from "../i18n";
import type { Project } from "@/types/project";

type Element = React.ReactElement<any>;
const elements = (node: ReactNode): Element[] => {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  const el = node as Element;
  if (typeof el.type === "function") {
    try {
      return [el, ...elements((el.type as any)(el.props))];
    } catch {
      return [el, ...elements(el.props.children)];
    }
  }
  if (typeof el.type === "object" && el.type && typeof (el.type as any).render === "function") {
    try {
      return [el, ...elements((el.type as any).render(el.props, (el as any).ref))];
    } catch {
      return [el, ...elements(el.props.children)];
    }
  }
  return [el, ...elements(el.props.children)];
};

async function run() {
  const originals = {
    state: React.useState,
    ref: React.useRef,
    effect: React.useEffect,
    auth: authHooks.useAuth,
    scopeChanges: scopeHooks.useScopeChanges,
    scopeChangeMutation: scopeHooks.useScopeChangeMutation,
    outputDocs: outputHooks.useOutputDocuments,
    language: languageProvider.useLanguage,
  };

  let slots: any[] = [];
  let cursor = 0;
  let dirty = false;
  let effects: Array<() => void> = [];

  const reset = () => {
    slots = [];
  };

  (React as any).useState = (initial: any) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
    return [
      slots[index],
      (next: any) => {
        const value = typeof next === "function" ? next(slots[index]) : next;
        if (!Object.is(value, slots[index])) {
          slots[index] = value;
          dirty = true;
        }
      },
    ];
  };

  (React as any).useRef = (initial: any) => slots[cursor++] ??= { current: initial };
  (React as any).useEffect = (effect: () => void, deps: unknown[]) => {
    const index = cursor++;
    if (!slots[index] || deps?.some((value, at) => !Object.is(value, slots[index][at]))) {
      slots[index] = deps;
      effects.push(effect);
    }
  };

  const render = (component: () => Element): Element[] => {
    for (let attempt = 0; attempt < 10; attempt++) {
      cursor = 0;
      dirty = false;
      effects = [];
      const tree = component();
      effects.forEach((effect) => effect());
      if (!dirty) return elements(tree);
    }
    throw new Error("Component did not settle");
  };

  (languageProvider as any).useLanguage = () => ({
    t: translate,
    formatDate: (val: string) => val,
  });

  const project: Project = {
    id: "proj-101",
    name: "Tender Project Alpha",
    customer: "Kementerian BUMN",
    status: "ACTIVE",
    is_postponed: false,
    sales_id: "sales-user-1",
    pic_id: "sa-pic-1",
    active_phase_id: "phase-pra-tender",
    phases: [
      {
        id: "phase-pra-tender",
        project_id: "proj-101",
        scenario_id: "scen-pra",
        phase_key: "PRA_TENDER",
        status: "ACTIVE",
      },
    ],
    updated_at: "2026-11-19T10:00:00.000Z",
  } as unknown as Project;

  const milestones = [
    {
      id: "m-solusi",
      name: "Proposal / Solution Deck",
      status: "IN_PROGRESS",
      workflow_stage: { stage_key: "PROPOSAL_SOLUTION" },
    },
    {
      id: "m-kajian",
      name: "Kajian Teknis",
      status: "CREATED",
      workflow_stage: { stage_key: "PAIN_POINT_ANALYSIS" },
    },
    {
      id: "m-poc",
      name: "POC / Demo",
      status: "IN_PROGRESS", // Started work: must be protected from removal
      workflow_stage: { stage_key: "DELIVERABLES" },
    },
  ];

  const scopeCatalog = [
    {
      key: "proposal_deck_solusi",
      name: "Proposal / Solution Deck",
      group: "PRA_TENDER",
      milestoneId: "m-solusi",
      isRequired: true,
      isSelected: true,
      protected: true,
      status: "IN_PROGRESS" as const,
    },
    {
      key: "kajian_teknis",
      name: "Kajian Teknis",
      group: "PRA_TENDER",
      milestoneId: "m-kajian",
      isRequired: false,
      isSelected: true,
      protected: false, // Unstarted: status is CREATED, can be removed
      status: "TO_DO" as const,
    },
    {
      key: "poc_demo",
      name: "POC / Demo",
      group: "PRA_TENDER",
      milestoneId: "m-poc",
      isRequired: false,
      isSelected: true,
      protected: true, // Started work: cannot be removed
      status: "IN_PROGRESS" as const,
    },
    {
      key: "spesifikasi_teknis",
      name: "Spesifikasi Teknis",
      group: "PRA_TENDER",
      milestoneId: "",
      isRequired: false,
      isSelected: false, // Not yet selected: can be added
      protected: false,
      status: "TO_DO" as const,
    },
  ];

  let currentUser = {
    id: "sales-user-1",
    role: "SALES",
    fullName: "Sales Executive",
  };

  let scopeChangesList: scopeHooks.ScopeChange[] = [];
  const mutations: Array<{ changeId?: string; body: any }> = [];

  (authHooks as any).useAuth = () => ({ user: currentUser });
  (scopeHooks as any).useScopeChanges = (projectId: string) => {
    assert.equal(projectId, "proj-101");
    return { data: scopeChangesList, isLoading: false, isError: false, refetch: () => {} };
  };

  (scopeHooks as any).useScopeChangeMutation = (projectId: string) => {
    assert.equal(projectId, "proj-101");
    return {
      isPending: false,
      mutateAsync: async (args: { changeId?: string; body: any }) => {
        mutations.push(args);
        return { success: true };
      },
    };
  };

  (outputHooks as any).useOutputDocuments = (projectId: string) => {
    assert.equal(projectId, "proj-101");
    return {
      data: {
        scenarioKey: "PRA_TENDER",
        scopeCatalog,
        documents: scopeCatalog,
      },
      isLoading: false,
      isError: false,
      refetch: () => {},
    };
  };

  try {
    for (const locale of ["en", "id"] as const) {
      setActiveLanguage(locale);
      reset();
      mutations.length = 0;
      scopeChangesList = [];

      // 1. Initial render as SALES owner
      currentUser = { id: "sales-user-1", role: "SALES", fullName: "Sales Executive" };
      const view = () => render(() => <ProjectScopeChanges project={project} milestones={milestones} />);
      let tree = view();

      // Verify section heading and description
      assert(tree.some((n) => n.props.children === translate("planChange.title")));
      assert(tree.some((n) => n.props.children === translate("planChange.help")));

      // Find "Manage Output Documents" / "Request" button
      const requestButton = tree.find(
        (n) => n.type === Button && n.props.children === translate("planChange.request")
      );
      assert(requestButton, "Sales owner sees Request button");

      // 2. Open Dialog and verify checkbox states (Required vs Optional vs Protected)
      requestButton.props.onClick();
      tree = view();

      // proposal_deck_solusi is mandatory -> MUST be disabled
      const mandatoryCheckbox = tree.find((n) => n.type === "input" && n.props.id === "scope-doc-proposal_deck_solusi");
      assert(mandatoryCheckbox, "Mandatory checkbox rendered");
      assert.equal(mandatoryCheckbox.props.disabled, true, "Mandatory output cannot be toggled");
      assert.equal(mandatoryCheckbox.props.checked, true, "Mandatory output is checked");

      // poc_demo is optional BUT work started (milestone is IN_PROGRESS) -> MUST be disabled and show started badge
      const startedCheckbox = tree.find((n) => n.type === "input" && n.props.id === "scope-doc-poc_demo");
      assert(startedCheckbox, "Started work checkbox rendered");
      assert.equal(startedCheckbox.props.disabled, true, "Started work output cannot be removed");
      assert(
        tree.some((n) => n.props.children === translate("planChange.startedBadge")),
        "Started work badge is displayed to inform user"
      );

      // kajian_teknis is optional and unstarted (milestone is CREATED) -> CAN be unchecked
      const unstartedCheckbox = tree.find((n) => n.type === "input" && n.props.id === "scope-doc-kajian_teknis");
      assert(unstartedCheckbox, "Unstarted checkbox rendered");
      assert.equal(unstartedCheckbox.props.disabled, false, "Unstarted output can be removed");
      assert.equal(unstartedCheckbox.props.checked, true, "Unstarted output is currently checked");

      // spesifikasi_teknis is optional and unselected -> CAN be checked
      const unselectedCheckbox = tree.find((n) => n.type === "input" && n.props.id === "scope-doc-spesifikasi_teknis");
      assert(unselectedCheckbox, "Unselected checkbox rendered");
      assert.equal(unselectedCheckbox.props.disabled, false, "Unselected output can be added");
      assert.equal(unselectedCheckbox.props.checked, false, "Unselected output is unchecked");

      // 3. Test Add Scope: check spesifikasi_teknis
      unselectedCheckbox.props.onChange();
      tree = view();

      // When added, start_date and duration_working_days inputs must appear
      const dateInput = tree.find((n) => n.props.type === "date");
      const durationInput = tree.find((n) => n.props.type === "number");
      assert(dateInput, "Schedule start date input appears for newly added milestone");
      assert(durationInput, "Schedule duration input appears for newly added milestone");

      // 4. Submit Proposal Form
      const form = tree.find((n) => n.type === "form" && typeof n.props.onSubmit === "function");
      assert(form, "Scope change form rendered");

      // Simulate form submit
      await form.props.onSubmit({ preventDefault: () => {} });
      assert.equal(mutations.length, 1, "Mutation was sent");
      assert.equal(mutations[0].changeId, undefined, "New request has undefined changeId");
      assert(mutations[0].body.selected_keys.includes("spesifikasi_teknis"), "Selected keys includes newly added output");
      assert.equal(mutations[0].body.expected_updated_at, project.updated_at, "Expected updated_at is preserved for CAS");

      // 5. Test Head SA Review (Approve & Reject)
      currentUser = { id: "head-sa-1", role: "HEAD_SA", fullName: "Head Solution Architect" };
      scopeChangesList = [
        {
          id: "change-901",
          project_id: "proj-101",
          phase_id: "phase-pra-tender",
          requested_at: "2026-11-19T10:15:00.000Z",
          reason: "Klien meminta penambahan spesifikasi teknis",
          before_keys: ["proposal_deck_solusi", "kajian_teknis", "poc_demo"],
          proposal: {
            selected_keys: ["proposal_deck_solusi", "kajian_teknis", "poc_demo", "spesifikasi_teknis"],
            additions: [
              {
                key: "spesifikasi_teknis",
                start_date: "2026-11-20",
                duration_working_days: 3,
                due_date: "2026-11-23",
              },
            ],
          },
          status: "PENDING",
          review_note: null,
        },
      ];

      reset();
      tree = view();

      // Head SA sees Approve and Reject buttons
      const approveBtn = tree.find(
        (n) => n.type === Button && n.props.children === translate("common.approve")
      );
      const rejectBtn = tree.find(
        (n) => n.type === Button && n.props.children === translate("common.reject")
      );
      assert(approveBtn, "Head SA sees Approve button");
      assert(rejectBtn, "Head SA sees Reject button");

      // Approve action
      mutations.length = 0;
      await approveBtn.props.onClick();
      assert.equal(mutations.length, 1, "Approve mutation sent");
      assert.equal(mutations[0].changeId, "change-901");
      assert.equal(mutations[0].body.decision, "APPROVED");

      // 6. Test Sales Cancel Action
      currentUser = { id: "sales-user-1", role: "SALES", fullName: "Sales Executive" };
      reset();
      tree = view();

      const cancelBtn = tree.find(
        (n) => n.type === Button && n.props.children === translate("planChange.cancelRequest")
      );
      assert(cancelBtn, "Sales owner sees Cancel Request button for pending request");

      mutations.length = 0;
      await cancelBtn.props.onClick();
      assert.equal(mutations.length, 1, "Cancel mutation sent");
      assert.equal(mutations[0].changeId, "change-901");
      assert.equal(mutations[0].body.decision, "CANCELLED");
    }

    console.log(
      "Project Scope 1:1 Milestones: mandatory lock, started-work protection, additions schedule, unstarted removal, Head SA approve/reject, Sales cancel, and EN/ID bilingual validation all passed."
    );
  } finally {
    (React as any).useState = originals.state;
    (React as any).useRef = originals.ref;
    (React as any).useEffect = originals.effect;
    (authHooks as any).useAuth = originals.auth;
    (scopeHooks as any).useScopeChanges = originals.scopeChanges;
    (scopeHooks as any).useScopeChangeMutation = originals.scopeChangeMutation;
    (outputHooks as any).useOutputDocuments = originals.outputDocs;
    (languageProvider as any).useLanguage = originals.language;
    setActiveLanguage("en");
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
