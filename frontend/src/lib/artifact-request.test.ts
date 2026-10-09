import { strict as assert } from 'assert';
import { createArtifactRequests } from './artifact-request';
import { en } from '../i18n/en';
import { setActiveLanguage } from '../i18n';
import { formatActivityAction, formatActivityDescription } from './activity-timeline';
import { id } from '../i18n/id';

async function run() {
  let session='one', sequence=0;
  const request=createArtifactRequests(()=>session,()=>`request-${++sequence}`);
  const file=new File(['fixture'],'fixture.pdf');
  const attempts:string[]=[];
  const data=()=>{const form=new FormData();form.append('file',file);form.append('changelog','Fixture');return form;};
  await assert.rejects(request(data(),async receipt=>{attempts.push(receipt);throw new Error('Synthetic lost response');}));
  setActiveLanguage('id');
  await request(data(),async receipt=>{attempts.push(receipt);return true;});
  assert.equal(attempts[0],attempts[1],'Rebuilt FormData with the same immutable File retains receipt');
  await request(data(),async receipt=>{assert.notEqual(receipt,attempts[0],'Intentional repeat after success is new');});
  const ids:string[]=[];
  await assert.rejects(request({content:'fixture'},async receipt=>{ids.push(receipt);throw new Error('Synthetic failure');}));
  session='two';await request({content:'fixture'},async receipt=>{ids.push(receipt);return true;});
  assert.notEqual(ids[0],ids[1],'Account/session change discards the previous receipt');
  assert.deepEqual(Object.keys(en.artifactAudit).sort(),Object.keys(id.artifactAudit).sort());
  assert.equal(formatActivityAction('SUPPORTING_INPUT_ADDED'),id.artifactAudit.contribution);
  assert.equal(formatActivityDescription('DOCUMENT_APPROVED','DOCUMENT_APPROVED'),id.artifactAudit.approved);
  setActiveLanguage('en');
  assert.equal(formatActivityAction('DOCUMENT_APPROVED'),en.artifactAudit.approved);
  console.log('PASS artifact request retry, distinct successful intent, session isolation and EN/ID keys');
}
void run().catch(error=>{console.error(error);process.exitCode=1;});
