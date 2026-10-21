import assert from 'node:assert/strict';
import { emptyProjectForm, hasProjectFormValues, isProjectFormDraft, type ProjectFormDraft } from './project-form-draft';
import { createProjectCreateRequest } from './project-create-request';

async function run() {
  const file = new File(['same bytes'], 'mom.pdf', { type: 'application/pdf', lastModified: 1234 });
  const values = { ...emptyProjectForm(), name: ' Project ', customer: 'Customer', scenarioId: 'scenario', estimatedRevenue: '0',
    mom: file, photos: [new File(['photo'], 'photo.png', { type: 'image/png' })] };
  assert(!hasProjectFormValues(emptyProjectForm()));
  assert(hasProjectFormValues({ ...emptyProjectForm(), estimatedRevenue: '0' }));
  assert(hasProjectFormValues({ ...emptyProjectForm(), mom: file }));
  const requestId = '00000000-0000-4000-8000-000000000001';
  const draft: ProjectFormDraft = { version: 1, accountId: 'sales-a', revision: requestId, savedAt: Date.now(), values,
    submission: { requestId, selectedDocumentKeys: ['proposal_deck_solusi'] } };
  assert(isProjectFormDraft(draft, 'sales-a'));
  for (const malformed of [null, {}, { ...draft, version: 2 }, { ...draft, accountId: 'sales-b' }, { ...draft, revision: 'wrong' },
    { ...draft, submission: null }, { ...draft, submission: { requestId: 'bad', selectedDocumentKeys: [] } },
    { ...draft, values: { ...values, photos: Array(11).fill(file) } }, { ...draft, values: { ...values, mom: { name: 'fake.pdf' } } },
    { ...draft, values: { ...values, estimatedRevenue: 12 } }]) assert(!isProjectFormDraft(malformed, 'sales-a'));
  const input = { name: values.name, customer: values.customer, scenario_id: values.scenarioId, estimated_revenue: 0,
    mom: values.mom, photos: values.photos, selectedDocumentKeys: draft.submission!.selectedDocumentKeys, creationRequestId: requestId };
  const beforeReload = createProjectCreateRequest();
  await assert.rejects(() => beforeReload.run(input, async (_body, id) => { assert.equal(id, requestId); throw new Error('Lost response'); }));
  const afterReload = createProjectCreateRequest();
  const restoredFiles = { ...input, mom: new File([file], file.name, { type: file.type, lastModified: file.lastModified }) };
  const result = await afterReload.run(restoredFiles, async (body, id) => {
    assert.equal(id, requestId, 'Reload must reuse the durable creation operation');
    assert.equal(await (body.get('mom') as File).text(), 'same bytes');
    assert.equal(body.get('creationRequestId'), null, 'Recovery metadata only belongs in the request header');
    return { id: 'same-project' };
  });
  assert.equal(result.id, 'same-project');
  await assert.rejects(() => createProjectCreateRequest().run({ ...input, creationRequestId: 'invalid' }, async () => ({})), /Invalid creation operation/);
  console.log('Form draft: account/schema validation, malformed files, empty form, durable request ID and same-byte retry after reload passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
