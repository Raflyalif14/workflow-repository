"""Approved plan scope tests against owned local PostgreSQL only."""
import concurrent.futures
import json
import re
import sys
sys.dont_write_bytecode=True
from local import LocalDatabase
from harness import HERE,MIGRATIONS
from cases import u


def main():
 db=LocalDatabase()
 try:
  db.prepare()
  for path in sorted(MIGRATIONS.glob('phase*.sql'),key=lambda p:p.name):
   number=int(re.match(r'phase(\d+)',path.name)[1])
   if 34<=number<=46 and not any(word in path.name for word in ['preflight','verify','transaction-test']):
    db.execute(path.read_text(encoding='utf-8'),path.name)
  db.execute((HERE/'fixtures.sql').read_text(encoding='utf-8'),'fixtures')
  db.execute(f"""
update public.project_milestones set status='CREATED';
insert into public.project_plan_approvals(project_id,phase_id,status,requested_by,reviewed_by,reviewed_at)
 select id,active_phase_id,'APPROVED',{u(1)},{u(3)},now() from public.projects where id={u(101)};
""")
  original=json.loads(db.execute(f"select to_json(array_agg(document_key order by document_key)) from public.project_output_documents where project_id={u(101)};"))
  mandatory=json.loads(db.execute("select to_json(array_agg(document_key order by document_key)) from public.output_document_stage_catalog where group_key='PRA_TENDER' and is_required;"))
  optional=next(key for key in original if key not in mandatory)
  new_key=db.execute("select document_key from public.output_document_stage_catalog where group_key='PRA_TENDER' and document_key not in ('assessment','proposal_deck_solusi') order by document_key limit 1;")
  day=db.execute("select (now() at time zone 'Asia/Jakarta')::date;")
  keys=sorted([key for key in original if key!=optional]+[new_key])
  payload={'selected_keys':keys,'additions':[{'key':new_key,'start_date':day,'duration_working_days':1,'due_date':day}],'reason':'Synthetic approved scope change'}
  def command(action,actor,request,payload,expected=True):
   body=json.dumps(payload).replace("'","''")
   return f"select public.mutate_approved_project_scope({u(101)},{u(actor)},'{action}','{body}'::jsonb,{u(request)},"+(f"(select updated_at from public.projects where id={u(101)})" if expected else "'2000-01-01'::timestamptz")+");"
  def expect(sql,code):
   result=db.process(sql)
   assert result.returncode and code in result.stderr,(code,result.stderr)
  expect(command('REQUEST',2,801,payload),'42501')
  expect(command('REQUEST',7,801,payload),'42501')
  expect(command('REQUEST',1,801,payload,False),'40001')
  row=json.loads(db.execute(command('REQUEST',1,801,payload),'request'))
  assert row['status']=='PENDING'
  assert json.loads(db.execute(f"select to_json(array_agg(document_key order by document_key)) from public.project_output_documents where project_id={u(101)};"))==original
  assert json.loads(db.execute(command('REQUEST',1,801,payload)))['id']==row['id']
  expect(command('REQUEST',1,802,payload),'55000')
  review={'change_id':row['id'],'note':''}
  expect(command('APPROVED',1,803,review),'42501')
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
   results=list(pool.map(lambda _:db.execute(command('APPROVED',3,803,review),'approve'),range(2)))
  assert all(json.loads(value)['status']=='APPROVED' for value in results)
  assert json.loads(db.execute(f"select to_json(array_agg(document_key order by document_key)) from public.project_output_documents where project_id={u(101)} and (is_required or is_selected);"))==keys
  assert db.execute(f"select count(*) from public.project_output_documents where project_id={u(101)} and document_key='{new_key}' and due_date='{day}';")=='1'
  # Do not remove a task that started while awaiting approval. The entire decision rolls back.
  reverse={'selected_keys':original,'additions':[{'key':optional,'start_date':day,'duration_working_days':1,'due_date':day}],'reason':'Synthetic reverse'}
  row2=json.loads(db.execute(command('REQUEST',1,804,reverse)))
  db.execute(f"update public.project_milestones set start_date='{day}',due_date='{day}',duration_working_days=1,status='IN_PROGRESS' where id in(select milestone_id from public.project_output_documents where project_id={u(101)} and document_key='{new_key}');")
  review2={'change_id':row2['id'],'note':''}
  expect(command('APPROVED',3,805,review2),'55000')
  assert db.execute(f"select status from public.project_scope_changes where id={u(804)};")=='PENDING'
  expect(command('REJECTED',3,806,review2),'22023')
  assert json.loads(db.execute(command('REJECTED',3,806,{**review2,'note':'Work already started'})))['status']=='REJECTED'
  expect(command('REQUEST',1,807,reverse),'55000')
  # Reset only synthetic work and create a removable item with linked history.
  db.execute("update public.project_milestones set status='CREATED';")
  db.execute(f"insert into public.notifications(user_id,type,title,message,project_id,milestone_id) select {u(2)},'TEST','Test','Synthetic history',project_id,milestone_id from public.project_output_documents where project_id={u(101)} and document_key='{new_key}';")
  row3=json.loads(db.execute(command('REQUEST',1,808,reverse)))
  expect(command('APPROVED',3,809,{'change_id':row3['id'],'note':''}),'55000')
  assert json.loads(db.execute(command('CANCELLED',1,810,{'change_id':row3['id'],'note':''})))['status']=='CANCELLED'
  missing={**payload,'selected_keys':[new_key],'additions':[]}
  expect(command('REQUEST',1,811,missing),'22023')
  for role in ['anon','authenticated']:
   expect(f"set role {role};select * from public.project_scope_changes;",'42501')
   expect(f"set role {role};"+command('REQUEST',1,812,payload),'42501')
  assert db.execute("select count(*) from public.activity_logs where action='PROJECT_SCOPE_APPROVED';")=='1'
  print('PASS real PostgreSQL: pending scope unchanged, owner/Head SA authorization, stale data, request/review replay, concurrent approval, output schedules, started-work rollback, history protection, cancellation, mandatory outputs and restricted access')
 finally:db.close()


if __name__=='__main__':main()
