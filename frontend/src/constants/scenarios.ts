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
  { key: 'proposal_deck_solusi', name: 'Proposal atau Deck Solusi', isRequired: true, group: 'PRA_TENDER' },
  { key: 'poc_demo', name: 'POC atau Demo', isRequired: false, group: 'PRA_TENDER' },
  { key: 'assessment', name: 'Assessment', isRequired: false, group: 'PRA_TENDER' },
  { key: 'kak_rfp', name: 'KAK atau RFP', isRequired: false, group: 'PRA_TENDER' },
  { key: 'rab', name: 'RAB', isRequired: false, group: 'PRA_TENDER' },
  { key: 'kajian_teknis', name: 'Kajian Teknis', isRequired: false, group: 'PRA_TENDER' },
  { key: 'spesifikasi_teknis', name: 'Spesifikasi Teknis', isRequired: false, group: 'PRA_TENDER' },
  { key: 'analisa_kebutuhan', name: 'Analisa Kebutuhan', isRequired: false, group: 'PRA_TENDER' },
  { key: 'operational_requirement', name: 'Operational Requirement', isRequired: false, group: 'PRA_TENDER' },
  { key: 'rencana_distribusi', name: 'Rencana Distribusi', isRequired: false, group: 'PRA_TENDER' },
];

const ON_SUBMISSION_TENDER_DOCUMENTS: ScenarioDocumentDefinition[] = [
  { key: 'proposal_teknis', name: 'Proposal Teknis', isRequired: true, group: 'ON_SUBMISSION_TENDER' },
  { key: 'metodologi_implementasi', name: 'Metodologi Implementasi', isRequired: false, group: 'ON_SUBMISSION_TENDER' },
  { key: 'timeline_proyek', name: 'Timeline Proyek', isRequired: true, group: 'ON_SUBMISSION_TENDER' },
  { key: 'identitas_barang_produk', name: 'Identitas Barang/Produk yang Ditawarkan', isRequired: true, group: 'ON_SUBMISSION_TENDER' },
  { key: 'spesifikasi_teknis_toc', name: 'Spesifikasi Teknis Barang/Produk yang Ditawarkan atau TOC', isRequired: true, group: 'ON_SUBMISSION_TENDER' },
  { key: 'arsitektur_sistem', name: 'Arsitektur Sistem', isRequired: false, group: 'ON_SUBMISSION_TENDER' },
  { key: 'poc_demo_report', name: 'POC atau Solusi Demo Report', isRequired: false, group: 'ON_SUBMISSION_TENDER' },
];

export const SCENARIO_DOCUMENTS: Record<ScenarioKey, ScenarioDocumentDefinition[]> = {
  PRA_TENDER: [...PRE_TENDER_DOCUMENTS, ...ON_SUBMISSION_TENDER_DOCUMENTS],
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
