"""Real local GoTrue/PostgREST/Storage checks. No .env or production imports."""
import base64, hashlib, hmac, json, os, pathlib, re, secrets, socket, subprocess, sys, time, uuid
sys.dont_write_bytecode = True
HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
IMAGES = {'db': 'postgres:16-alpine', 'auth': 'supabase/gotrue:v2.196.0',
          'rest': 'postgrest/postgrest:v14.17', 'storage': 'supabase/storage-api:v1.74.0'}

def command(*args, data=None):
    try:
        return subprocess.run(args, input=data, encoding='utf-8', capture_output=True, timeout=120)
    except subprocess.TimeoutExpired:
        # Docker startup arguments include ephemeral keys; never echo them.
        raise RuntimeError('Owned local CLI operation timed out; arguments omitted') from None

def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]

def jwt(secret, role):
    enc = lambda v: base64.urlsafe_b64encode(json.dumps(v,separators=(',',':')).encode()).decode().rstrip('=')
    body = enc({'alg':'HS256','typ':'JWT'})+'.'+enc({'role':role,'iss':'local-test','iat':int(time.time()),'exp':int(time.time())+7200})
    return body+'.'+base64.urlsafe_b64encode(hmac.new(secret.encode(),body.encode(),hashlib.sha256).digest()).decode().rstrip('=')

class Stack:
    def __init__(self):
        self.run = uuid.uuid4().hex
        self.network = 'workflow_services_test_'+self.run[:12]
        self.database = 'workflow_services_'+self.run[:12]
        self.containers = {}
        self.ports = {k:free_port() for k in ('auth','rest','storage','gateway')}
        self.secret = secrets.token_hex(32)
        self.anon, self.service = jwt(self.secret,'anon'), jwt(self.secret,'service_role')
        r=command('docker','network','create','--opt','com.docker.network.bridge.enable_ip_masquerade=false','--label','codex.workflow.services='+self.run,self.network)
        if r.returncode: raise RuntimeError('Unable to create dedicated test network')
        self.network_id=r.stdout.strip()

    def start(self, kind, env):
        args=['docker','run','-d','--name',self.network+'_'+kind,'--network',self.network,
              '--network-alias',kind,'--label','codex.workflow.services='+self.run]
        if kind=='db':
            args+=['--tmpfs','/var/lib/postgresql/data:rw,size=512m']
        if kind=='storage': args+=['--tmpfs','/var/lib/storage:rw,size=128m,mode=1777']
        if kind in self.ports:
            port={'auth':9999,'rest':3000,'storage':5000}[kind]
            args+=['-p',f'127.0.0.1:{self.ports[kind]}:{port}']
        for key,value in env.items(): args+=['-e',key+'='+str(value)]
        r=command(*args,IMAGES[kind])
        if r.returncode: raise RuntimeError('Owned '+kind+' container startup failed')
        self.containers[kind]=r.stdout.strip()
        self.verify()

    def verify(self):
        n=json.loads(command('docker','network','inspect',self.network_id).stdout)[0]
        assert n['Id']==self.network_id and n['Options'].get('com.docker.network.bridge.enable_ip_masquerade')=='false' and n['Labels']['codex.workflow.services']==self.run
        assert set(n.get('Containers',{})).issubset(set(self.containers.values()))
        for kind,identity in self.containers.items():
            c=json.loads(command('docker','inspect',identity).stdout)[0]
            assert c['Id']==identity and c['Name']=='/'+self.network+'_'+kind
            assert c['Config']['Image']==IMAGES[kind] and c['Config']['Labels']['codex.workflow.services']==self.run
            assert set(c['NetworkSettings']['Networks'])=={self.network}
            assert not c['HostConfig']['Binds'] and all(m['Type']=='tmpfs' for m in c['Mounts'])
            assert all(v['HostIp']=='127.0.0.1' for group in c['HostConfig'].get('PortBindings',{}).values() for v in group)

    def sql(self, text, label):
        self.verify()
        identity=command('docker','exec',self.containers['db'],'psql','-X','-U','postgres','-d',self.database,'-Atc',"select current_database(),current_setting('server_version_num')")
        assert identity.returncode==0
        name,version=identity.stdout.strip().split('|')
        assert name==self.database and 160000<=int(version)<170000
        r=command('docker','exec','-i',self.containers['db'],'psql','-X','-qAt','-U','postgres','-d',self.database,
                  '-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate','-f','-',data=text)
        if r.returncode:
            codes=re.findall(r'(?:ERROR|FATAL):\s+([A-Z0-9]{5})',r.stderr)
            raise RuntimeError(label+' SQLSTATE='+','.join(codes or ['unknown']))
        return r.stdout.strip()

    def wait(self, kind, path):
        import urllib.request
        deadline=time.monotonic()+50
        while time.monotonic()<deadline:
            try:
                with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(f'http://127.0.0.1:{self.ports[kind]}{path}',timeout=2) as r:
                    if r.status==200: return
            except Exception: time.sleep(.25)
        # Never print logs: they can contain runtime JWT/config or URLs.
        logs=command('docker','logs',self.containers[kind])
        raw=logs.stdout+logs.stderr
        codes=re.findall(r'SQLSTATE[ :=]+([A-Z0-9]{5})',raw)
        operations=re.findall(r'(?:permission denied for|must be owner of) (?:schema|table|function|relation|database|extension) [a-zA-Z_][a-zA-Z_0-9.]*',raw)
        print('Safe '+kind+' startup SQLSTATE='+','.join(sorted(set(codes)))+' operation='+','.join(sorted(set(operations))),flush=True)
        raise RuntimeError(kind+' readiness failed; owned container logs require safe inspection')

    def cleanup(self):
        self.verify()
        for identity in reversed(list(self.containers.values())):
            if command('docker','rm','-f',identity).returncode: raise RuntimeError('Owned container cleanup failed')
        if command('docker','network','rm',self.network_id).returncode: raise RuntimeError('Owned network cleanup failed')

def main():
    stack=Stack()
    try:
        stack.start('db',{'POSTGRES_DB':stack.database,'POSTGRES_HOST_AUTH_METHOD':'trust'})
        for _ in range(100):
            if command('docker','exec',stack.containers['db'],'pg_isready','-U','postgres','-d',stack.database).returncode==0: break
            time.sleep(.2)
        stack.sql("""create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
          create role authenticator login noinherit;grant anon,authenticated,service_role to authenticator;
          grant usage on schema public to anon,authenticated,service_role;
          alter default privileges in schema public grant all on tables to service_role;
          alter default privileges in schema public grant all on sequences to service_role;
          create schema auth;create role supabase_auth_admin login noinherit createrole noreplication;alter role supabase_auth_admin set search_path=auth;alter schema auth owner to supabase_auth_admin;grant create on database """+stack.database+""" to supabase_auth_admin;create function auth.uid() returns uuid language sql stable as
          $$select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
          create function auth.role() returns text language sql stable as
          $$select coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role')$$;
          create function auth.jwt() returns jsonb language sql stable as $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
          alter function auth.uid() owner to supabase_auth_admin;
          alter function auth.role() owner to supabase_auth_admin;
          alter function auth.jwt() owner to supabase_auth_admin;
          grant usage on schema auth to anon,authenticated,service_role;
        """,'local platform role bootstrap')
        gateway=f'http://127.0.0.1:{stack.ports["gateway"]}'
        stack.start('auth',{'GOTRUE_API_HOST':'0.0.0.0','GOTRUE_API_PORT':9999,'API_EXTERNAL_URL':gateway+'/auth/v1',
          'GOTRUE_DB_DRIVER':'postgres','GOTRUE_DB_DATABASE_URL':'postgres://supabase_auth_admin@db:5432/'+stack.database+'?sslmode=disable',
          'GOTRUE_SITE_URL':gateway,'GOTRUE_JWT_SECRET':stack.secret,'GOTRUE_JWT_EXP':30,
          'GOTRUE_JWT_ADMIN_ROLES':'service_role','GOTRUE_JWT_AUD':'authenticated','GOTRUE_JWT_DEFAULT_GROUP_NAME':'authenticated',
          'GOTRUE_EXTERNAL_EMAIL_ENABLED':'true','GOTRUE_MAILER_AUTOCONFIRM':'true','GOTRUE_DISABLE_SIGNUP':'true',
          'GOTRUE_EXTERNAL_PHONE_ENABLED':'false','GOTRUE_SMTP_HOST':'disabled.invalid','GOTRUE_LOG_LEVEL':'error'})
        stack.wait('auth','/health')
        stack.start('storage',{'DATABASE_URL':'postgres://postgres@db:5432/'+stack.database+'?sslmode=disable',
          'ANON_KEY':stack.anon,'SERVICE_KEY':stack.service,'AUTH_JWT_SECRET':stack.secret,'POSTGREST_URL':'http://rest:3000',
          'STORAGE_BACKEND':'file','FILE_STORAGE_BACKEND_PATH':'/var/lib/storage','GLOBAL_S3_BUCKET':'test-only',
          'TENANT_ID':'local-test','REGION':'local','FILE_SIZE_LIMIT':52428800,'ENABLE_IMAGE_TRANSFORMATION':'false',
          'STORAGE_PUBLIC_URL':gateway,'LOG_LEVEL':'error'})
        stack.wait('storage','/status')
        # Supabase normally installs these platform grants before Storage starts.
        # PostgreSQL's plain image has no platform bootstrap; keep them explicit.
        stack.sql('grant usage on schema storage to service_role;grant all on all tables in schema storage to service_role;grant all on all sequences in schema storage to service_role;',
                  'local Storage service-role platform grants')
        print('ISOLATED: labelled dedicated bridge (masquerading disabled); owned PostgreSQL16/tmpfs and loopback-only service ports verified before schema/account/file writes',flush=True)
        migrations=ROOT/'backend/supabase'
        for name in ['phase1.sql','phase2.sql','phase3.sql','phase4.sql','phase5.sql']:
            stack.sql((migrations/name).read_text(encoding='utf-8-sig'),name)
        stack.sql((ROOT/'backend/tests/postgres/historical-prerequisites.sql').read_text(encoding='utf-8-sig'),'explicit historical test prerequisites')
        names=[p for p in migrations.glob('phase*.sql') if not any(x in p.name for x in ('preflight','verify')) and 8<=int(re.match(r'phase(\d+)',p.name)[1])<=33]
        for p in sorted(names,key=lambda p:(int(re.match(r'phase(\d+)',p.name)[1]),p.name)):
            stack.sql(p.read_text(encoding='utf-8-sig'),p.name)
        stack.start('rest',{'PGRST_DB_URI':'postgres://authenticator@db:5432/'+stack.database,
          'PGRST_DB_SCHEMAS':'public','PGRST_DB_ANON_ROLE':'anon','PGRST_JWT_SECRET':stack.secret,'PGRST_LOG_LEVEL':'error'})
        stack.wait('rest','/')
        stack.verify()
        # Minimal whitelisted environment; dotenv's cwd is a temporary empty directory.
        import tempfile
        env={k:v for k,v in os.environ.items() if k.upper() in ('PATH','SYSTEMROOT','WINDIR','TEMP','TMP','COMSPEC','PATHEXT','USERPROFILE','APPDATA','LOCALAPPDATA','SYSTEMDRIVE','PROGRAMFILES','PROGRAMFILES(X86)','PROGRAMDATA','HOMEDRIVE','HOMEPATH')}
        env.update({'NODE_ENV':'test','SUPABASE_URL':gateway,'SUPABASE_ANON_KEY':stack.anon,'SUPABASE_SERVICE_ROLE_KEY':stack.service,
          'SUPABASE_DOCUMENT_BUCKET':'workflow-documents','DEFAULT_REGISTER_ROLE':'SA','SMTP_HOST':'','TELEGRAM_BOT_TOKEN':'',
          'WORKFLOW_SERVICES_TARGET':json.dumps({'run':stack.run,'network':stack.network,'db':stack.containers['db'],'database':stack.database,'ports':stack.ports}),
          'TS_NODE_PROJECT':str(ROOT/'backend/tsconfig.json'),'APP_BASE_URL':gateway,'CORS_ORIGIN':gateway})
        with tempfile.TemporaryDirectory(prefix='workflow-services-test-') as work:
            r=subprocess.run(['node',str(HERE/'cases.cjs')],cwd=work,env=env,timeout=240)
            if r.returncode:
                for kind in ('auth','rest','storage'):
                    logs=command('docker','logs',stack.containers[kind]);raw=logs.stdout+logs.stderr
                    codes=re.findall(r'(?:SQLSTATE[ :=]+|"code"\s*:\s*")([A-Z0-9]{5})(?:"|\b)',raw)
                    operations=re.findall(r'(?:permission denied for|must be owner of) (?:schema|table|function|relation|database|extension) [a-zA-Z_][a-zA-Z_0-9.]*|\b(?:EACCES|ECONNREFUSED|ENOENT)\b',raw)
                    print('Safe '+kind+' diagnostic SQLSTATE='+','.join(sorted(set(codes)))+' operation='+','.join(sorted(set(operations))),flush=True)
                raise RuntimeError('Service integration cases did not all pass; see safe results report')
    finally:
        stack.cleanup()
        print('CLEANED: only owned four-service containers, tmpfs bytes and dedicated network',flush=True)

if __name__=='__main__': main()
