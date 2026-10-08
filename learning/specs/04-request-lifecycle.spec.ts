/**
 * Lesson 04 — The request lifecycle (the part every CRUD dev uses daily).
 *
 * Order proven by this spec:
 *   middleware → guard → interceptor(before) → pipe → handler
 *              → interceptor(after) → (exception filter on error)
 *
 * Source to read alongside this spec:
 *   packages/core/router/router-explorer.ts           (walks controllers, registers routes)
 *   packages/core/router/router-execution-context.ts  (create(): builds the handler pipeline)
 *   packages/core/guards/guards-consumer.ts
 *   packages/core/interceptors/interceptors-consumer.ts
 *   packages/core/pipes/pipes-consumer.ts
 *   packages/core/router/router-proxy.ts              (try/catch → exceptions handler)
 *   packages/core/exceptions/base-exception-filter.ts
 */
import {
  ArgumentsHost,
  CallHandler,
  CanActivate,
  Catch,
  Controller,
  ExceptionFilter,
  ExecutionContext,
  Get,
  HttpException,
  Injectable,
  MiddlewareConsumer,
  Module,
  NestInterceptor,
  NestModule,
  Param,
  PipeTransform,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { tap } from 'rxjs/operators';
import request from 'supertest';

const trace: string[] = [];

@Injectable()
class TraceGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    trace.push('guard');
    // ExecutionContext lets the same guard work for HTTP, WS and RPC.
    return ctx.switchToHttp().getRequest().headers['x-deny'] === undefined;
  }
}

@Injectable()
class TraceInterceptor implements NestInterceptor {
  intercept(_: ExecutionContext, next: CallHandler) {
    trace.push('interceptor:before');
    return next.handle().pipe(tap(() => trace.push('interceptor:after')));
  }
}

class TracePipe implements PipeTransform {
  transform(value: string) {
    trace.push('pipe');
    return value.toUpperCase();
  }
}

@Catch(HttpException)
class TraceFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    trace.push('filter');
    host
      .switchToHttp()
      .getResponse()
      .status(exception.getStatus())
      .json({ caughtBy: 'TraceFilter' });
  }
}

@Controller('cats')
@UseGuards(TraceGuard)
@UseInterceptors(TraceInterceptor)
@UseFilters(TraceFilter)
class CatsController {
  @Get(':name')
  find(@Param('name', TracePipe) name: string) {
    trace.push('handler');
    if (name === 'BOOM') {
      throw new HttpException('nope', 418);
    }
    return { name };
  }
}

@Module({ controllers: [CatsController] })
class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply((_req: any, _res: any, next: () => void) => {
        trace.push('middleware');
        next();
      })
      .forRoutes(CatsController);
  }
}

describe('Lesson 04: request lifecycle', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(() => app.close());
  beforeEach(() => (trace.length = 0));

  it('runs every enhancer in the documented order', async () => {
    const res = await request(app.getHttpServer()).get('/cats/tom');
    expect(res.body).toEqual({ name: 'TOM' }); // pipe upper-cased it
    expect(trace).toEqual([
      'middleware',
      'guard',
      'interceptor:before',
      'pipe',
      'handler',
      'interceptor:after',
    ]);
  });

  it('a guard returning false throws ForbiddenException (403) → filters see it too', async () => {
    const res = await request(app.getHttpServer())
      .get('/cats/tom')
      .set('x-deny', '1');
    expect(res.status).toBe(403);
    // Surprise found while writing this lesson: the guard does not "just
    // return 403". GuardsConsumer returns false → RouterExecutionContext throws
    // ForbiddenException, which IS an HttpException, so @Catch(HttpException)
    // catches it. Interceptors, pipes and the handler never run.
    expect(res.body).toEqual({ caughtBy: 'TraceFilter' });
    expect(trace).toEqual(['middleware', 'guard', 'filter']);
  });

  it('a thrown HttpException is routed to the exception filter', async () => {
    const res = await request(app.getHttpServer()).get('/cats/boom');
    expect(res.status).toBe(418);
    expect(res.body).toEqual({ caughtBy: 'TraceFilter' });
    // interceptor:after never runs: the observable errored instead.
    expect(trace).toEqual([
      'middleware',
      'guard',
      'interceptor:before',
      'pipe',
      'handler',
      'filter',
    ]);
  });
});
