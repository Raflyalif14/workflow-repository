"""Real plan/PIC RPC tests only. Own isolated local PostgreSQL 16; no Phase34."""
import concurrent.futures
import json
import os
import subprocess
import sys
import time
sys.dont_write_bytecode = True
from local import LocalDatabase
from harness import HERE
from cases import u


def fixture(db, base):
    db.execute(f"""
insert into public.projects(id,name,customer,scenario_id,sales_id,status,selected_document_keys)
select {u(base)},'Synthetic plan','Synthetic customer',id,{u(1)},'DRAFT','["proposal_deck_solusi"]'::jsonb
from public.scenarios where name='Pra-Tender' and is_active;
insert into public.project_milestones(id,project_id,workflow_stage_id,name,step_order,status,start_date,duration_working_days,due_date)
select {u(base+1)},p.id,ws.id,'Synthetic proposal',1,'CREATED',current_date,1,current_date
from public.projects p join public.workflow_stages ws on ws.scenario_id=p.scenario_id and ws.stage_key='PROPOSAL_SOLUTION' where p.id={u(base)};
insert into public.project_plan_approvals(id,project_id,phase_id,requested_by,status)
select {u(base+2)},id,active_phase_id,{u(1)},'PENDING' from public.projects where id={u(base)};
""", 'synthetic pending plan')
    return int(db.execute(f'select pic_revision from public.projects where id={u(base)};'))


def review(base, revision, actor=3, pic=2, request=None, decision='APPROVED', note='null', approval=None):
    return f"select public.review_project_plan_pic_atomic({u(base)},{u(approval or base+2)},{u(actor)},'{decision}',{note},{u(pic)},{revision},{u(request or base+3)});"


def state(db, base):
    tables = ['projects','project_phases','project_milestones','project_plan_approvals','project_assignments','project_pic_requests','activity_logs','notifications']
    parts = []
    for table in tables:
        field = 'id' if table == 'projects' else 'project_id'
        parts.append(f"'{table}',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.{table} t where {field}={u(base)})")
    parts.append(f"'deliveries',(select coalesce(jsonb_agg(to_jsonb(d) order by d.id),'[]') from public.notification_deliveries d join public.notifications n on n.id=d.notification_id where n.project_id={u(base)})")
    return db.execute('select jsonb_build_object(' + ','.join(parts) + ');')


def rejected(db, command, code, prefix=''):
    result = db.process('set role service_role;' + prefix + command)
    assert result.returncode and ('ERROR:  ' + code in result.stderr or 'ERROR: ' + code in result.stderr), 'Unexpected SQLSTATE (raw server details not printed)'


def wait_lock(db, name):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        count = db.execute(f"select count(*) from pg_stat_activity where application_name='{name}' and wait_event_type='Lock' and cardinality(pg_blocking_pids(pid))>0;")
        if count == '1': return
        time.sleep(.05)
    raise AssertionError('Expected PostgreSQL lock wait was not observed')


def concurrent_replay(db, command):
    db.execute("""create function test_support.pause_plan() returns trigger language plpgsql as $$
begin if current_setting('test.plan_barrier',true)='on' and new.status='ACTIVE' and old.status='DRAFT' then perform pg_advisory_xact_lock(981234); end if; return new; end $$;
create trigger test_pause_plan before update on public.projects for each row execute function test_support.pause_plan();""")
    env = {k:v for k,v in os.environ.items() if not k.upper().startswith('PG')}
    db.verify()
    gate = subprocess.Popen([str(db.bin/'psql.exe'),'-X','-qAt','-h','127.0.0.1','-p',db.port,'-U','postgres','-d',db.name],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8', env=env, creationflags=subprocess.CREATE_NO_WINDOW)
    pool = concurrent.futures.ThreadPoolExecutor(3)
    try:
        gate.stdin.write("begin;select pg_advisory_xact_lock(981234);select 'READY';\n"); gate.stdin.flush()
        ready = pool.submit(lambda: [gate.stdout.readline(),gate.stdout.readline()])
        assert ready.result(timeout=10)[1].strip()=='READY'
        prefix = "set statement_timeout='15s';set lock_timeout='12s';begin;set local role service_role;"
        first = pool.submit(db.process, prefix + "set local application_name='plan-A';set local test.plan_barrier='on';" + command + 'commit;')
        wait_lock(db,'plan-A')
        second = pool.submit(db.process, prefix + "set local application_name='plan-B';" + command + 'commit;')
        wait_lock(db,'plan-B')
        gate.stdin.write('commit;\\q\n'); gate.stdin.flush()
        a,b = first.result(timeout=20),second.result(timeout=20)
        assert a.returncode==0 and b.returncode==0
        assert json.loads(a.stdout.strip())['replayed'] is False
        assert json.loads(b.stdout.strip())['replayed'] is True
    finally:
        if gate.poll() is None:
            try: gate.stdin.write('rollback;\\q\n'); gate.stdin.flush()
            except (BrokenPipeError,OSError): pass
        gate.communicate(timeout=20); pool.shutdown(wait=True)


def main():
    db = LocalDatabase()
    passed = []
    def ok(label): passed.append(label); print('PASS PostgreSQL: '+label,flush=True)
    try:
        print('Verified own PostgreSQL 16 data_directory/database, loopback-only random port; no user database or Docker operated',flush=True)
        db.prepare(); db.execute((HERE/'fixtures.sql').read_text(encoding='utf-8'),'synthetic fixtures')
        db.execute((HERE.parents[1]/'supabase'/'project-plan-pic-diagnostics.sql').read_text(encoding='utf-8'), 'read-only diagnostic query syntax')
        revision = fixture(db,601); before = state(db,601)
        rejected(db,review(601,revision,actor=2),'42501')
        rejected(db,review(601,revision,pic=6),'22023')
        rejected(db,review(601,revision+1),'40001')
        rejected(db,review(601,revision,approval=777),'40001')
        assert state(db,601)==before; ok('role/PIC/stale approval/revision denial without writes')
        rejected(db,review(601,revision),'23514',"set test.fail_action='PROJECT_PLAN_APPROVED';")
        assert state(db,601)==before; ok('injected final plan audit failure rolls back approval/PIC/milestones/history/intents/receipt')
        result=json.loads(db.execute('set role service_role;'+review(601,revision)))
        assert result['status']=='APPROVED' and result['project_status']=='ACTIVE' and result['replayed'] is False
        after=state(db,601)
        repeated=json.loads(db.execute('set role service_role;'+review(601,revision)))
        assert repeated['replayed'] is True and state(db,601)==after
        rejected(db,review(601,revision,note="'Changed request'"),'40001'); assert state(db,601)==after
        ok('atomic approve + PIC, lost-response same-request replay, conflicting payload refusal')
        for index,(in_app,telegram) in enumerate([(False,False),(False,True),(True,False),(True,True)]):
            base=700+index*10; revision=fixture(db,base)
            db.execute(f"insert into public.notification_preferences(user_id,in_app_enabled,telegram_enabled,telegram_chat_id) values({u(1)},{str(in_app).lower()},{str(telegram).lower()},'fixture-sink-sales'),({u(2)},{str(in_app).lower()},{str(telegram).lower()},'fixture-sink-sa') on conflict(user_id) do update set in_app_enabled=excluded.in_app_enabled,telegram_enabled=excluded.telegram_enabled,telegram_chat_id=excluded.telegram_chat_id;")
            db.execute('set role service_role;'+review(base,revision))
            counts=db.execute(f"select (select count(*) from public.notifications where project_id={u(base)}),(select count(*) from public.notifications where project_id={u(base)} and in_app_visible),(select count(*) from public.notification_deliveries d join public.notifications n on n.id=d.notification_id where n.project_id={u(base)});")
            assert counts==f'{2 if in_app or telegram else 0}|{2 if in_app else 0}|{2 if telegram else 0}'
        ok('plan/PIC notification insert succeeds for all four in-app/Telegram combinations; no external delivery')
        revision=fixture(db,801); db.execute('set role service_role;'+review(801,revision,decision='REJECTED',note="'Synthetic revision reason'"))
        assert db.execute(f"select status,pic_id is null,(select count(*) from public.project_assignments where project_id=p.id) from public.projects p where id={u(801)};")=='DRAFT|t|0'
        ok('reject stays DRAFT without PIC assignment')
        revision=fixture(db,901); concurrent_replay(db,review(901,revision))
        assert db.execute(f"select (select count(*) from public.project_pic_requests where project_id={u(901)}),(select count(*) from public.project_assignments where project_id={u(901)}),(select count(*) from public.activity_logs where project_id={u(901)} and action='PROJECT_PLAN_APPROVED');")=='1|1|1'
        ok('observed project lock contention across two sessions; one mutation/receipt/audit and one replay')
        print('PASS all '+str(len(passed))+' focused PostgreSQL groups; Phase34 not installed/retested',flush=True)
    finally:
        db.close(); print('Stopped and removed only owned test cluster',flush=True)


if __name__=='__main__': main()
