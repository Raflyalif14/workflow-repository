import assert from "node:assert/strict";
import React, { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as auth from "../components/auth/auth-provider";
import * as language from "../components/i18n/language-provider";
import * as projects from "../hooks/use-projects";
import * as scenarioHooks from "../hooks/use-scenarios";
import * as draftHooks from "../hooks/use-project-form-draft";
import { ProjectCreateDetails } from "../components/projects/project-create-details";
import { ProjectCreateScenario } from "../components/projects/project-create-scenario";
import { ProjectCreateAttachments } from "../components/projects/project-create-attachments";
import { BusinessConfirmation } from "../components/projects/business-confirmation";
import { getProjectRevenueError, getProjectValidationError } from "./project-create-validation";
import { getMandatoryDocumentKeys } from "../constants/scenarios";
import { setActiveLanguage, translate } from "../i18n";
import { ApiError } from "./api-client";
import type { ProjectCreateInput } from "./project-create-request";
import type { Scenario } from "../types/scenario";

const Module = require("node:module");
const load = Module._load;
const destinations: string[] = [];
Module._load = function (name: string, ...args: unknown[]) {
  if (name === "next/navigation") return { useRouter: () => ({ push: (url: string) => destinations.push(url) }) };
  return load.call(this, name, ...args);
};
const Page = require("../app/projects/new/page").default;
Module._load = load;

type Element = React.ReactElement<any>;
const elements = (node: ReactNode): Element[] => Array.isArray(node) ? node.flatMap(elements)
  : isValidElement(node) ? [node as Element, ...elements((node as Element).props.children)] : [];
const scenario = { id: "scenario", name: "On Submission Tender", is_active: true } as Scenario;
const mom = new File(["pdf"], "mom.pdf", { type: "application/pdf" });
const photos = [new File(["photo"], "photo.png", { type: "image/png" })];
const valid = { name: "Project", customer: "Customer", scenarioId: scenario.id, scenarios: [scenario], estimatedRevenue: "0", mom, photos, documents: [] };

export async function testProjectCreateForm() {
  assert.equal(getProjectValidationError(valid), null, "Zero revenue is valid");
  for (const value of ["", " "]) assert.equal(getProjectRevenueError(value), "projectCreate.revenueRequired");
  for (const value of ["-1", "Infinity", "NaN", "1e999"]) assert.equal(getProjectRevenueError(value), "copy.revenueValidation");
  assert.equal(getProjectRevenueError("0.25"), null);
  for (const scenarios of [[], [{ ...scenario, is_active: false }]])
    assert.equal(getProjectValidationError({ ...valid, scenarios }), "copy.selectActiveScenario");
  assert.equal(getProjectValidationError({ ...valid, mom: null }), "copy.momRequired");
  assert.equal(getProjectValidationError({ ...valid, photos: [] }), "copy.photoRequired");
  assert(getProjectValidationError({ ...valid, mom: new File(["bad"], "mom.txt", { type: "text/plain" }) }));

  const originals = { state: React.useState, ref: React.useRef, auth: auth.useAuth, language: language.useLanguage,
    scenarios: scenarioHooks.useScenarios, create: projects.useCreateProject, draft: draftHooks.useProjectFormDraft };
  let states: any[] = [], refs: any[] = [], si = 0, ri = 0, role = "SALES", fail = true;
  let scenarios = [scenario], hasError = false;
  const writes: ProjectCreateInput[] = [];
  (React as any).useState = (initial: any) => {
    const index = si++;
    if (!(index in states)) states[index] = initial;
    return [states[index], (value: any) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
  };
  (React as any).useRef = (value: any) => refs[ri++] ??= { current: value };
  (auth as any).useAuth = () => ({ user: { id: "owner", role } });
  (language as any).useLanguage = () => ({});
  (scenarioHooks as any).useScenarios = () => ({ data: scenarios, isLoading: false, isError: hasError, refetch() {} });
  (draftHooks as any).useProjectFormDraft = () => ({ ready: true, status: 'saved', restored: false, savedAt: null,
    assertCurrent: () => {},
    freeze: async () => ({ requestId: '00000000-0000-4000-8000-000000000001' }), complete: async () => {}, retry: async () => {}, reload: async () => {}, discard: async () => {} });
  (projects as any).useCreateProject = () => ({ isPending: false, mutateAsync: async (input: ProjectCreateInput) => {
    writes.push(input);
    if (fail) throw new ApiError("Synthetic retry", 503, "CREATE_RETRYABLE");
    return { id: "new-project" };
  } });
  const tree = () => { si = 0; ri = 0; const root = Page(); return typeof root.type === 'function' ? root.type(root.props) : root; };
  const get = (type: any) => elements(tree()).find(node => node.type === type)!;
  const submit = () => get("form").props.onSubmit({ preventDefault() {} });
  try {
    for (const locale of ["en", "id"] as const) {
      setActiveLanguage(locale); states = []; refs = []; writes.length = 0; destinations.length = 0;
      role = "SALES"; scenarios = [scenario]; hasError = false; fail = true;
      await submit(); assert.equal(get(BusinessConfirmation).props.open, false);
      assert.equal(writes.length, 0);
      const details = get(ProjectCreateDetails).props;
      details.setName(" Project "); details.setCustomer(" Customer "); details.setEstimatedRevenue("");
      const html = renderToStaticMarkup(createElement(ProjectCreateDetails, get(ProjectCreateDetails).props));
      assert(html.includes('id="project-revenue-error"') && html.includes(translate("projectCreate.revenueRequired")));
      details.setEstimatedRevenue("0");
      get(ProjectCreateScenario).props.setScenarioId(scenario.id);
      get(ProjectCreateAttachments).props.setMom(mom); get(ProjectCreateAttachments).props.setPhotos(photos);
      await submit(); assert.equal(get(BusinessConfirmation).props.open, true);
      get(BusinessConfirmation).props.onOpenChange(false); assert.equal(writes.length, 0, "Cancel never creates a project");
      hasError = true; await submit(); assert.equal(get(BusinessConfirmation).props.open, false);
      hasError = false; await submit();
      scenarios = []; await assert.rejects(() => get(BusinessConfirmation).props.onConfirm());
      assert.equal(writes.length, 0, "Scenario removed while confirmation is open blocks the first submission");
      scenarios = [scenario]; await submit();
      await assert.rejects(() => get(BusinessConfirmation).props.onConfirm());
      assert.equal(get("fieldset").props.disabled, true);
      assert.equal(writes[0].name, "Project");
      assert.deepEqual(writes[0].selectedDocumentKeys, getMandatoryDocumentKeys("ON_SUBMISSION_TENDER"));
      const first = writes[0];
      scenarios = []; hasError = true; fail = false;
      get(BusinessConfirmation).props.onOpenChange(false); await submit();
      assert.equal(get(BusinessConfirmation).props.open, true, "Frozen retry survives scenario loading errors");
      await get(BusinessConfirmation).props.onConfirm();
      assert.equal(writes[1], first, "Retry retains the exact payload despite scenario refresh");
      assert.equal(writes[1].mom, mom); assert.equal(writes[1].photos, photos);
      assert.equal(destinations.at(-1), "/projects/new-project");
      await get(BusinessConfirmation).props.onConfirm();
      assert.equal(writes.length, 2, "Success waiting for navigation cannot start another creation");
      for (role of ["SA", "HEAD_SA", "SUPER_ADMIN"]) assert(!elements(tree()).some(node => node.type === "form"));
    }
  } finally {
    (React as any).useState = originals.state; (React as any).useRef = originals.ref;
    (auth as any).useAuth = originals.auth; (language as any).useLanguage = originals.language;
    (scenarioHooks as any).useScenarios = originals.scenarios; (projects as any).useCreateProject = originals.create;
    (draftHooks as any).useProjectFormDraft = originals.draft;
    setActiveLanguage("en");
  }
  console.log("Project form: validation, active scenarios, confirmation cancellation, frozen retry, success guard and role access passed in EN/ID.");
}
