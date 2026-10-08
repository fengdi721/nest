/**
 * Lesson 03 — Provider scopes: DEFAULT, TRANSIENT, REQUEST.
 *
 * Source to read alongside this spec:
 *   packages/common/interfaces/scope-options.interface.ts  (Scope enum)
 *   packages/core/injector/instance-wrapper.ts             (per-context instances, isDependencyTreeStatic)
 *   packages/core/helpers/context-id-factory.ts            (ContextIdFactory)
 *   packages/core/injector/module-ref.ts                   (get vs resolve)
 *
 * Key idea: an InstanceWrapper stores ONE instance per "context id".
 * DEFAULT scope uses a single static context; REQUEST scope creates a new
 * instance for every context id (= every request); TRANSIENT gives each
 * consumer its own instance.
 */
import { Injectable, Scope } from '@nestjs/common';
import { ContextIdFactory } from '@nestjs/core';
import { Test } from '@nestjs/testing';

describe('Lesson 03: provider scopes', () => {
  let created: string[];

  beforeEach(() => {
    created = [];
  });

  it('TRANSIENT: every consumer gets its own instance', async () => {
    @Injectable({ scope: Scope.TRANSIENT })
    class Counter {
      constructor() {
        created.push('Counter');
      }
    }

    @Injectable()
    class A {
      constructor(readonly counter: Counter) {}
    }
    @Injectable()
    class B {
      constructor(readonly counter: Counter) {}
    }

    const moduleRef = await Test.createTestingModule({
      providers: [Counter, A, B],
    }).compile();

    expect(moduleRef.get(A).counter).not.toBe(moduleRef.get(B).counter);
  });

  it('REQUEST: one instance per context id; get() is forbidden, use resolve()', async () => {
    @Injectable({ scope: Scope.REQUEST })
    class RequestStore {
      id = Math.random();
    }

    const moduleRef = await Test.createTestingModule({
      providers: [RequestStore],
    }).compile();

    // `get()` only works for statically-scoped providers.
    expect(() => moduleRef.get(RequestStore)).toThrow(/scoped/);

    const ctx1 = ContextIdFactory.create();
    const ctx2 = ContextIdFactory.create();

    const a1 = await moduleRef.resolve(RequestStore, ctx1);
    const a2 = await moduleRef.resolve(RequestStore, ctx1);
    const b1 = await moduleRef.resolve(RequestStore, ctx2);

    expect(a1).toBe(a2); // same "request"
    expect(a1).not.toBe(b1); // different "request"
  });

  it('scope BUBBLES UP: depending on a REQUEST provider makes you request-scoped', async () => {
    @Injectable({ scope: Scope.REQUEST })
    class RequestStore {}

    @Injectable() // declared DEFAULT…
    class CatsService {
      constructor(readonly store: RequestStore) {}
    }

    const moduleRef = await Test.createTestingModule({
      providers: [RequestStore, CatsService],
    }).compile();

    // …but its dependency tree is not static anymore, so get() refuses it.
    expect(() => moduleRef.get(CatsService)).toThrow();
    const ctx = ContextIdFactory.create();
    const cats = await moduleRef.resolve(CatsService, ctx);
    expect(cats.store).toBe(await moduleRef.resolve(RequestStore, ctx));
  });
});
