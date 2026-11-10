import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectResultCard } from "../components/projects/project-result-card";
import { setActiveLanguage, translate } from "../i18n";
import type { Project } from "../types/project";

const baseProject: Project = {
  id: "proj-1",
  name: "Tender ERP System",
  customer: "PT Pelindo Nusantara",
  status: "WON",
  estimated_revenue: 500000000,
  final_contract_value: 550000000,
  outcome_decided_at: "2026-11-06T07:00:00Z",
  sales: { id: "sales-1", fullName: "Budi Sales", email: "budi@test.com", role: "SALES" },
  pic: { id: "sa-1", fullName: "Andi Architect", email: "andi@test.com", role: "SA" },
  createdAt: "2026-11-01T00:00:00Z",
  updatedAt: "2026-11-06T07:00:00Z",
};

// 1. Inactive / Active projects render nothing
const activeProject: Project = { ...baseProject, status: "ACTIVE" };
assert.equal(renderToStaticMarkup(<ProjectResultCard project={activeProject} />), "");

const draftProject: Project = { ...baseProject, status: "DRAFT" };
assert.equal(renderToStaticMarkup(<ProjectResultCard project={draftProject} />), "");

// 2. Both English and Indonesian locale testing for WON
for (const locale of ["en", "id"] as const) {
  setActiveLanguage(locale);
  const html = renderToStaticMarkup(<ProjectResultCard project={baseProject} />);

  // Title
  assert(html.includes(translate("projectResultCard.wonTitle")));
  // Badge
  assert(html.includes("WON"));
  // Sales & SA names
  assert(html.includes("Budi Sales"));
  assert(html.includes("Andi Architect"));
  // Values: 550.000.000 (or 550,000,000)
  assert(html.includes("550.000.000") || html.includes("550,000,000"));
  // Celebrate button
  assert(html.includes(translate("projectResultCard.celebrateAgain")));
}

// 3. Testing for LOST
const lostProject: Project = {
  ...baseProject,
  status: "LOST",
  final_contract_value: null,
  loss_reason: "Harga penawaran kompetitor 15% lebih rendah",
};

for (const locale of ["en", "id"] as const) {
  setActiveLanguage(locale);
  const html = renderToStaticMarkup(<ProjectResultCard project={lostProject} />);

  // Title
  assert(html.includes(translate("projectResultCard.lostTitle")));
  // Badge
  assert(html.includes("LOST"));
  // Loss reason quote
  assert(html.includes("Harga penawaran kompetitor 15% lebih rendah"));
  // Sales & SA names
  assert(html.includes("Budi Sales"));
  // Estimate
  assert(html.includes("500.000.000") || html.includes("500,000,000"));
}

setActiveLanguage("en");
console.log("ProjectResultCard test passed for both WON and LOST states.");

