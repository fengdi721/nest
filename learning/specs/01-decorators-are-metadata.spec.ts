/**
 * Lesson 01 — Decorators are just metadata writers.
 *
 * Source to read alongside this spec:
 *   packages/common/decorators/core/injectable.decorator.ts
 *   packages/common/decorators/core/controller.decorator.ts
 *   packages/common/decorators/modules/module.decorator.ts
 *   packages/common/decorators/http/request-mapping.decorator.ts
 *   packages/common/constants.ts   (every metadata key lives here)
 *
 * Key idea: `@Module`, `@Injectable`, `@Get`… do NOTHING at runtime except call
 * `Reflect.defineMetadata(key, value, target)`. The real work happens later,
 * when @nestjs/core (scanner + injector + router) READS that metadata back.
 */
import {
  Controller,
  Get,
  Injectable,
  Module,
  Optional,
  Param,
  RequestMethod,
  Scope,
  UseGuards,
} from '@nestjs/common';
import {
  CONTROLLER_WATERMARK,
  GUARDS_METADATA,
  INJECTABLE_WATERMARK,
  METHOD_METADATA,
  MODULE_METADATA,
  OPTIONAL_DEPS_METADATA,
  PARAMTYPES_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
  SCOPE_OPTIONS_METADATA,
} from '@nestjs/common/constants.js';

describe('Lesson 01: decorators are metadata', () => {
  @Injectable({ scope: Scope.REQUEST })
  class CatsService {}

  class AlwaysTrueGuard {
    canActivate() {
      return true;
    }
  }

  @Controller('cats')
  @UseGuards(AlwaysTrueGuard)
  class CatsController {
    constructor(
      private readonly cats: CatsService,
      @Optional() private readonly maybe?: CatsService,
    ) {}

    @Get(':id')
    findOne(@Param('id') id: string) {
      return id;
    }
  }

  @Module({ controllers: [CatsController], providers: [CatsService] })
  class CatsModule {}

  it('@Injectable() sets a watermark and the scope options', () => {
    expect(Reflect.getMetadata(INJECTABLE_WATERMARK, CatsService)).toBe(true);
    expect(Reflect.getMetadata(SCOPE_OPTIONS_METADATA, CatsService)).toEqual({
      scope: Scope.REQUEST,
    });
  });

  it('@Module() stores each property under its own key', () => {
    expect(
      Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, CatsModule),
    ).toEqual([CatsController]);
    expect(Reflect.getMetadata(MODULE_METADATA.PROVIDERS, CatsModule)).toEqual([
      CatsService,
    ]);
    // Keys that were not passed are simply never written.
    expect(
      Reflect.getMetadata(MODULE_METADATA.IMPORTS, CatsModule),
    ).toBeUndefined();
  });

  it('@Controller() writes a watermark and the path prefix', () => {
    expect(Reflect.getMetadata(CONTROLLER_WATERMARK, CatsController)).toBe(
      true,
    );
    expect(Reflect.getMetadata(PATH_METADATA, CatsController)).toBe('cats');
  });

  it('@Get() writes path + HTTP method on the METHOD (descriptor.value)', () => {
    const handler = CatsController.prototype.findOne;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(':id');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(
      RequestMethod.GET,
    );
  });

  it('@Param() records argument index + type under ROUTE_ARGS_METADATA', () => {
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      CatsController,
      'findOne',
    );
    // Key format is "<RouteParamtypes enum>:<argument index>"
    expect(Object.keys(args)).toHaveLength(1);
    const [entry] = Object.values<any>(args);
    expect(entry).toMatchObject({ index: 0, data: 'id' });
  });

  it('@UseGuards() just appends the guard classes to an array', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, CatsController)).toEqual([
      AlwaysTrueGuard,
    ]);
  });

  it('constructor types come from TypeScript emitDecoratorMetadata, not Nest', () => {
    // `design:paramtypes` is emitted by the TS compiler because the class has
    // a decorator. This is HOW the injector knows what to inject.
    expect(Reflect.getMetadata(PARAMTYPES_METADATA, CatsController)).toEqual([
      CatsService,
      CatsService,
    ]);
    // @Optional() remembers the parameter INDEX that may be missing.
    expect(Reflect.getMetadata(OPTIONAL_DEPS_METADATA, CatsController)).toEqual(
      [1],
    );
  });
});
