"""Behavioral SQL tests. All mutations execute against the verified test target."""
import concurrent.futures
import json
import subprocess
import time
from harness import Database


def u(n):
    return "'00000000-0000-4000-8000-%012d'::uuid" % n


def draft(output, revision, request, file=401, action='ADD', target=None, size=12):
    key = 'proposal_deck_solusi' if output == 301 else 'assessment'
    path = 'output-documents/00000000-0000-4000-8000-000000000101/' + key + '/00000000-0000-4000-8000-%012d-fixture.pdf' % file
    return (f"select * from public.mutate_project_output_document_draft({u(output)},{revision},{u(request)},'{action}',"
            f"{u(2)},{u(target) if target else 'null'},{u(file)},'fixture.pdf','{path}',{size},"
            f"'application/pdf',null,repeat('a',64));")


def submit(output, revision, request):
    return f"select * from public.submit_project_output_document_draft({u(output)},{revision},{u(request)},{u(2)},null);"


def sharing(mode, revision, request):
    return f"select public.set_project_document_sharing({u(3)},{u(101)},'{mode}',{revision},{u(request)});"


class Cases:
    def __init__(self, db):
        self.db = db
        self.passed = []

    def sql(self, command):
        return self.db.execute('set role service_role;\n' + command, 'fixture assertion')

    def reject(self, command, code, prefix=''):
        self.sql(prefix + f"select test_support.expect_error($command${command}$command$,'{code}');")

    def check(self, expression, label):
        self.sql(f"select test_support.check_true(({expression}),'{label}');")

    def state(self):
        tables = ['project_document_sharing','project_document_sharing_requests',
                  'project_output_document_files','project_output_document_draft_files',
                  'project_output_document_draft_requests','project_output_document_versions',
                  'project_output_document_version_files','project_output_file_revisions',
                  'project_output_review_requests','output_notification_outbox','activity_logs']
        parts = [f"'{t}',(select count(*) from public.{t})" for t in tables]
        parts += ["'outputs',(select jsonb_agg(to_jsonb(o) order by id) from public.project_output_documents o)",
                  "'sharing',(select jsonb_agg(to_jsonb(s)) from public.project_document_sharing s)"]
        return self.sql('select jsonb_build_object(' + ','.join(parts) + ');')

    def rollback(self, command, action, label):
        before = self.state()
        self.reject(command, '23514', f"set test.fail_action='{action}';")
        assert self.state() == before, label + ' must rollback every affected table and status'
        self.pass_case(label)

    def pass_case(self, label):
        self.passed.append(label)
        print('PASS PostgreSQL ' + label, flush=True)

    def wait_lock(self, application):
        end = time.monotonic() + 10
        while time.monotonic() < end:
            result = self.db.execute(f"select count(*) from pg_stat_activity where application_name='{application}' "
                                     "and wait_event_type='Lock' and cardinality(pg_blocking_pids(pid))>0;")
            if result == '1':
                return
            time.sleep(.05)
        raise AssertionError('Expected real PostgreSQL lock wait was not observed')

    def overlap(self, first, second, label, second_code=None):
        # Hold a separate advisory gate, after A has mutated but before COMMIT.
        # Observe actual lock waits; no elapsed-duration assertions.
        self.db.verify()
        t = self.db.target
        gate = subprocess.Popen(['docker','exec','-i',t['id'],'psql','-X','-qAt','-U','postgres','-d',t['database']],
                                stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        pool = concurrent.futures.ThreadPoolExecutor(2)
        try:
            gate.stdin.write('begin;select pg_advisory_xact_lock(87654321);\\echo GATE_READY\n')
            gate.stdin.flush()
            # Bound the readiness barrier as well as the database statement waits.
            read = pool.submit(lambda: [gate.stdout.readline(),gate.stdout.readline()])
            assert read.result(timeout=10)[1].strip() == 'GATE_READY'
            prefix = "set statement_timeout='15s';set lock_timeout='12s';begin;set local role service_role;"
            a = pool.submit(self.db.process, prefix + "set application_name='fixture-A';" + first +
                            'select pg_advisory_xact_lock(87654321);commit;')
            self.wait_lock('fixture-A')
            b = pool.submit(self.db.process, prefix + "set application_name='fixture-B';" + second + 'commit;')
            self.wait_lock('fixture-B')
            gate.stdin.write('commit;\\q\n');gate.stdin.flush()
            ra, rb = a.result(timeout=20), b.result(timeout=20)
            assert ra.returncode == 0, label + ': first operation failed'
            if second_code:
                assert rb.returncode != 0 and second_code in rb.stderr, label + ': wrong conflict result'
            else:
                assert rb.returncode == 0, label + ': replay failed'
        finally:
            if gate.poll() is None:
                try: gate.stdin.write('rollback;\\q\n');gate.stdin.flush()
                except (BrokenPipeError,OSError): pass
            gate.communicate(timeout=20)
            pool.shutdown(wait=True)

    def sharing_cases(self):
        self.rollback(sharing('SHARED_INTERNAL',0,501),'DOCUMENT_ACCESS_CHANGED','sharing audit rollback')
        for actor in [1,2,5,6,7]:
            self.reject(f"select public.set_project_document_sharing({u(actor)},{u(101)},'SHARED_INTERNAL',0,{u(550+actor)});",'42501')
        self.db.execute("set role authenticated;select test_support.expect_error($c$" + sharing('SHARED_INTERNAL',0,560) + "$c$,'42501');")
        self.sql(sharing('SHARED_INTERNAL',0,501))
        before = self.state();self.sql(sharing('SHARED_INTERNAL',0,501));assert before == self.state()
        self.reject(sharing('RESTRICTED',0,501),'40001')
        self.sql(sharing('SHARED_INTERNAL',1,502))
        self.check("(select revision=1 from public.project_document_sharing)", 'sharing no-op revision')
        self.check("(select count(*)=1 from public.activity_logs where action='DOCUMENT_ACCESS_CHANGED')", 'sharing no-op audit')
        self.sql(sharing('RESTRICTED',1,503))
        self.overlap(sharing('SHARED_INTERNAL',2,504),sharing('RESTRICTED',2,505),'sharing competing CAS','40001')
        self.check("(select revision=3 and access_mode='SHARED_INTERNAL' from public.project_document_sharing)", 'sharing CAS winner')
        self.overlap(sharing('RESTRICTED',3,506),sharing('RESTRICTED',3,506),'sharing concurrent receipt replay')
        self.check("(select count(*)=5 from public.project_document_sharing_requests)", 'sharing receipt uniqueness')
        self.check("(select count(*)=4 from public.activity_logs where action='DOCUMENT_ACCESS_CHANGED')", 'sharing audit uniqueness')
        self.pass_case('sharing role/client denial, no-op, replay and overlapping CAS')

    def output_cases(self, submitted=False):
        if not submitted:
            self.sql(draft(301,0,601,401));self.sql(draft(301,1,602,402))
            self.sql(draft(301,2,603,action='REMOVE',target=402));self.sql(draft(301,3,604,403))
            before = self.state();self.sql(draft(301,3,604,403));assert before == self.state()
            self.check("(select count(*)=0 from public.project_output_document_versions)", 'draft no history')
            self.rollback(draft(301,4,605,405),'OUTPUT_DRAFT_ADD','draft registry/receipt/audit rollback')
            self.rollback(submit(301,4,606),'OUTPUT_DOCUMENTS_SUBMITTED','submit snapshot/ref/intent/audit rollback')
            self.sql(submit(301,4,606))
        before = self.state();self.sql(submit(301,4,606));assert before == self.state()
        version = self.sql(f"select current_version_id from public.project_output_documents where id={u(301)};")
        version_sql = "'" + version + "'::uuid"
        self.check(f"(select count(*)=2 from public.project_output_document_version_files where version_id={version_sql})", 'snapshot contains both files')
        revision = int(self.sql(f"select draft_revision from public.project_output_documents where id={u(301)};"))
        self.reject(draft(301,revision,607,407),'22023')
        for command in [f"update public.project_output_document_files set file_name='changed.pdf' where id={u(401)};",
                        f"delete from public.project_output_document_version_files where version_id={version_sql};",
                        f"update public.project_output_document_versions set version_number=99 where id={version_sql};"]:
            self.reject(command,'22023')
        markers = json.dumps([{'file_id':'00000000-0000-4000-8000-000000000401','feedback':'Fixture revision'}])
        review = f"select * from public.review_project_output_document_snapshot({u(301)},{version_sql},{u(608)},'REVISE',{u(3)},null,'{markers}'::jsonb);"
        self.rollback(review,'OUTPUT_DOCUMENTS_REVISION_REQUESTED','review marker/status/receipt/intent/audit rollback')
        self.sql(review);before=self.state();self.sql(review);assert before==self.state()
        self.check(f"(select count(*)=1 from public.project_output_file_revisions where version_id={version_sql} and file_id={u(401)})", 'only chosen file marked')
        self.reject(submit(301,revision,609),'22023')
        self.sql(draft(301,revision,610,410,'REPLACE',401))
        self.sql(submit(301,revision+1,611))
        self.check(f"(select count(*)=2 from public.project_output_document_version_files where version_id={version_sql})", 'historical refs unchanged')
        self.check(f"exists(select 1 from public.project_output_document_draft_files where file_id={u(403)})", 'unmarked file retained')
        self.reject(f"select * from public.review_project_output_document_snapshot({u(301)},{version_sql},{u(612)},'APPROVE',{u(3)},null,'[]');",'40001')
        current = self.sql(f"select current_version_id from public.project_output_documents where id={u(301)};")
        self.sql(f"select * from public.review_project_output_document_snapshot({u(301)},'{current}',{u(613)},'APPROVE',{u(3)},null,'[]');")
        self.pass_case('multi-file history, snapshot immutability, marker gate, unchanged files, stale review and replay')

    def output_concurrency(self):
        self.overlap(draft(302,0,701,701),draft(302,0,702,702),'draft competing CAS','40001')
        self.check(f"(select draft_revision=1 from public.project_output_documents where id={u(302)})", 'draft CAS winner')
        self.overlap(submit(302,1,703),submit(302,1,703),'concurrent snapshot receipt replay')
        self.check(f"(select count(*)=1 from public.project_output_document_versions where output_document_id={u(302)})", 'one snapshot')
        version = self.sql(f"select current_version_id from public.project_output_documents where id={u(302)};")
        review = f"select * from public.review_project_output_document_snapshot({u(302)},'{version}',{u(704)},'APPROVE',{u(3)},null,'[]');"
        self.overlap(review,review,'concurrent review receipt replay')
        self.check(f"(select count(*)=1 from public.project_output_review_requests where output_document_id={u(302)})", 'one review receipt')
        self.check(f"(select count(*)=1 from public.activity_logs where action='OUTPUT_DOCUMENTS_APPROVED' and description::jsonb->>'object_id'={u(302)}::text)", 'one review audit')
        self.check("not exists(select 1 from public.output_notification_outbox group by output_document_id,version_id,event_status,recipient_user_id having count(*)>1)", 'no duplicated notification intents')
        self.pass_case('overlapping draft CAS, submit and review receipts')

    def access_cases(self):
        self.sql(sharing('SHARED_INTERNAL',4,801))
        for actor in [1,2,3,4,5,7]:
            self.check(f"(select count(*)=2 from public.list_document_repository_access({u(actor)},'OUTPUT') where approved)", 'shared approved read')
        self.check(f"(select count(*)=0 from public.list_document_repository_access({u(6)},'OUTPUT'))", 'inactive denied')
        self.sql(sharing('RESTRICTED',5,802))
        self.db.execute(f"insert into public.document_repository_access(id,source_type,project_id,output_document_id,access_mode) values({u(850)},'OUTPUT',{u(101)},{u(301)},'SHARED_INTERNAL');"
                        f"insert into public.document_repository_grants(access_id,user_id) values({u(850)},{u(5)});")
        self.check(f"(select count(*)=0 from public.list_document_repository_access({u(5)},'OUTPUT'))", 'old grants ignored')
        for actor in [1,2,3,4]:
            self.check(f"(select count(*)=2 from public.list_document_repository_access({u(actor)},'OUTPUT') where approved)", 'native read retained')
        self.sql(sharing('SHARED_INTERNAL',6,803))
        self.pass_case('actual centralized sharing reader, native roles, inactive denial and retired legacy grants')

    def phase_access(self, completed=False):
        if not completed:
            self.sql(f"select * from public.complete_phase_sa_milestone({u(201)},{u(3)},false);"
                     f"select * from public.complete_phase_sa_milestone({u(202)},{u(3)},false);"
                     f"select public.finish_project_phase({u(101)},(select active_phase_id from public.projects where id={u(101)}),{u(3)});")
            before = self.state()
            self.sql(f"select * from public.complete_phase_sa_milestone({u(202)},{u(3)},false);")
            assert self.state() == before, 'Completion replay must not duplicate audit'
        self.sql(f"select * from public.continue_project_tender_phase({u(101)},{u(1)},array[]::text[]);")
        self.check(f"(select count(*)=2 from public.project_phases where project_id={u(101)})", 'two retained phases')
        self.check(f"(select count(*)=2 from public.list_document_repository_access({u(5)},'OUTPUT') where approved)", 'old phase results retained and new drafts private')
        output = self.sql(f"select id from public.project_output_documents where project_id={u(101)} and document_key='proposal_teknis';")
        path = 'output-documents/00000000-0000-4000-8000-000000000101/proposal_teknis/00000000-0000-4000-8000-000000000901-fixture.pdf'
        # A privileged synthetic Approved fixture tests only repository validity,
        # not tender-plan approval or the Storage transfer of these metadata.
        self.db.execute(f"begin;insert into public.project_output_document_files(id,output_document_id,project_id,file_name,storage_path,file_size,mime_type,content_sha256,uploaded_by) "
                        f"values({u(901)},'{output}',{u(101)},'fixture.pdf','{path}',12,'application/pdf',repeat('b',64),{u(2)});"
                        f"insert into public.project_output_document_versions(id,output_document_id,project_id,version_number,status,file_name,storage_path,file_size,mime_type,uploaded_by,uploaded_at,snapshot_kind,submitted_draft_revision,submission_request_id,submission_actor_id) "
                        f"values({u(903)},'{output}',{u(101)},1,'APPROVED','fixture.pdf','{path}',12,'application/pdf',{u(2)},now(),'SUBMITTED',0,{u(904)},{u(2)});"
                        f"select set_config('workflow.output_snapshot_id',{u(903)}::text,true);"
                        f"insert into public.project_output_document_version_files(version_id,output_document_id,project_id,file_id,position) values({u(903)},'{output}',{u(101)},{u(901)},1);"
                        f"update public.project_output_documents set status='APPROVED',current_version_id={u(903)} where id='{output}';commit;")
        self.check(f"(select count(*)=3 from public.list_document_repository_access({u(5)},'OUTPUT') where approved)", 'future Approved follows project sharing across phases')
        self.check(f"not exists(select 1 from public.list_document_repository_access({u(5)},'OUTPUT') where not approved or project_access)", 'sharing does not grant private project access')
        self.sql(sharing('RESTRICTED',7,905))
        self.check(f"(select count(*)=0 from public.list_document_repository_access({u(5)},'OUTPUT'))", 'revoke applies across both phases')
        self.check(f"(select count(*)=2 from public.project_output_document_versions where output_document_id={u(301)})", 'historical snapshots retained')
        self.pass_case('completion replay and cross-phase/future Approved sharing, draft privacy and revocation')

    def upload_outcome(self):
        path = self.sql(f"select storage_path from public.project_output_document_files where id={u(401)};")
        self.check(f"public.record_output_upload_outcome({u(101)},{u(301)},{u(2)},'{path}',true) is null", 'referenced historic file protected from cleanup')
        path = 'output-documents/00000000-0000-4000-8000-000000000101/proposal_deck_solusi/00000000-0000-4000-8000-000000000999-fixture.pdf'
        self.sql(f"select public.record_output_upload_outcome({u(101)},{u(301)},{u(2)},'{path}',true);"
                 f"select public.record_output_upload_outcome({u(101)},{u(301)},{u(2)},'{path}',false);")
        self.check("(select count(*)=1 from public.project_deletion_cleanups where status='PENDING' and failure_code='OUTPUT_UPLOAD_UNCONFIRMED')", 'uncertainty replay stays pending, not retryable')
        self.pass_case('Phase23 historical reference protection and uncertainty receipt replay')

    def official_and_actor_policy(self):
        before = self.state()
        self.db.execute(f"update public.users set is_active=false where id={u(3)};")
        try:
            self.reject(sharing('SHARED_INTERNAL',8,950),'42501')
            assert self.state() == before, 'Inactive manager must perform zero writes'
        finally:
            self.db.execute(f"update public.users set is_active=true where id={u(3)};")
        self.db.execute("set role anon;select test_support.expect_error($c$" + sharing('SHARED_INTERNAL',8,950) + "$c$,'42501');")
        self.check(f"not exists(select 1 from public.list_document_repository_access({u(4)},'OUTPUT') where not approved)", 'admin cannot read non-final output')
        self.db.execute(f"insert into public.documents(id,project_id,title,category,status) values"
                        f"({u(910)},{u(101)},'Fixture','OTHER','APPROVED'),({u(911)},{u(101)},'Fixture','OTHER','DRAFT');"
                        f"insert into public.document_versions(document_id,version_number,file_name,storage_path,file_size,mime_type,status,uploaded_by) values"
                        f"({u(910)},1,'fixture.pdf','fixture/official-approved',12,'application/pdf','APPROVED',{u(2)}),"
                        f"({u(911)},1,'fixture.pdf','fixture/official-draft',12,'application/pdf','DRAFT',{u(2)});")
        self.sql(sharing('SHARED_INTERNAL',8,950))
        self.check(f"(select count(*)=1 from public.list_document_repository_access({u(5)},'OFFICIAL'))", 'only valid official Approved shared')
        self.sql(sharing('RESTRICTED',9,951))
        self.check(f"(select count(*)=0 from public.list_document_repository_access({u(5)},'OFFICIAL'))", 'official revoke')
        self.check(f"(select count(*)=1 from public.list_document_repository_access({u(1)},'OFFICIAL'))", 'official Sales ownership retained')
        self.pass_case('official Approved sharing/revoke, inactive manager, anonymous RPC and admin non-final denial')

    def creation_receipts(self):
        # The manifest contains synthetic file metadata; START/STORED confirmations
        # simulate backend Storage verification. No Storage transfer is performed.
        self.db.execute("create table test_support.creation_input(payload jsonb,plan jsonb);grant select on test_support.creation_input to service_role;"
            "with s as(select * from public.scenarios where name='Pra-Tender' and is_active),"
            "o as(select document_key,stage_key,is_required from public.output_document_stage_catalog where document_key='proposal_deck_solusi') "
            "insert into test_support.creation_input select jsonb_build_object('name','Fixture create','customer','Fixture',"
            "'scenario_id',s.id,'estimated_revenue',100,'selected_keys',jsonb_build_array(o.document_key),'attachments',"
            "jsonb_build_array(jsonb_build_object('kind','MOM','name','fixture.pdf','mime','application/pdf','size',12,'sha256',repeat('a',64)),"
            "jsonb_build_object('kind','PHOTO','name','fixture.png','mime','image/png','size',12,'sha256',repeat('b',64)))),"
            "jsonb_build_object('scenario',jsonb_build_object('id',s.id,'name',s.name,'workflow_model',s.workflow_model,'workflow_version',s.workflow_version),"
            "'stages',(select jsonb_agg(jsonb_build_object('id',id,'name',name,'description',description,'step_order',step_order,'stage_key',stage_key,'default_role',default_role) order by step_order) "
            "from public.workflow_stages where scenario_id=s.id and is_active),'selected_keys',jsonb_build_array(o.document_key),"
            "'outputs',jsonb_build_array(jsonb_build_object('document_key',o.document_key,'stage_key',o.stage_key,'is_required',o.is_required,'title','Fixture')),"
            "'milestones',(select jsonb_agg(jsonb_build_object('workflow_stage_id',id,'step_order',1,'status','CREATED')) "
            "from public.workflow_stages where scenario_id=s.id and is_active and stage_key=o.stage_key and default_role='SA')) from s cross join o;")

        def operation(name, lease='null', ordinal='null', actor=1, fingerprint="repeat('c',64)"):
            supplied = name in ('CLAIM','LOOKUP')
            payload = '(select payload from test_support.creation_input)' if supplied else 'null'
            plan = '(select plan from test_support.creation_input)' if name == 'CLAIM' else 'null'
            return f"select public.project_creation_operation({u(actor)},{u(980)},{fingerprint},'{name}',{payload},{plan},{lease},{ordinal});"

        self.overlap(operation('CLAIM'),operation('CLAIM'),'concurrent creation claim')
        self.check(f"(select count(*)=1 from public.project_creation_requests where request_id={u(980)})", 'one creation reservation')
        self.check(f"(select count(*)=2 from public.project_creation_files where request_id={u(980)})", 'one manifest')
        first = self.sql(f"select lease_token from public.project_creation_requests where request_id={u(980)};")
        self.reject(operation('CLAIM',actor=7),'42501')
        self.reject(operation('CLAIM',fingerprint="repeat('d',64)"),'40001')
        self.db.execute(f"update public.project_creation_requests set lease_until=clock_timestamp()-interval '1 minute' where request_id={u(980)};")
        current = json.loads(self.sql(operation('CLAIM')))
        lease = "'" + current['lease'] + "'::uuid"
        self.reject(operation('START_FILE',"'"+first+"'::uuid",0),'55P03')
        for ordinal in [0,1]:
            self.sql(operation('START_FILE',lease,ordinal));self.sql(operation('STORED_FILE',lease,ordinal))
        commit = operation('COMMIT',lease)
        before = self.state()
        self.reject(commit,'23514',"set test.fail_action='PROJECT_CREATED';")
        assert before == self.state(), 'Creation audit failure rolls back project/phase/milestone/output/audit'
        self.check(f"(select status='PROCESSING' from public.project_creation_requests where request_id={u(980)})", 'failed commit receipt remains uncommitted')
        self.overlap(commit,commit,'concurrent creation commit replay')
        project = "(select project_id from public.project_creation_requests where request_id="+u(980)+")"
        for table, expected in [('projects',1),('project_phases',1),('project_milestones',1),('project_output_documents',1),('project_intake_attachments',2)]:
            field = 'id' if table == 'projects' else 'project_id'
            self.check(f"(select count(*)={expected} from public.{table} where {field}={project})", 'atomic creation '+table)
        self.check(f"(select count(*)=1 from public.activity_logs where project_id={project} and action='PROJECT_CREATED')", 'one creation audit')
        self.check(f"(select status='COMMITTED' from public.project_creation_requests where request_id={u(980)})", 'committed receipt')
        before = self.state();self.sql(operation('COMMIT',lease));assert before==self.state()
        self.sql(f"select * from public.delete_project_with_cleanup({project},'Fixture create',{u(4)});")
        self.reject(operation('LOOKUP'),'P0002')
        self.check(f"(select status='COMMITTED' from public.project_creation_requests where request_id={u(980)})", 'deletion tombstone retained')
        self.pass_case('Phase31 concurrent claim/fencing, audit rollback, commit replay and deletion tombstone')

    def run(self):
        self.sharing_cases()
        self.output_cases()
        self.output_concurrency()
        self.access_cases()
        self.phase_access()
        self.upload_outcome()
        self.official_and_actor_policy()
        self.creation_receipts()
