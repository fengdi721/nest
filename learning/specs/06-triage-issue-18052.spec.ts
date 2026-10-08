/**
 * Lesson 06 — Triage a real, open upstream issue.
 *
 * Issue:  https://github.com/nestjs/nest/issues/18052
 *         "Fastify adapter crashes when listen() gets a Unix socket path"
 * Source: packages/platform-fastify/adapters/fastify-adapter.ts → listen()
 *
 * Triage = confirm the bug at the SMALLEST possible level, without starting a
 * server. We stub Fastify's own `listen` and look at the options Nest passes.
 *
 * Root cause (read the code!): every non-object argument becomes
 *   { port: +listenOptions }
 * so '/tmp/app.sock' → { port: NaN }, and Node later throws
 * "RangeError: options.port should be >= 0 and < 65536".
 *
 * `it.fails` = "this test is EXPECTED to fail today". The day the upstream fix
 * lands and you rebase onto it, vitest will report it as unexpectedly passing:
 * your signal to flip it to a normal `it`.
 */
import { FastifyAdapter } from '@nestjs/platform-fastify';

describe('Lesson 06: triage nestjs/nest#18052', () => {
  let adapter: FastifyAdapter;
  let fastifyListen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    adapter = new FastifyAdapter();
    fastifyListen = vi.fn();
    // Replace fastify's real listen so no socket/port is opened.
    (adapter.getInstance() as any).listen = fastifyListen;
  });

  it('control case: a numeric port (number or numeric string) works', () => {
    adapter.listen(3000, () => {});
    adapter.listen('3000', () => {});
    expect(fastifyListen.mock.calls[0][0]).toEqual({ port: 3000 });
    expect(fastifyListen.mock.calls[1][0]).toEqual({ port: 3000 });
  });

  it('control case: the object form with `path` works', () => {
    adapter.listen({ path: '/tmp/app.sock' }, () => {});
    expect(fastifyListen.mock.calls[0][0]).toEqual({ path: '/tmp/app.sock' });
  });

  it('BUG: a socket path string is turned into { port: NaN }', () => {
    adapter.listen('/tmp/app.sock', () => {});
    expect(fastifyListen.mock.calls[0][0]).toEqual({ port: NaN });
  });

  it.fails(
    'EXPECTED (after the fix): a socket path string becomes { path }',
    () => {
      adapter.listen('/tmp/app.sock', () => {});
      expect(fastifyListen.mock.calls[0][0]).toEqual({ path: '/tmp/app.sock' });
    },
  );
});
