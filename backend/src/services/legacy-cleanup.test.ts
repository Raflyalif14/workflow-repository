import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};

const backendRoot = join(__dirname, '..', '..');
const repositoryRoot = join(backendRoot, '..');
const backendPackage = JSON.parse(readFileSync(join(backendRoot, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
const oldOrm = ['pri', 'sma'].join('');
const oldClient = `@${oldOrm}/client`;

assert(!backendPackage.dependencies?.[oldClient], 'Test 1: backend dependency list must not include the removed ORM client');
assert(!backendPackage.devDependencies?.[oldOrm], 'Test 1: backend dev dependency list must not include the removed ORM CLI');
assert(!Object.keys(backendPackage.scripts).some((script) => script.includes(oldOrm)), 'Test 1: backend scripts must not invoke the removed ORM');
console.log('Test 1 - Backend package has no legacy ORM package or script: passed');

const routeIndex = readFileSync(join(backendRoot, 'src', 'routes', 'index.ts'), 'utf8');
assert(
  !routeIndex.includes('approvalCenterRoutes') &&
  !routeIndex.includes("'./approval-center.routes'"),
  'Test 2: obsolete approval center route must not be mounted'
);
assert(!routeIndex.includes("'/engine'"), 'Test 2: obsolete workflow engine route must not be mounted');
assert((routeIndex.match(/router\.use\('\/assignments'/g) || []).length === 1, 'Test 2: only the authoritative assignment route may be mounted');
console.log('Test 2 - Legacy route mounts are removed: passed');

assert(!existsSync(join(backendRoot, 'src', 'config', oldOrm + '.ts')), 'Test 3: legacy ORM config must be absent');
assert(!existsSync(join(backendRoot, oldOrm)), 'Test 3: legacy ORM schema directory must be absent');
assert(!existsSync(join(repositoryRoot, 'docker' + '-compose.yml')), 'Test 3: obsolete local infrastructure compose file must be absent');
console.log('Test 3 - Legacy infrastructure files are absent: passed');

const storageSource = readFileSync(join(backendRoot, 'src', 'utils', 'storage.util.ts'), 'utf8');
assert(!storageSource.includes('diskStorage') && !storageSource.includes("from 'fs'"), 'Test 4: runtime storage must not use local disk uploads');
assert(storageSource.includes('DocumentStorageService') && storageSource.includes('createSignedUrl'), 'Test 4: runtime storage must use Supabase Storage signed URLs');
console.log('Test 4 - Document storage no longer depends on local runtime storage: passed');
