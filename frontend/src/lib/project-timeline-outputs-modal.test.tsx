import assert from "node:assert/strict";
import React, { isValidElement, type ReactNode } from "react";
import * as authHooks from "../components/auth/auth-provider";
import * as languageProvider from "../components/i18n/language-provider";
import * as outputHooks from "../hooks/use-output-documents";
import * as projectHooks from "../hooks/use-projects";
import { ProjectTimelineEditor } from "../components/projects/project-timeline-editor";
import { BusinessConfirmation } from "../components/projects/business-confirmation";
import { Button } from "../components/ui/button";
import { Dialog } from "../components/ui/dialog";
import { setActiveLanguage, translate } from "../i18n";
import type { Project, ProjectMilestonePhase4, ProjectOutputDocumentItem } from "@/types/project";

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
      return [el, ...elements((el.type as any).render(el.props, (el.props as any).ref))];
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
    memo: React.useMemo,
    callback: React.useCallback,
    auth: authHooks.useAuth,
    language: languageProvider.useLanguage,
    outputDocs: outputHooks.useOutputDocuments,
    updateChecklist: outputHooks.useUpdateOutputChecklist,
    saveTimeline: projectHooks.useSaveProjectTimeline,
    document: (globalThis as any).document,
  };
  (globalThis as any).document = {
    addEventListener: () => {},
    removeEventListener: () => {},
    body: { style: {} },
    activeElement: null,
  };

  let states: any[] = [];
  let refs: any[] = [];
  let effects: Array<() => void> = [];
  let si = 0;
  let ri = 0;

  let currentUser: any = { id: "sales-1", role: "SALES", isActive: true };
  let isScopeLocked = false;
  let docs: ProjectOutputDocumentItem[] = [
    {
      id: "doc-req",
      projectId: "proj-1",
      key: "proposal_teknis",
      name: "Proposal Teknis",
      group: "PRA_TENDER",
      milestoneId: "m-sa",
      isRequired: true,
      isSelected: true,
      status: "DRAFT",
      startDate: "2026-11-02",
      durationWorkingDays: 2,
      dueDate: "2026-11-03",
    },
    {
      id: "doc-opt",
      projectId: "proj-1",
      key: "rab",
      name: "RAB",
      group: "PRA_TENDER",
      milestoneId: "m-sa",
      isRequired: false,
      isSelected: false,
      status: "DRAFT",
      startDate: null,
      durationWorkingDays: null,
      dueDate: null,
    },
  ];
  let milestones: ProjectMilestonePhase4[] = [
    {
      id: "m-sa",
      project_id: "proj-1",
      workflow_stage_id: "stage-1",
      phase_id: "phase-1",
      name: "Deliverables",
      status: "CREATED",
      step_order: 1,
      start_date: "2026-11-02",
      duration_working_days: 2,
      due_date: "2026-11-03",
      created_at: "2026-11-01",
      updated_at: "2026-11-01",
      workflow_stage: { id: "stage-1", default_role: "SA" },
    },
  ];

  const checklistMutations: string[][] = [];
  let outputRefetchCount = 0;
  let milestoneRefetchCount = 0;

  const project = {
    id: "proj-1",
    name: "Firewall Refresh",
    project_code: "FW-01",
    customer: "Customer",
    sales_id: "sales-1",
    status: "DRAFT",
    active_phase_id: "phase-1",
    createdAt: "2026-11-01",
    updatedAt: "2026-11-01",
    phases: [{ id: "phase-1", phase_key: "PRA_TENDER", status: "ACTIVE" }],
    scenario: {
      id: "scen-1",
      name: "Standard",
      workflow_model: "OPERATIONAL_V2",
      workflow_version: 2,
    },
  } as unknown as Project;

  const resetHooks = () => {
    states = [];
    refs = [];
    effects = [];
  };

  (React as any).useState = (initial: any) => {
    const i = si++;
    if (!(i in states)) states[i] = typeof initial === "function" ? initial() : initial;
    return [
      states[i],
      (next: any) => {
        states[i] = typeof next === "function" ? next(states[i]) : next;
      },
    ];
  };
  (React as any).useRef = (value: any) => {
    const i = ri++;
    if (!(i in refs)) refs[i] = { current: value };
    return refs[i];
  };
  (React as any).useEffect = (fn: () => void) => {
    effects.push(fn);
  };
  (React as any).useMemo = (fn: any) => fn();
  (React as any).useCallback = (fn: any) => fn;
  (authHooks as any).useAuth = () => ({ user: currentUser, isLoading: false });
  (languageProvider as any).useLanguage = () => ({ locale: "en", t: translate });
  (projectHooks as any).useSaveProjectTimeline = () => ({
    isPending: false,
    mutateAsync: async () => ({}),
    prepare: () => {},
  });
  (outputHooks as any).useOutputDocuments = () => ({
    isLoading: false,
    isError: false,
    data: {
      documents: docs,
      isScopeLocked,
      scenarioKey: "PRA_TENDER",
    },
    refetch: async () => {
      outputRefetchCount += 1;
      return { data: { documents: docs, isScopeLocked } };
    },
  });
  (outputHooks as any).useUpdateOutputChecklist = () => ({
    isPending: false,
    error: null,
    prepare: () => {},
    mutateAsync: async (selectedKeys: string[]) => {
      checklistMutations.push(selectedKeys);
      docs = docs.map((item) => ({
        ...item,
        isSelected: item.isRequired || selectedKeys.includes(item.key),
      }));
      return { success: true, selectedDocumentKeys: selectedKeys };
    },
  });

  const renderEditor = (overrides: { canEdit?: boolean; status?: Project["status"]; locked?: boolean } = {}) => {
    isScopeLocked = overrides.locked ?? false;
    si = 0;
    ri = 0;
    effects = [];
    const targetProject = { ...project, status: overrides.status ?? "DRAFT" };
    const tree = elements(
      ProjectTimelineEditor({
        projectId: targetProject.id,
        project: targetProject,
        milestones,
        canEdit: overrides.canEdit ?? true,
        workflowModel: "OPERATIONAL_V2",
        workflowVersion: 2,
        onOutputsUpdated: async () => {
          milestoneRefetchCount += 1;
          return { data: milestones };
        },
      })
    );
    effects.splice(0).forEach((fn) => fn());
    return tree;
  };

  try {
    setActiveLanguage("en");

    // 1. Visibility guards: hidden when read-only, non-DRAFT, or locked
    resetHooks();
    assert(
      !renderEditor({ canEdit: false }).some((n) => n.type === Button && String(n.props.children).includes(translate("outputScope.editButton"))),
      "Edit outputs button must be hidden when canEdit is false"
    );
    resetHooks();
    assert(
      !renderEditor({ status: "ACTIVE" }).some((n) => n.type === Button && String(n.props.children).includes(translate("outputScope.editButton"))),
      "Edit outputs button must be hidden when project is not DRAFT"
    );
    resetHooks();
    assert(
      !renderEditor({ locked: true }).some((n) => n.type === Button && String(n.props.children).includes(translate("outputScope.editButton"))),
      "Edit outputs button must be hidden when output scope is locked"
    );

    // 2. Visible for editable DRAFT Sales owner (EN & ID)
    resetHooks();
    let tree = renderEditor();
    const textContent = (node: ReactNode): string =>
      typeof node === "string" || typeof node === "number"
        ? String(node)
        : Array.isArray(node)
        ? node.map(textContent).join("")
        : isValidElement(node)
        ? textContent((node.props as any).children)
        : "";

    const editBtn = tree.find((n) => n.type === Button && textContent(n).includes(translate("outputScope.editButton")));
    assert(editBtn, "Edit outputs button must render in Project Timeline Setup header for editable DRAFT Sales");

    // Bilingual ID label check
    setActiveLanguage("id");
    assert(
      renderEditor().some((n) => n.type === Button && textContent(n).includes(translate("outputScope.editButton"))),
      "Indonesian label 'Ubah output' must render in header"
    );
    setActiveLanguage("en");

    // 3. Clicking Edit outputs opens OutputScopeDialog reusing Selected project outputs form
    editBtn.props.onClick();
    tree = renderEditor();
    tree = renderEditor(); // flush useEffect hydration of selected keys
    const modal = tree.find((n) => n.type === Dialog && n.props.open === true);
    assert(modal, "Clicking Edit outputs opens the output selection modal");
    assert(
      tree.some((n) => textContent(n) === translate("outputScope.title")),
      "Modal displays Selected project outputs title"
    );

    const rabCheckbox = tree.find((n) => n.type === "input" && n.props.type === "checkbox" && n.props["aria-label"] === "RAB");
    assert(rabCheckbox && rabCheckbox.props.checked === false, "Optional RAB starts unchecked");

    // 4. Toggle optional output, save & confirm -> calls checklist API, refreshes output & milestones, closes modal & adds row
    rabCheckbox.props.onChange();
    tree = renderEditor();
    const saveOutputBtn = tree.find((n) => n.type === Button && textContent(n) === translate("outputScope.save"));
    assert(saveOutputBtn, "Save output selection button renders inside modal");
    saveOutputBtn.props.onClick();

    tree = renderEditor();
    const confirmDialog = tree.find((n) => n.type === BusinessConfirmation && n.props.open === true && n.props.title === project.name);
    assert(confirmDialog, "Saving output selection opens BusinessConfirmation outside inner dialog");

    await confirmDialog.props.onConfirm();
    tree = renderEditor();

    assert.equal(checklistMutations.length, 1);
    assert(checklistMutations[0].includes("rab"), "Checklist mutation submits updated selection including rab");
    assert.equal(outputRefetchCount, 1, "Timeline editor refetches outputs after modal save");
    assert.equal(milestoneRefetchCount, 1, "Timeline editor calls onOutputsUpdated to refresh milestones");
    assert(
      !tree.some((n) => n.type === Dialog && n.props.open === true),
      "Output selection modal closes cleanly after save"
    );
    assert(
      tree.some((n) => n.props?.title === "RAB"),
      "Project Timeline Setup immediately renders the newly added RAB row"
    );

    console.log("PASS Project Timeline Setup Edit outputs modal visibility, reuse, save and timeline refresh");
  } finally {
    React.useState = originals.state;
    React.useRef = originals.ref;
    React.useEffect = originals.effect;
    React.useMemo = originals.memo;
    React.useCallback = originals.callback;
    (authHooks as any).useAuth = originals.auth;
    (languageProvider as any).useLanguage = originals.language;
    (outputHooks as any).useOutputDocuments = originals.outputDocs;
    (outputHooks as any).useUpdateOutputChecklist = originals.updateChecklist;
    (projectHooks as any).useSaveProjectTimeline = originals.saveTimeline;
    (globalThis as any).document = originals.document;
    setActiveLanguage("en");
  }
}

void run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
