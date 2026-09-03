import { NextFunction, Request, Response } from 'express';
import { errorHandler } from './error.middleware';

type ResponseState = {
  statusCode?: number;
  payload?: unknown;
};

const assert = (condition: boolean, message: string): void => {
  if (!condition) throw new Error(message);
};

const createResponse = (): { response: Response; state: ResponseState } => {
  const state: ResponseState = {};
  const response = {
    status: (statusCode: number) => {
      state.statusCode = statusCode;
      return response;
    },
    json: (payload: unknown) => {
      state.payload = payload;
      return response;
    },
  };

  return { response: response as unknown as Response, state };
};

const handleError = (error: Error & { statusCode?: number }): ResponseState => {
  const { response, state } = createResponse();
  errorHandler(error, {} as Request, response, (() => undefined) as NextFunction);
  return state;
};

function run(): void {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalConsoleError = console.error;
  console.error = () => undefined;

  try {
    process.env.NODE_ENV = 'production';
    const productionFailure = handleError(new Error('provider connection string leaked'));
    const productionPayload = productionFailure.payload as { message?: string; errors?: unknown };
    assert(productionFailure.statusCode === 500, 'Test 1: unknown errors must return HTTP 500');
    assert(productionPayload.message === 'Internal Server Error', 'Test 1: production 500 must be generic');
    assert(!JSON.stringify(productionPayload).includes('provider connection string leaked'), 'Test 1: production 500 must not leak raw errors');
    assert(productionPayload.errors === null, 'Test 1: production 500 must not include a stack trace');
    console.log('Test 1 - Production 500 response is generic: passed');

    const clientError = Object.assign(new Error('Validation failed'), { statusCode: 422 });
    const clientFailure = handleError(clientError);
    assert(clientFailure.statusCode === 422, 'Test 2: expected client errors must keep their status');
    assert((clientFailure.payload as { message?: string }).message === 'Validation failed', 'Test 2: expected client errors must keep their safe message');
    console.log('Test 2 - Expected 4xx response remains usable: passed');

    process.env.NODE_ENV = 'development';
    const developmentFailure = handleError(new Error('development diagnostics'));
    assert((developmentFailure.payload as { message?: string }).message === 'development diagnostics', 'Test 3: development preserves diagnostic message');
    assert(
      typeof (developmentFailure.payload as { errors?: unknown }).errors === 'string',
      'Test 3: development keeps stack diagnostics available'
    );
    console.log('Test 3 - Development error diagnostics remain available: passed');
  } finally {
    console.error = originalConsoleError;
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  }
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
