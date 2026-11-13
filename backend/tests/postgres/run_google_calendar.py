"""Google Calendar storage/access integration tests on owned local PostgreSQL only."""
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
   if 34<=number<=47 and not any(word in path.name for word in ['preflight','verify','transaction-test']):
    db.execute(path.read_text(encoding='utf-8'),path.name)
  db.execute((HERE/'fixtures.sql').read_text(encoding='utf-8'),'fixtures')
  db.execute(f"""
insert into public.project_meetings(id,project_id,title,starts_at,ends_at,status,requested_by)
values ({u(801)},{u(101)},'Approved fixture','2026-11-13 08:00Z',null,'APPROVED',{u(1)}),
({u(802)},{u(101)},'Pending fixture','2026-11-13 09:00Z',null,'PENDING',{u(1)});
insert into public.google_calendar_connections(user_id,refresh_token) values ({u(1)},'synthetic-encrypted');
""")
  for actor,count in [(1,1),(2,1),(3,1),(4,0),(5,0),(6,0),(7,0)]:
   assert db.execute(f"select count(*) from public.google_calendar_meetings({u(actor)});")==str(count)
  db.execute(f"update public.project_meetings set proposed_schedule='{{\"startsAt\":\"2026-12-01T08:00:00Z\"}}' where id={u(801)};")
  assert db.execute(f"select starts_at::date from public.google_calendar_meetings({u(1)});")=='2026-11-13'
  # Fixture-only reassignment; PIC workflow itself is covered by its dedicated tests.
  db.execute(f"begin; alter table public.projects disable trigger user; update public.projects set pic_id={u(5)} where id={u(101)}; alter table public.projects enable trigger user; commit;")
  assert db.execute(f"select count(*) from public.google_calendar_meetings({u(2)});")=='0'
  assert db.execute(f"select count(*) from public.google_calendar_meetings({u(5)});")=='1'
  db.execute(f"update public.project_meetings set status='CANCELLED',proposed_schedule=null where id={u(801)};")
  assert db.execute(f"select count(*) from public.google_calendar_meetings({u(1)});")=='0'
  assert db.execute("select count(*) from public.claim_google_calendar_connection();")=='1'
  assert db.execute("select count(*) from public.claim_google_calendar_connection();")=='0'
  db.execute(f"insert into public.google_calendar_oauth values ({u(1)},'state-hash','encrypted-verifier',now()+interval '1 minute');")
  assert db.execute(f"select count(*) from public.consume_google_calendar_oauth({u(7)},'state-hash');")=='0'
  assert db.execute(f"select count(*) from public.consume_google_calendar_oauth({u(1)},'state-hash');")=='1'
  assert db.execute(f"select count(*) from public.consume_google_calendar_oauth({u(1)},'state-hash');")=='0'
  assert db.execute("select has_table_privilege('authenticated','public.google_calendar_connections','select');")=='f'
  assert db.execute("select has_function_privilege('anon','public.google_calendar_meetings(uuid)','execute');")=='f'
  print('PASS PostgreSQL migration, participant scope, pending reschedule, cancellation, PIC reassignment, leases, OAuth replay and ACL')
 finally:
  db.close()

if __name__=='__main__':main()
