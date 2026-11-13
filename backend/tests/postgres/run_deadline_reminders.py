"""Isolated PostgreSQL integration tests. Never connects to the application database."""
import concurrent.futures
import re
import sys
sys.dont_write_bytecode = True
from local import LocalDatabase
from harness import HERE, MIGRATIONS


def main():
    db = LocalDatabase()
    try:
        db.prepare()
        for path in sorted(MIGRATIONS.glob('phase*.sql'), key=lambda p: p.name):
            number = int(re.match(r'phase(\d+)', path.name)[1])
            if 34 <= number <= 45 and not any(word in path.name for word in ['preflight', 'verify', 'transaction-test']):
                db.execute(path.read_text(encoding='utf-8'), path.name)
        db.execute((HERE / 'fixtures.sql').read_text(encoding='utf-8'), 'synthetic fixtures')
        db.execute("""
update public.project_milestones set start_date=(now() at time zone 'Asia/Jakarta')::date,
 due_date=(now() at time zone 'Asia/Jakarta')::date+1,duration_working_days=2;
update public.project_output_documents set start_date=(now() at time zone 'Asia/Jakarta')::date,
 due_date=(now() at time zone 'Asia/Jakarta')::date+1,duration_working_days=2;
update public.users set preferred_language='id' where id=test_support.u(2);
insert into public.notification_preferences(user_id,in_app_enabled,telegram_enabled,telegram_chat_id)
 values(test_support.u(2),false,true,'synthetic-chat');
""", 'tomorrow schedules')
        assert db.execute('select count(*) from public.due_tomorrow_sa_tasks();') == '2'
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            totals = list(pool.map(lambda _: db.execute('select public.enqueue_deadline_reminders();'), range(2)))
        assert sum(map(int, totals)) == 2, totals
        assert db.execute('select public.enqueue_deadline_reminders();') == '0'
        assert db.execute("select count(*) from public.notifications where type='DEADLINE_REMINDER_H1' and title='Deadline besok' and not in_app_visible;") == '2'
        assert db.execute("select count(*) from public.notification_deliveries d join public.notifications n on n.id=d.notification_id where n.type='DEADLINE_REMINDER_H1';") == '2'
        # Role and function ACLs prevent a browser user from running the scheduler or reading the queue.
        for role in ['anon', 'authenticated']:
            result = db.process(f'set role {role}; select public.enqueue_deadline_reminders();')
            assert result.returncode != 0 and '42501' in result.stderr
            result = db.process(f'set role {role}; select * from public.deadline_reminder_emails;')
            assert result.returncode != 0 and '42501' in result.stderr
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            totals = list(pool.map(lambda _: db.execute('select count(*) from public.claim_deadline_reminder_emails(1);'), range(2)))
        assert totals == ['1', '1']
        assert db.execute('select count(*) from public.claim_deadline_reminder_emails(20);') == '0'
        db.execute("update public.deadline_reminder_emails set next_attempt_at=now()-interval '1 second';")
        assert db.execute('select count(*) from public.claim_deadline_reminder_emails(20);') == '2', 'expired leases recover'
        db.execute("""
update public.deadline_reminder_emails set next_attempt_at=now()-interval '1 second';
update public.projects set is_postponed=true;
""")
        assert db.execute('select count(*) from public.claim_deadline_reminder_emails(20);') == '0'
        assert db.execute("select count(*) from public.deadline_reminder_emails where status='SKIPPED';") == '2'
        db.execute("update public.projects set is_postponed=false;")
        # Completed/in-review outputs, inactive PICs, and past phases are not reminders.
        for change, undo in [
            ("update public.project_output_documents set status='IN_REVIEW'", "update public.project_output_documents set status='TO_DO'"),
            ("update public.users set is_active=false where id=test_support.u(2)", "update public.users set is_active=true where id=test_support.u(2)"),
            ("update public.project_output_documents set due_date=due_date+1", "update public.project_output_documents set due_date=due_date-1"),
        ]:
            db.execute(change)
            assert db.execute('select count(*) from public.due_tomorrow_sa_tasks();') == '0', change
            db.execute(undo)
        # Reassignment receives its own reminder, without re-notifying the previous recipient.
        db.execute('update public.project_milestones set pic_id=test_support.u(5);')
        assert db.execute('select public.enqueue_deadline_reminders();') == '2'
        assert db.execute("select count(*) from public.notifications where type='DEADLINE_REMINDER_H1' and user_id=test_support.u(5) and title='Deadline tomorrow';") == '2'
        db.execute("update public.deadline_reminder_emails set attempt_count=3,next_attempt_at=now()-interval '1 second' where status='PENDING';")
        assert db.execute('select count(*) from public.claim_deadline_reminder_emails(20);') == '0'
        assert db.execute("select count(*) from public.deadline_reminder_emails where status='FAILED';") == '2'
        print('PASS real PostgreSQL: concurrent dedup, output schedules, channel preferences, locale, ACL, leases, postponement, inactive PIC, review status, rescheduling, reassignment and retry cap')
    finally:
        db.close()


if __name__ == '__main__':
    main()
