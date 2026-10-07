export type ScenarioKey = 'PRA_TENDER' | 'ON_SUBMISSION_TENDER';

export type OutputDocumentStatus =
  | 'NOT_REQUIRED'
  | 'TO_DO'
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'REVISION_REQUIRED'
  | 'APPROVED';

export interface ScenarioDocumentDefinition {
  key: string;
  name: string;
  isRequired: boolean;
  group: ScenarioKey;
  stageKey: string;
  description?: string;
}

export interface ScenarioDefinition {
  key: ScenarioKey;
  name: string;
  label: string;
  description: string;
  documents: ScenarioDocumentDefinition[];
}

const PRE_TENDER_DOCUMENTS: ScenarioDocumentDefinition[] = [
  { key: 'proposal_deck_solusi', name: 'Proposal atau Deck Solusi', isRequired: true, group: 'PRA_TENDER', stageKey: 'PROPOSAL_SOLUTION' },
  { key: 'poc_demo', name: 'POC atau Demo', isRequired: false, group: 'PRA_TENDER', stageKey: 'DELIVERABLES' },
  { key: 'assessment', name: 'Assessment', isRequired: false, group: 'PRA_TENDER', stageKey: 'ASSESSMENT_REPORT' },
  { key: 'kak_rfp', name: 'KAK atau RFP', isRequired: false, group: 'PRA_TENDER', stageKey: 'REQUIREMENT_GATHERING' },
  { key: 'rab', name: 'RAB', isRequired: false, group: 'PRA_TENDER', stageKey: 'TECHNICAL_PROPOSAL_BOQ' },
  { key: 'kajian_teknis', name: 'Kajian Teknis', isRequired: false, group: 'PRA_TENDER', stageKey: 'PAIN_POINT_ANALYSIS' },
  { key: 'spesifikasi_teknis', name: 'Spesifikasi Teknis', isRequired: false, group: 'PRA_TENDER', stageKey: 'TECHNICAL_PROPOSAL_BOQ' },
  { key: 'analisa_kebutuhan', name: 'Analisa Kebutuhan', isRequired: false, group: 'PRA_TENDER', stageKey: 'REQUIREMENT_GATHERING' },
  { key: 'operational_requirement', name: 'Operational Requirement', isRequired: false, group: 'PRA_TENDER', stageKey: 'REQUIREMENT_GATHERING' },
  { key: 'rencana_distribusi', name: 'Rencana Distribusi', isRequired: false, group: 'PRA_TENDER', stageKey: 'DELIVERABLES' },
];

const ON_SUBMISSION_TENDER_DOCUMENTS: ScenarioDocumentDefinition[] = [
  { key: 'proposal_teknis', name: 'Proposal Teknis', isRequired: true, group: 'ON_SUBMISSION_TENDER', stageKey: 'TECHNICAL_PROPOSAL_BOQ' },
  { key: 'metodologi_implementasi', name: 'Metodologi Implementasi', isRequired: false, group: 'ON_SUBMISSION_TENDER', stageKey: 'PROPOSAL_SOLUTION' },
  { key: 'timeline_proyek', name: 'Timeline Proyek', isRequired: true, group: 'ON_SUBMISSION_TENDER', stageKey: 'TECHNICAL_PROPOSAL_BOQ' },
  { key: 'identitas_barang_produk', name: 'Identitas Barang/Produk yang Ditawarkan', isRequired: true, group: 'ON_SUBMISSION_TENDER', stageKey: 'DELIVERABLES' },
  { key: 'spesifikasi_teknis_toc', name: 'Spesifikasi Teknis Barang/Produk yang Ditawarkan atau TOC', isRequired: true, group: 'ON_SUBMISSION_TENDER', stageKey: 'TECHNICAL_PROPOSAL_BOQ' },
  { key: 'arsitektur_sistem', name: 'Arsitektur Sistem', isRequired: false, group: 'ON_SUBMISSION_TENDER', stageKey: 'PROPOSAL_SOLUTION' },
  { key: 'poc_demo_report', name: 'POC atau Solusi Demo Report', isRequired: false, group: 'ON_SUBMISSION_TENDER', stageKey: 'DELIVERABLES' },
];

export const SCENARIO_DOCUMENTS: Record<ScenarioKey, ScenarioDocumentDefinition[]> = {
  PRA_TENDER: PRE_TENDER_DOCUMENTS,
  ON_SUBMISSION_TENDER: ON_SUBMISSION_TENDER_DOCUMENTS,
};

export const SCENARIO_DEFINITIONS: Record<ScenarioKey, ScenarioDefinition> = {
  PRA_TENDER: {
    key: 'PRA_TENDER',
    name: 'Pra-Tender',
    label: 'Pra-Tender',
    description: 'Workflow untuk perencanaan dan eksplorasi kebutuhan sebelum proses tender formal (Pra-Tender).',
    documents: SCENARIO_DOCUMENTS.PRA_TENDER,
  },
  ON_SUBMISSION_TENDER: {
    key: 'ON_SUBMISSION_TENDER',
    name: 'On Submission Tender',
    label: 'On Submission Tender',
    description: 'Workflow penyusunan proposal teknis dan berkas penawaran saat proses tender berlangsung (On Submission Tender).',
    documents: SCENARIO_DOCUMENTS.ON_SUBMISSION_TENDER,
  },
};

export function resolveScenarioKey(identifier?: string | null): ScenarioKey {
  if (!identifier) return 'PRA_TENDER';
  const clean = identifier.trim().toUpperCase().replace(/[ _]+/g, '-');
  if (clean === 'EXISTING-TOR' || clean === 'ON-SUBMISSION-TENDER') return 'ON_SUBMISSION_TENDER';
  return 'PRA_TENDER';
}

export function getScenarioDocuments(identifier?: string | null): ScenarioDocumentDefinition[] {
  const key = resolveScenarioKey(identifier);
  return SCENARIO_DOCUMENTS[key] || SCENARIO_DOCUMENTS.PRA_TENDER;
}

export function getMandatoryDocumentKeys(key: ScenarioKey): string[] {
  return (SCENARIO_DOCUMENTS[key] || [])
    .filter((doc) => doc.isRequired)
    .map((doc) => doc.key);
}

// Explicit legacy compatibility; never used to create a new phase.
export const ALL_OUTPUT_DEFINITIONS = [...PRE_TENDER_DOCUMENTS, ...ON_SUBMISSION_TENDER_DOCUMENTS];
export function getProjectDocumentDefinitions(scenario: string, hasPhases: boolean) {
  return !hasPhases && resolveScenarioKey(scenario) === "PRA_TENDER" ? ALL_OUTPUT_DEFINITIONS : getScenarioDocuments(scenario);
}
export function getProjectMandatoryDocumentKeys(scenario: string, hasPhases: boolean) {
  return getProjectDocumentDefinitions(scenario, hasPhases).filter(document => document.isRequired).map(document => document.key);
}
