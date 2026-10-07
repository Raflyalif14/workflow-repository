import assert from 'node:assert/strict';
import React, { isValidElement, type ReactNode } from 'react';
import Module from 'node:module';
import { prepareReviewRequest, reviewRequestKey, unresolvedFileRevisions, validFileRevisionSelection } from './output-file-revisions';
import { getOutputDocumentSubmitAction } from './output-document-ux';
import { formatActivityDescription } from './activity-timeline';
import { en } from '../i18n/en';
import { id } from '../i18n/id';
import { DEFAULT_LANGUAGE, getActiveLanguage, setActiveLanguage, translate } from '../i18n';
import type { ProjectOutputDocumentItem } from '../types/project';

const files = [{ id: 'a', fileName: 'Identical name.pdf', fileSize: 1 }, { id: 'b', fileName: 'Identical name.pdf', fileSize: 1 }];
const a = { file_id: 'a', feedback: 'Replace the figures.' }, b = { file_id: 'b', feedback: 'Correct the attachment.' };
assert(validFileRevisionSelection(files, [a])); assert(validFileRevisionSelection(files, [a, b]));
for (const markers of [[], [a, a], [{ ...a, file_id: 'foreign' }], [{ ...a, feedback: ' \n\t' }]]) assert(!validFileRevisionSelection(files, markers));
const draft: any = { key: 'proposal_teknis', status: 'REVISION_REQUIRED', draftRevision: 2, draftFiles: files,
  fileRevisions: [{ fileId: 'a', feedback: a.feedback }] };
assert.equal(unresolvedFileRevisions(draft).length, 1);
assert.equal(getOutputDocumentSubmitAction({ ...draft, role: 'SA', canUpload: true }), null);
const changed = { ...draft, draftFiles: [{ ...files[0], id: 'new-a' }, files[1]] };
assert.equal(unresolvedFileRevisions(changed).length, 0);
assert(getOutputDocumentSubmitAction({ ...changed, role: 'SA', canUpload: true }));
assert.equal(unresolvedFileRevisions({ ...draft, draftFiles: [files[1]] }).length, 0);
assert.equal(unresolvedFileRevisions({ ...changed, draftFiles: [...changed.draftFiles, files[0]] }).length, 1, 'Restoring original ID makes revision unresolved');
assert.equal(unresolvedFileRevisions({ ...draft, fileRevisions: [] }).length, 0, 'New snapshot/legacy general feedback has no inferred markers');
const receipts = new Map<string, string>(); let sequence = 0;
const input = { document_key: 'proposal_teknis', expected_version_id: 'v1', decision: 'REVISE' as const, file_revisions: [a, b] };
const request = prepareReviewRequest(input, receipts, () => String(++sequence));
assert.equal(prepareReviewRequest({ ...input, file_revisions: [b, a] }, receipts, () => String(++sequence)).request_id, request.request_id);
assert.notEqual(prepareReviewRequest({ ...input, file_revisions: [{ ...a, feedback: 'Different' }] }, receipts, () => String(++sequence)).request_id, request.request_id);
assert.equal(DEFAULT_LANGUAGE, 'en');
assert.deepEqual(Object.keys(en.fileRevision).sort(), Object.keys(id.fileRevision).sort());
for (const key of Object.keys(en.fileRevision) as Array<keyof typeof en.fileRevision>) {
  assert.deepEqual(en.fileRevision[key].match(/\{\w+\}/g) || [], id.fileRevision[key].match(/\{\w+\}/g) || []);
}

type Element = React.ReactElement<any>;
const elements = (node: ReactNode): Element[] => Array.isArray(node) ? node.flatMap(elements)
  : isValidElement(node) ? [node as Element, ...elements((node as Element).props.children)] : [];

// Invoke the real section handlers with state slots, as in the existing PIC dialog fixture.
// This validates state/mutation behavior, not browser layout or a live database.
async function checkDialog() {
  const originalLoad = (Module as any)._load;
  const originals = { state: React.useState, ref: React.useRef, memo: React.useMemo, callback: React.useCallback, effect: React.useEffect };
  const document = { ...draft, id: 'o', projectId: 'p', milestoneId: 'm', isRequired: true, isSelected: true, name: 'Proposal', group: 'ON_SUBMISSION_TENDER',
    status: 'IN_REVIEW', currentVersionId: '10000000-0000-4000-8000-000000000001', currentVersionNumber: 1, files, fileRevisions: [] } as ProjectOutputDocumentItem;
  let documents = [document], states: any[] = [], refs: any[] = [], si = 0, ri = 0;
  let mutate: () => Promise<any> = async () => { throw new Error('Temporary failure'); };
  const sent: any[] = [];
  const review: any = { isPending: false, mutateAsync: async (payload: any) => {
    sent.push(payload); review.isPending = true;
    try { return await mutate(); } finally { review.isPending = false; }
  } };
  const idle: any = { isPending: false, mutateAsync: async () => { throw new Error('Unexpected mutation'); } };
  (Module as any)._load = function(name: string, ...args: any[]) {
    if (name.endsWith('/auth-provider')) return { useAuth: () => ({ user: { id: 'head', role: 'HEAD_SA' } }) };
    if (name.endsWith('/language-provider')) return { useLanguage: () => ({ locale: getActiveLanguage() }) };
    if (name.endsWith('/use-output-documents')) return {
      useOutputDocuments: () => ({ data: { documents, isScopeLocked: true }, refetch: async () => ({ data: { documents }, isSuccess: true }) }),
      useReviewOutputDocuments: () => review, useSubmitOutputDocuments: () => idle,
      useUpdateOutputChecklist: () => idle, useOutputDocumentFileDownload: () => idle,
    };
    if (name.endsWith('/use-projects')) return { useRetryProjectCompletion: () => idle };
    return originalLoad.call(this, name, ...args);
  };
  try {
    (React as any).useState = (initial: any) => { const index = si++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], (value: any) => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; };
    (React as any).useRef = (initial: any) => { const index = ri++; return refs[index] ||= { current: initial }; };
    (React as any).useMemo = (fn: any) => fn(); (React as any).useCallback = (fn: any) => fn; (React as any).useEffect = () => {};
    const { OutputDocumentsSection } = require('../components/projects/output-documents-section');
    const render = () => { si = 0; ri = 0; return elements(OutputDocumentsSection({ project: { id: 'p', name: 'Project', status: 'ACTIVE' } })); };
    const open = () => { const row = render().find(element => element.props.onRevision); assert(row); row.props.onRevision(); };
    const form = () => render().find(element => element.type === 'form')!;
    const submit = () => form().props.onSubmit({ preventDefault() {} });
    const checkbox = () => render().filter(element => element.type === 'input' && element.props.type === 'checkbox')[0];
    open(); assert.equal(sent.length, 0);
    render().find(element => element.props.onClick && element.props.children === translate('common.cancel'))!.props.onClick();
    assert(!form()); assert.equal(sent.length, 0, 'Cancel must not send a decision');
    open(); await submit(); assert.equal(sent.length, 0, 'No selection cannot submit');
    checkbox().props.onChange({ target: { checked: true } });
    await submit(); assert.equal(sent.length, 0, 'Empty file reason cannot submit');
    render().find(element => element.type === 'textarea' && element.props.id === 'file-reason-a')!.props.onChange({ target: { value: a.feedback } });
    await submit(); assert.equal(sent.length, 0, 'First step only opens final confirmation');
    setActiveLanguage('id'); assert(render().some(element => element.props.children === translate('fileRevision.confirm', { count: 1 })));
    await submit(); assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].items[0].file_revisions, [a]);
    assert(render().some(element => element.type === 'p' && element.props.children === a.feedback), 'Failure/locale preserves selected feedback');
    mutate = async () => ({ results: [{ documentKey: document.key, success: true }] }) as any;
    await submit(); assert.equal(sent.length, 2);
    assert.equal(sent[1].items[0].request_id, sent[0].items[0].request_id, 'Temporary failure retry keeps receipt identity');
    assert(!form());
    open(); checkbox().props.onChange({ target: { checked: true } });
    render().find(element => element.type === 'textarea' && element.props.id === 'file-reason-a')!.props.onChange({ target: { value: 'New review attempt' } });
    await submit(); documents = [{ ...document, currentVersionId: '10000000-0000-4000-8000-000000000009' }];
    await submit(); assert.equal(sent.length, 2, 'A stale snapshot before the first attempt must not mutate');
    assert(form());
    documents = [{ ...document, files: [files[0]] }];
    render().find(element => element.props.onClick && element.props.children === translate('common.cancel'))!.props.onClick();
    open(); assert.equal(checkbox().props.checked, true, 'Single file is selected automatically');
    render().find(element => element.type === 'textarea' && element.props.id === 'file-reason-a')!.props.onChange({ target: { value: 'Concurrency attempt' } });
    await submit();
    let release!: (value: any) => void;
    mutate = () => new Promise(resolve => { release = resolve; });
    const first = submit(); const second = submit();
    assert.equal(sent.length, 3, 'Double click while pending cannot send two reviews');
    assert(render().filter(element => element.props.type === 'submit').every(element => element.props.disabled));
    release({ results: [{ documentKey: document.key, success: true }] });
    await Promise.all([first, second]); assert(!form());

  } finally {
    (Module as any)._load = originalLoad;
    (React as any).useState = originals.state; (React as any).useRef = originals.ref; (React as any).useMemo = originals.memo;
    (React as any).useCallback = originals.callback; (React as any).useEffect = originals.effect;
    setActiveLanguage('en');
  }
}
for (const locale of ['en', 'id'] as const) {
  setActiveLanguage(locale);
  assert.equal(formatActivityDescription('OUTPUT_DOCUMENTS_REVISION_REQUESTED', JSON.stringify({ object_type: 'OUTPUT_DOCUMENT', marked_file_count: 1 })), translate('fileRevision.auditRevision', { count: 1 }));
}
setActiveLanguage('en');
assert.equal(reviewRequestKey(input), reviewRequestKey({ ...input, file_revisions: [b, a] }));
void checkDialog().then(() => console.log('File markers, retained/removed/restored identities, receipts, actual confirmation handlers/cancel/failure/stale snapshot and EN/ID passed'))
  .catch(error => { console.error(error); process.exitCode = 1; });
