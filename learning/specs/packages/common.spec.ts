/**
 * Package 教程配套测试 —— @nestjs/common
 * 文档：learning/packages/common.md
 *
 * 第 01 课讲过 common 的装饰器（只写元数据）。这里覆盖 common 的其他部分：
 * 异常、管道、ValidationPipe（含继承）、序列化、ConfigurableModuleBuilder、Logger。
 */
import {
  BadRequestException,
  Body,
  ClassSerializerInterceptor,
  ConfigurableModuleBuilder,
  ConsoleLogger,
  Controller,
  DefaultValuePipe,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  INestApplication,
  Module,
  Optional,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Exclude, Expose } from 'class-transformer';
import { IsInt, IsString, Min, MinLength } from 'class-validator';
import request from 'supertest';

class BaseUserDto {
  @IsString()
  @MinLength(2)
  name!: string;
}

class CreateUserDto extends BaseUserDto {
  @IsInt()
  @Min(0)
  age!: number;
}

class UserEntity {
  id = 1;
  name = 'Tom';

  @Exclude()
  password = 'secret';

  @Expose()
  get displayName() {
    return `#${this.id} ${this.name}`;
  }
}

@Controller()
class UsersController {
  @Post('users')
  create(@Body() dto: CreateUserDto) {
    return { isInstance: dto instanceof CreateUserDto, dto };
  }

  @Get('page')
  page(@Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number) {
    return { page, type: typeof page };
  }

  @Get('me')
  @UseInterceptors(ClassSerializerInterceptor)
  me() {
    return new UserEntity();
  }
}

describe('@nestjs/common', () => {
  describe('异常：响应体的形状', () => {
    it('内置异常：{ message, error, statusCode }', () => {
      expect(new BadRequestException('Invalid id').getResponse()).toEqual({
        message: 'Invalid id',
        error: 'Bad Request',
        statusCode: 400,
      });
    });

    it('HttpException(string)：只有 { statusCode, message }', () => {
      expect(new HttpException('Nope', 418).getResponse()).toBe('Nope');
      // 字符串响应在 BaseExceptionFilter 里才被包装成 { statusCode, message }
    });

    it('传对象：响应体原样使用（完全自定义）', () => {
      const ex = new HttpException({ code: 'E42', detail: 'x' }, 422);
      expect(ex.getResponse()).toEqual({ code: 'E42', detail: 'x' });
      expect(ex.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('cause：用于日志和调试，不会出现在响应体里', () => {
      const root = new Error('db down');
      const ex = new BadRequestException('Failed', { cause: root });
      expect(ex.cause).toBe(root);
      expect(JSON.stringify(ex.getResponse())).not.toContain('db down');
    });
  });

  describe('管道（直接 new 出来测，第 06 文档的“方式 3”）', () => {
    it('ParseIntPipe：非数字 → 400', async () => {
      const pipe = new ParseIntPipe();
      await expect(pipe.transform('42', { type: 'query' })).resolves.toBe(42);
      await expect(pipe.transform('4x', { type: 'query' })).rejects.toThrow(
        'Validation failed (numeric string is expected)',
      );
    });

    it('ParseUUIDPipe：可以限定版本', async () => {
      const v4 = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
      await expect(
        new ParseUUIDPipe({ version: '4' }).transform(v4, { type: 'param' }),
      ).resolves.toBe(v4);
      await expect(
        new ParseUUIDPipe({ version: '4' }).transform('not-a-uuid', {
          type: 'param',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('HTTP 场景：ValidationPipe / DefaultValuePipe / 序列化', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [UsersController],
      }).compile();
      app = moduleRef.createNestApplication({ logger: false });
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      await app.init();
    });

    afterAll(() => app.close());

    it('transform: true → body 变成 DTO 类的实例', async () => {
      const res = await request(app.getHttpServer())
        .post('/users')
        .send({ name: 'Tom', age: 3 })
        .expect(201);
      expect(res.body).toEqual({
        isInstance: true,
        dto: { name: 'Tom', age: 3 },
      });
    });

    it('继承：父类 DTO 上的校验规则同样生效（#17982 修过的区域）', async () => {
      const res = await request(app.getHttpServer())
        .post('/users')
        .send({ name: 'T', age: -1 })
        .expect(400);
      expect(res.body.message).toEqual(
        expect.arrayContaining([
          'name must be longer than or equal to 2 characters',
          'age must not be less than 0',
        ]),
      );
    });

    it('forbidNonWhitelisted：多余的字段 → 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/users')
        .send({ name: 'Tom', age: 3, isAdmin: true })
        .expect(400);
      expect(res.body.message).toEqual(['property isAdmin should not exist']);
    });

    it('DefaultValuePipe + ParseIntPipe：缺省值和类型转换', async () => {
      await request(app.getHttpServer())
        .get('/page')
        .expect(200, { page: 1, type: 'number' });
      await request(app.getHttpServer())
        .get('/page?page=7')
        .expect(200, { page: 7, type: 'number' });
    });

    it('ClassSerializerInterceptor：@Exclude 隐藏字段，@Expose 暴露 getter', async () => {
      await request(app.getHttpServer())
        .get('/me')
        .expect(200, { id: 1, name: 'Tom', displayName: '#1 Tom' });
    });
  });

  describe('ConfigurableModuleBuilder：自动生成 forRoot / forRootAsync', () => {
    interface DbOptions {
      url: string;
    }
    const { ConfigurableModuleClass, MODULE_OPTIONS_TOKEN } =
      new ConfigurableModuleBuilder<DbOptions>()
        .setClassMethodName('forRoot')
        .build();

    @Module({})
    class DbModule extends ConfigurableModuleClass {}

    it('forRoot(options) 把选项注册为 provider（对比练习 E4 的手写版本）', async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [DbModule.forRoot({ url: 'postgres://a' })],
      }).compile();
      expect(moduleRef.get(MODULE_OPTIONS_TOKEN)).toEqual({
        url: 'postgres://a',
      });
    });

    it('forRootAsync({ useFactory, inject })', async () => {
      @Module({
        providers: [{ provide: 'ENV_URL', useValue: 'mysql://b' }],
        exports: ['ENV_URL'],
      })
      class EnvModule {}

      const moduleRef = await Test.createTestingModule({
        imports: [
          DbModule.forRootAsync({
            imports: [EnvModule],
            useFactory: (url: string) => ({ url }),
            inject: ['ENV_URL'],
          }),
        ],
      }).compile();
      expect(moduleRef.get(MODULE_OPTIONS_TOKEN)).toEqual({ url: 'mysql://b' });
    });
  });

  describe('调查：@Optional() 构造函数参数分支里剩下的 getOwnMetadata 是 bug 吗？', () => {
    // 背景：#17944 把属性分支的 getOwnMetadata 改成了 getMetadata（只改了一个词）。
    // grep 发现参数分支仍是 getOwnMetadata（optional.decorator.ts:23）。用测试回答它是不是同类 bug。
    @Injectable()
    class Parent {
      constructor(@Optional() @Inject('MISSING') readonly dep?: string) {}
    }

    it('子类不写构造函数：继承父类的 @Optional 参数，仍然可选', async () => {
      @Injectable()
      class Child extends Parent {}

      const moduleRef = await Test.createTestingModule({
        providers: [Child],
      }).compile();
      expect(moduleRef.get(Child).dep).toBeUndefined();
    });

    it('子类重写构造函数：参数下标重新开始，不应继承父类的 @Optional', async () => {
      @Injectable()
      class Child extends Parent {
        constructor(@Inject('MISSING') dep: string) {
          super(dep);
        }
      }

      await expect(
        Test.createTestingModule({ providers: [Child] }).compile(),
      ).rejects.toThrow(/can't resolve dependencies of the Child/);
    });
    // 结论：两种情况都符合预期，参数分支用 getOwnMetadata 是有意为之，不是 bug。
  });

  describe('Logger', () => {
    it('ConsoleLogger({ json: true })：每行一个 JSON 对象，便于日志平台采集', () => {
      const write = vi
        .spyOn(process.stdout, 'write')
        .mockImplementation(() => true);
      new ConsoleLogger('Orders', { json: true }).log('created', { id: 7 });
      const line = JSON.parse(String(write.mock.calls[0][0]));
      write.mockRestore();

      expect(line).toMatchObject({
        level: 'log',
        context: 'Orders',
        message: 'created',
      });
      expect(line.pid).toBe(process.pid);
    });
  });
});
