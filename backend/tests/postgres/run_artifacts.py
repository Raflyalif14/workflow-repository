"""Focused Phase34 tests only; reuse existing isolated PostgreSQL harness."""
import json
import sys
import time
sys.dont_write_bytecode = True
from harness import Database, HERE, docker
from cases import Cases, u


def main():
    db = Database()
    try:
        until = time.monotonic() + 30
        while docker('exec', db.target['id'], 'pg_isready', '-U', 'postgres', '-d', db.target['database']).returncode:
            if time.monotonic() > until:
                raise RuntimeError('Owned test database readiness timeout')
            time.sleep(.1)
        db.prepare()
        db.execute((HERE / 'fixtures.sql').read_text(encoding='utf-8'), 'synthetic fixtures')
        c = Cases(db)
        def command(op, request, payload, step='COMMIT', token=None, actor=1):
            data = json.dumps(payload).replace("'", "''")
            return f"select public.mutate_official_artifact({u(actor)},{u(request)},'{op}','{data}'::jsonb,'{step}',{repr(token)+'::uuid' if token else 'null'});"
        def call(*args, **kwargs):
            return json.loads(c.sql(command(*args, **kwargs)))
        def state():
            tables = ['documents','document_versions','document_version_approvals','document_comments',
                      'milestone_contributions','milestone_contribution_attachments','artifact_mutation_requests','activity_logs']
            expressions = [f"'{t}',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.{t} t)" for t in tables]
            return db.execute('select jsonb_build_object('+','.join(expressions)+');')
        def fail(op, request, payload, action, token=None, actor=1):
            before = state()
            c.reject(command(op,request,payload,token=token,actor=actor),'23514',f"set test.fail_action='{action}';")
            assert state() == before, action + ' atomic rollback'
        db.execute(f"""insert into public.documents(id,project_id,milestone_id,title,category,status)
          values({u(800)},{u(101)},{u(201)},'Fixture official','OTHER','APPROVED');
          insert into public.document_versions(id,document_id,version_number,file_name,storage_path,file_size,mime_type,changelog,status,uploaded_by)
          values({u(801)},{u(800)},1,'fixture.pdf','synthetic-initial',12,'application/pdf','Initial SALES milestone document upload.','APPROVED',{u(1)});""")
        if '--cleanup-only' in sys.argv:
            # Additional check only: do not repeat previously passed behavior groups.
            db.execute(f"""insert into public.artifact_mutation_requests(request_id,actor_id,project_id,operation,payload,manifest,object_id,status,result)
              values({u(890)},{u(1)},{u(101)},'COMMENT','{{}}','[]',{u(800)},'COMMITTED','{{}}'),
              ({u(891)},{u(1)},{u(101)},'CONTRIBUTION','{{}}','[{{"path":"synthetic-reserved-owned"}}]',{u(201)},'RESERVED',null);""")
            c.reject(f"select * from public.delete_project_with_cleanup({u(101)},'Fixture',{u(6)});",'42501')
            c.check(f"(select count(*)=1 from public.projects where id={u(101)})",'denied delete leaves project')
            c.sql(f"select * from public.delete_project_with_cleanup({u(101)},'Fixture',{u(4)});")
            c.check("(select (dependency_counts->>'artifact_mutation_requests')::int=2 and storage_paths @> '[\"synthetic-reserved-owned\"]'::jsonb from public.project_deletion_cleanups)",'all receipts and exact owned paths counted')
            c.check(f"(select status='FROZEN' from public.artifact_mutation_requests where request_id={u(891)})",'delete freezes reservation')
            print('PASS additional cleanup receipt count, authorization and fencing',flush=True)
            return
        timestamp = db.execute(f"select updated_at from public.documents where id={u(800)};")
        file = {'name':'fixture.pdf','size':12,'mime':'application/pdf','sha256':'a'*64}
        payload = {'document_id':str(u(800)[1:37]),'changelog':'Version two','expected_updated_at':timestamp,'files':[file]}
        for actor in [2,5,6,7,4]:
            before=state();c.reject(command('VERSION',810+actor,payload,'RESERVE',actor=actor),'42501');assert state()==before
        reserve = call('VERSION',810,payload,'RESERVE')
        assert reserve['files'][0]['path'].endswith('-fixture.pdf')
        assert db.execute("select public.artifact_storage_filename('long name.PDF')='long_name.pdf';")== 't'
        fail('VERSION',810,payload,'DOCUMENT_VERSION_UPLOADED',reserve['token'])
        c.overlap(command('VERSION',810,payload,token=reserve['token']), command('VERSION',810,payload,token=reserve['token']), 'official version concurrent replay')
        result = call('VERSION',810,payload)['result']
        c.check(f"(select count(*)=2 from public.document_versions where document_id={u(800)})",'one new version')
        c.check("(select count(*)=1 from public.activity_logs where action='DOCUMENT_VERSION_UPLOADED')",'one version audit')
        c.check("(select business_audit->'before'->>'status'='APPROVED' and business_audit->'after'->>'status'='SUBMITTED' from public.activity_logs where action='DOCUMENT_VERSION_UPLOADED')",'server before after')
        c.pass_case('official version rollback, permission and concurrent receipt replay')
        current=db.execute(f"select updated_at from public.documents where id={u(800)};")
        review={'version_id':result['versionId'],'status':'APPROVED','feedback':'Fixture review','expected_updated_at':current}
        fail('REVIEW',820,review,'DOCUMENT_APPROVED',actor=3)
        c.reject(command('REVIEW',821,review,actor=2),'42501')
        before=state();c.reject(command('REVIEW',822,{**review,'expected_updated_at':timestamp},actor=3),'40001');assert state()==before
        c.overlap(command('REVIEW',820,review,actor=3),command('REVIEW',820,review,actor=3),'review concurrent replay')
        c.reject(command('REVIEW',823,{**review,'status':'REJECTED'},actor=3),'40001')
        c.pass_case('review rollback, stale decision and concurrent replay')
        comment={'document_id':str(u(800)[1:37]),'content':'Synthetic comment'}
        fail('COMMENT',830,comment,'DOCUMENT_COMMENT_ADDED')
        call('COMMENT',830,comment);before=state();call('COMMENT',830,comment);assert state()==before
        c.reject(command('COMMENT',831,comment,actor=5),'42501')
        c.pass_case('comment atomic audit and receipt replay')
        contribution={'milestone_id':str(u(201)[1:37]),'note':'Synthetic context','files':[file,file]}
        reserve=call('CONTRIBUTION',840,contribution,'RESERVE')
        fail('CONTRIBUTION',840,contribution,'SUPPORTING_INPUT_ADDED',reserve['token'])
        c.check('(select count(*)=0 from public.milestone_contributions)','no partial contribution')
        c.reject(command('CONTRIBUTION',841,contribution,'RESERVE',actor=7),'42501')
        c.overlap(command('CONTRIBUTION',840,contribution,token=reserve['token']),command('CONTRIBUTION',840,contribution,token=reserve['token']),'contribution concurrent replay')
        result=call('CONTRIBUTION',840,contribution)['result']
        c.check('(select count(*)=1 from public.milestone_contributions)','one complete contribution')
        c.check('(select count(*)=2 from public.milestone_contribution_attachments)','all contribution attachments')
        c.pass_case('contribution create rollback, complete manifest and concurrent replay')
        promotion={'milestone_id':str(u(201)[1:37]),'contribution_id':result['contribution']['id'],'attachment_id':result['attachments'][0]['id']}
        reserve=call('PROMOTE',850,promotion,'RESERVE',actor=3)
        c.reject(command('PROMOTE',851,promotion,'RESERVE',actor=3),'23505')
        c.reject(command('PROMOTE',852,promotion,'RESERVE',actor=2),'42501')
        fail('PROMOTE',850,promotion,'SUPPORTING_DOCUMENT_PROMOTED',reserve['token'],3)
        c.check('(select count(*)=1 from public.documents)','no partial promoted document')
        c.check("(select bool_and(promotion_status='NOT_PROMOTED') from public.milestone_contribution_attachments)",'no partial promotion state')
        c.overlap(command('PROMOTE',850,promotion,token=reserve['token'],actor=3),command('PROMOTE',850,promotion,token=reserve['token'],actor=3),'promotion concurrent replay')
        c.check("(select count(*)=1 from public.activity_logs where action='SUPPORTING_DOCUMENT_PROMOTED')",'one promotion audit')
        before=state();again=call('PROMOTE',853,promotion,'RESERVE',actor=4);assert again['result']['idempotent'] and state()==before
        c.pass_case('promotion rollback, natural idempotency and worker exclusion')
        frozen=call('CONTRIBUTION',860,contribution,'RESERVE')
        c.reject(command('CONTRIBUTION',860,contribution,token=str(u(999)[1:37])),'42501')
        c.overlap(command('CONTRIBUTION',860,contribution,'CANCEL',frozen['token']),command('CONTRIBUTION',860,contribution,token=frozen['token']),'cancel fences late commit','55000')
        c.check("(select count(*)=1 from public.milestone_contributions)",'cancel preserves successful request')
        c.pass_case('exact-path cancellation fences late metadata commit')
        restarted=call('CONTRIBUTION',860,contribution,'RESERVE')
        assert restarted['token']!=frozen['token'] and restarted['files']!=frozen['files']
        c.reject(command('CONTRIBUTION',860,contribution,token=frozen['token']),'42501')
        call('CONTRIBUTION',860,contribution,token=restarted['token'])
        c.check("(select jsonb_array_length(retired_manifest)=2 from public.artifact_mutation_requests where request_id="+u(860)+")",'retry retains old exact paths')
        c.pass_case('failed upload retry rotates token and paths while retaining recovery evidence')
        # A committed operation must never return cleanup authority, even after a lost response.
        assert call('CONTRIBUTION',840,contribution,'CANCEL',reserve.get('token'))['state']=='COMMITTED'
        c.check("not has_function_privilege('authenticated','public.mutate_official_artifact(uuid,uuid,text,jsonb,text,uuid)','EXECUTE')",'private RPC')
        c.check("not has_table_privilege('service_role','public.artifact_mutation_requests','INSERT,UPDATE,DELETE')",'no direct receipt writers')
        # An active reservation is captured by the existing exact-path deletion receipt.
        waiting=call('CONTRIBUTION',870,contribution,'RESERVE')
        deletion=c.sql(f"select row_to_json(r) from public.delete_project_with_cleanup({u(101)},'Fixture',{u(4)}) r;")
        cleanup=json.loads(deletion)
        assert all(f['path'] in cleanup['storage_paths'] for f in waiting['files']+frozen['files']+restarted['files'])
        c.check("(select status='FROZEN' from public.artifact_mutation_requests where request_id="+u(870)+")",'delete fences active upload')
        c.reject(command('CONTRIBUTION',870,contribution,token=waiting['token']),'P0002')
        c.pass_case('deletion captures current and retired exact paths without permitting late attach')
        print('PASS focused Phase34 PostgreSQL groups: '+str(len(c.passed)),flush=True)
    finally:
        db.close()
        print('CLEANED only owned ephemeral PostgreSQL container',flush=True)


if __name__=='__main__': main()
