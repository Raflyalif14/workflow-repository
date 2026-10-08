# Real local auth and Storage integration

Run from the repository root on Windows with Docker Desktop running:

```powershell
python backend/tests/services/run.py
```

Requires the existing backend `node_modules`, Python, Node, Docker CLI and these
cached images: `postgres:16-alpine`, `supabase/gotrue:v2.196.0`,
`postgrest/postgrest:v14.17`, `supabase/storage-api:v1.74.0`.
No dependency is installed by this harness. Image versions follow the official
[Supabase Docker composition](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml)
at the verification checkpoint; PostgreSQL 16 matches the existing test harness.

## Isolation before writes

Every run creates a random, labelled network and four labelled containers. The
network disables IP masquerading; it is not an operating-system firewall or an
`internal` Docker network. Service ports bind only to `127.0.0.1`, PostgreSQL has
no published port, and database/object data use tmpfs without host binds/volumes.
Before SQL the harness verifies container IDs, labels, images, network membership,
mounts, database name and PostgreSQL major version. It never operates existing
user containers.

Credentials are freshly generated in memory for this synthetic stack. They are
not read from `.env`, saved to evidence, or printed. The Node subprocess runs in
an empty temporary working directory with a whitelisted environment. Its fetch
fence refuses destinations other than the owned loopback services/application.
The gateway proxies only fixed local GoTrue, PostgREST and Storage ports. No live
endpoint or production identity is used. Account creation explicitly confirms
synthetic `.invalid` addresses; phone auth is disabled and SMTP points to an
invalid host. Application workers are not started (`app.ts`, not `server.ts`).

## Schema and test boundary

GoTrue and Storage run their real internal migrations. Application migrations
are applied only to the owned database through Phase 33. The historical
prerequisites file from `backend/tests/postgres` reconstructs missing early DDL;
this is an explicit fixture limitation, not a replica of the live Supabase
catalog. Previously completed PostgreSQL behavioral tests are not rerun.

The application Express routes, authentication middleware, Supabase SDK,
Multer, upload/submit/review services and business RPCs are real. The frontend
`api-client.ts` and auth session library run in Node with a minimal localStorage
adapter and real HTTP/provider responses. This does not verify React
AuthProvider/browser lifecycle, hosted GoTrue configuration, SMTP, or external
Storage infrastructure.

Safe results are saved to `docs/auth-storage-integration/results.json`. Raw
provider/application logs, credentials, tokens, signed URLs and object paths are
excluded. Cleanup verifies ownership again and removes only task containers and
the task network; tmpfs data disappear with them. Cached Docker images remain.
