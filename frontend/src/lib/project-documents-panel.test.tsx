import assert from 'node:assert/strict';
import React, { isValidElement, type ReactNode } from 'react';
import * as officialHooks from '../hooks/use-documents';
import * as outputHooks from '../hooks/use-output-documents';
import * as sessions from '../hooks/use-repository-session';
import { ProjectDocumentsSection } from '../components/projects/project-documents-section';
import { Button } from '../components/ui/button';
import { setActiveLanguage, translate, translateOutputName } from '../i18n';

type Element = React.ReactElement<any>;
const elements = (node: ReactNode): Element[] => Array.isArray(node) ? node.flatMap(elements)
  : isValidElement(node) ? [node as Element, ...elements((node as Element).props.children)] : [];
const originals = { state: React.useState, docs: officialHooks.useDocuments, outputs: outputHooks.useOutputRepository,
  officialDownload: officialHooks.useDocumentDownloadUrl, outputDownload: outputHooks.useOutputRepositoryDownload,
  session: sessions.useRepositorySession, window: globalThis.window };
let enabled = true, error = '', refetches = 0;
let docs: any = { data: [], isError: false, refetch() { refetches++; } };
let outputs: any = { data: [], isError: false, refetch() { refetches++; } };
const downloads: any[] = [], opened: any[] = [];
const approved: outputHooks.OutputRepositoryItem = { outputId: 'output-a', projectId: 'project-a', milestoneId: 'milestone-a',
  documentKey: 'proposal_deck_solusi', name: 'Solution proposal or deck', projectName: 'Synthetic project', customer: '',
  group: 'PRA_TENDER', status: 'APPROVED', fileName: 'approved-a.pdf', versionNumber: 2, approvedVersionId: 'approved-snapshot-v2',
  files: [{ id: 'approved-file-a', fileName: 'approved-a.pdf', fileSize: 10 }, { id: 'approved-file-b', fileName: 'approved-b.pdf', fileSize: 20 }] };
(React as any).useState = () => [error, (value: string) => { error = value; }];
(sessions as any).useRepositorySession = () => ({ enabled });
(officialHooks as any).useDocuments = (filter: any) => { assert.deepEqual(filter, { projectId: 'project-a' }); return docs; };
(outputHooks as any).useOutputRepository = () => outputs;
(officialHooks as any).useDocumentDownloadUrl = () => ({ isPending: false, mutateAsync: async (id: string) => {
  downloads.push({ officialVersion: id }); return { url: 'https://fixture.invalid/official' };
} });
let downloadFails = false;
(outputHooks as any).useOutputRepositoryDownload = () => ({ isPending: false, mutateAsync: async (input: unknown) => {
  downloads.push(input); if (downloadFails) throw new Error('Synthetic failure'); return { url: 'https://fixture.invalid/approved' };
} });
(globalThis as any).window = { open(...args: any[]) { opened.push(args); } };
const render = () => elements(ProjectDocumentsSection({ projectId: 'project-a' }));
const downloadButtons = (tree: Element[]) => tree.filter(node => node.type === Button && node.props.onClick && Array.isArray(node.props.children));
async function run() { try {
  for (const locale of ['en', 'id'] as const) {
    setActiveLanguage(locale); error = ''; docs = { ...docs, data: [], isError: false }; outputs = { ...outputs, isError: false };
    outputs.data = [approved, { ...approved }, { ...approved, projectId: 'other-project' }, { ...approved, documentKey: 'draft', status: 'DRAFT' },
      { ...approved, documentKey: 'invalid', approvedVersionId: '' }];
    let tree = render();
    assert(!tree.some(node => node.props.children === translate('documents.empty')), 'Approved output replaces false empty state');
    assert.equal(tree.filter(node => node.type === 'p' && node.props.children === translateOutputName(approved.documentKey, approved.name)).length, 1,
      'Multi-file approved output is one entry, deduplicated and scoped to the project');
    const buttons = downloadButtons(tree); assert.equal(buttons.length, 2, 'Exactly the approved snapshot files have download actions');
    for (const [index, button] of buttons.entries()) {
      // Handlers intentionally return void; drain their synthetic promise before assertions below.
      button.props.onClick();
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(downloads.at(-1), { projectId: 'project-a', documentKey: 'proposal_deck_solusi',
        fileId: approved.files[index].id, versionId: 'approved-snapshot-v2' });
      assert.equal(opened.at(-1)[1], '_blank');
    }
    downloadFails = true; buttons[0].props.onClick(); await new Promise(resolve => setImmediate(resolve));
    assert(render().some(node => node.props.role === 'alert')); downloadFails = false; error = '';
    tree = render(); assert.equal(downloadButtons(tree).length, 2, 'Refetch retains approved file actions');
    outputs.data = []; tree = render();
    assert(tree.some(node => node.props.children === translate('documents.empty')), 'Next non-approved submission does not expose prior/draft files outside repository policy');
    assert.equal(downloadButtons(tree).length, 0);
    docs.data = [{ id: 'official-a', projectId: 'project-a', title: 'Synthetic official', category: 'OTHER', status: 'APPROVED',
      createdAt: '2026-10-09T00:00:00Z', updatedAt: '2026-10-09T00:00:00Z', canUploadVersion: false,
      versions: [{ id: 'official-version', versionNumber: 1, fileName: 'official.pdf' }] }];
    outputs.data = [approved]; tree = render(); assert.equal(downloadButtons(tree).length, 3, 'Official documents remain accessible beside outputs');
    enabled = false; assert.equal(downloadButtons(render()).length, 0, 'Ineligible session gets no document actions'); enabled = true;
    outputs.isError = true; tree = render();
    assert(tree.some(node => node.props.children === translate('documents.loadError')));
    assert.equal(downloadButtons(tree).length, 0, 'Errors never expose stale cached files or masquerade as empty');
    tree.find(node => node.type === Button && node.props.children === translate('common.retry'))!.props.onClick();
    assert(refetches > 0);
    outputs = { ...outputs, data: [], isError: false }; docs.data = []; assert.equal(downloadButtons(render()).length, 0, 'No authorized result means no entry/actions');
  }
  console.log('Project Documents panel: approved snapshot files, single-entry collections, current project, refresh/revision, official preservation, session/error/empty, retry and EN/ID passed.');
} finally {
  (React as any).useState = originals.state; (sessions as any).useRepositorySession = originals.session;
  (officialHooks as any).useDocuments = originals.docs; (outputHooks as any).useOutputRepository = originals.outputs;
  (officialHooks as any).useDocumentDownloadUrl = originals.officialDownload; (outputHooks as any).useOutputRepositoryDownload = originals.outputDownload;
  (globalThis as any).window = originals.window; setActiveLanguage('en');
} }
run().catch(failure => { console.error(failure); process.exitCode = 1; });
