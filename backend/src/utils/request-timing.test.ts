import { strict as assert } from 'assert';
import { EventEmitter } from 'events';
import { Request, Response } from 'express';
import { getRequestTiming, requestTiming, timeOperation } from './request-timing';

class ResponseMock extends EventEmitter {
  headers = new Map<string, string>();
  setHeader(name: string, value: string) { this.headers.set(name, value); return this; }
}

async function run() {
  const previousMode = process.env.NODE_ENV;
  const previousFlag = process.env.PERF_DIAGNOSTICS;
  const previousInfo = console.info;
  const logs: Array<{ correlationId: string; operation: string; durationMs: number }> = [];
  console.info = (line: string) => { logs.push(JSON.parse(line)); };
  try {
    process.env.NODE_ENV = 'development';
    delete process.env.PERF_DIAGNOSTICS;
    const disabledRequest = { method: 'GET', path: '/api/auth/me' } as Request;
    const disabledResponse = new ResponseMock();
    let nextCalls = 0;
    requestTiming(disabledRequest, disabledResponse as unknown as Response, () => { nextCalls++; });
    assert.equal(getRequestTiming(disabledRequest), undefined);
    assert.equal(disabledResponse.headers.size, 0);

    process.env.PERF_DIAGNOSTICS = '1';
    const request = { method: 'GET', path: '/api/auth/me', headers: { authorization: 'Bearer secret' } } as Request;
    const response = new ResponseMock();
    requestTiming(request, response as unknown as Response, () => { nextCalls++; });
    const trace = getRequestTiming(request);
    assert(trace);
    assert.equal(response.headers.has('X-Perf-Trace-Id'), true);
    assert.equal(await timeOperation(trace, 'auth.verify', async () => 42), 42);
    await assert.rejects(() => timeOperation(trace, 'auth.profile', async () => { throw new Error('private failure'); }), /private failure/);
    response.emit('finish');
    assert.equal(nextCalls, 2);
    assert.deepEqual(logs.map((log) => log.operation), ['auth.verify', 'auth.profile', 'auth.me.request.total']);
    assert(logs.every((log) => log.correlationId === response.headers.get('X-Perf-Trace-Id')));
    assert(logs.every((log) => Number.isFinite(log.durationMs) && log.durationMs >= 0));
    assert(logs.every((log) => Object.keys(log).sort().join(',') === 'correlationId,durationMs,operation'));
    assert(!JSON.stringify(logs).includes('secret') && !JSON.stringify(logs).includes('private failure'));
    const projectRequest = { method: 'GET', path: '/api/projects' } as Request;
    const projectResponse = new ResponseMock();
    requestTiming(projectRequest, projectResponse as unknown as Response, () => { nextCalls++; });
    getRequestTiming(projectRequest)?.record('projects.list.rows', 3);
    projectResponse.emit('finish');
    assert.deepEqual(logs.slice(3).map((log) => log.operation), ['projects.list.rows', 'projects.list.request.total']);
    assert.equal(nextCalls, 3);
    console.log('Request timing opt-in, correlation, failure, and safe log fields: passed');
  } finally {
    console.info = previousInfo;
    if (previousMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousMode;
    if (previousFlag === undefined) delete process.env.PERF_DIAGNOSTICS; else process.env.PERF_DIAGNOSTICS = previousFlag;
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
