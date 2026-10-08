# @nestjs/common 贡献教程

> 配套测试：`learning/specs/packages/common.spec.ts`（16 个）+ 第 01 课 `specs/01-decorators-are-metadata.spec.ts`
> 练习：`PRACTICES.md` 第八阶段 · common

## 1. 一句话定位

**你在业务代码里 import 的几乎所有东西**：装饰器、异常、管道、拦截器接口、Logger、
`ConfigurableModuleBuilder`、`StreamableFile`……
关键原则（第 01 课）：**common 里没有运行时引擎**。装饰器只写元数据，真正的工作由 core 完成。

| 规模 | 数据 |
| --- | --- |
| 源码 | 202 个文件（仓库里最多） |
| 单元测试 | 83 个 spec |
| 2026-04 以来的提交 | 53 个 |

## 2. 目录地图

| 路径 | 内容 | 对应的测试 |
| --- | --- | --- |
| `decorators/core/` | `@Injectable` `@Inject` `@Optional` `@UseGuards`… | 第 01 课 |
| `decorators/http/` | `@Get` `@Body` `@Query` `@Param`… | 第 01 课 |
| `decorators/modules/` | `@Module` `@Global` | 第 01、02 课 |
| `exceptions/` | `HttpException` + 21 个内置异常（**一个状态码一个文件**） | 本课“异常” |
| `pipes/` | `ValidationPipe`、`ParseIntPipe`、`ParseUUIDPipe`、`DefaultValuePipe`… | 本课“管道”，kata 1 |
| `serializer/` | `ClassSerializerInterceptor`、`StandardSchemaSerializerInterceptor` | 本课“序列化” |
| `module-utils/` | `ConfigurableModuleBuilder`：自动生成 `forRoot` / `forRootAsync` | 本课 |
| `services/` | `Logger`、`ConsoleLogger`（支持 json 输出、日志级别） | 本课“Logger”，testing 教程 |
| `file-stream/` | `StreamableFile` | — |
| `interfaces/` | 所有公共接口：`PipeTransform`、`CanActivate`、`HttpServer`… | — |
| `utils/` | 共享工具：`isNil`、`clc`（颜色）… | — |
| `internal.ts` | 只给兄弟包用的导出，**不是公共 API** | — |

## 3. 动手：配套测试证明了什么

| 主题 | 测试 | 证明 |
| --- | --- | --- |
| 异常 | 内置异常 | 响应体 `{ message, error, statusCode }` |
| | `HttpException(string)` | `getResponse()` 只是字符串，由过滤器包装 |
| | 传对象 | 响应体完全自定义 |
| | `cause` | 只用于日志，**不会泄露到响应体** |
| 管道 | `ParseIntPipe` | 直接 `new` 出来测，不需要启动 app |
| | `ParseUUIDPipe({ version })` | 版本限制（最近刚加了 v1/v2/v6/v8 支持，#17904） |
| ValidationPipe | `transform: true` | body 变成 DTO 类的实例 |
| | 继承 | 父类 DTO 的校验规则在子类上同样生效 |
| | `forbidNonWhitelisted` | 多余字段 → 400 `property isAdmin should not exist` |
| | `DefaultValuePipe` + `ParseIntPipe` | 管道可以串联：先填默认值，再转类型 |
| 序列化 | `ClassSerializerInterceptor` | `@Exclude` 隐藏 password，`@Expose` 暴露 getter |
| 模块工具 | `ConfigurableModuleBuilder` | 自动生成 `forRoot` / `forRootAsync`（对比练习 E4 手写的版本） |
| Logger | `ConsoleLogger({ json: true })` | 每行一个 JSON，带 level、context、pid |
| **调查** | `@Optional()` 参数继承 ×2 | 见第 4 节 |

## 4. 案例：顺着一个修复找同类问题

### 主题：继承

common 最近的修复里，有一类反复出现：

```
fix(common): preserve parent validation constraints (#17982)
fix(common): let a redeclared `@Inject()` property replace the parent's (#17949)
fix(common): keep inherited `@Optional()` properties optional (#17944)
```

都是**子类和父类之间的元数据**问题。看 #17944 的改动（`git show 97c6e4fcd`），**只改了一个词**：

```diff
-      Reflect.getOwnMetadata(OPTIONAL_PROPERTY_DEPS_METADATA, target.constructor) || [];
+      Reflect.getMetadata(OPTIONAL_PROPERTY_DEPS_METADATA, target.constructor) || [];
```

- `getOwnMetadata`：只读**这个类自己**的元数据
- `getMetadata`：沿**原型链**往上读，能读到父类的

提交信息解释了后果：子类自己声明一个 `@Optional()` 属性后，就把父类的可选属性列表**覆盖**了，
父类的可选依赖变成了必需依赖。

### 顺藤摸瓜：还有别的 `getOwnMetadata` 吗？

```bash
grep -rn "getOwnMetadata" packages/common | grep -v /test/
# packages/common/decorators/core/optional.decorator.ts:23  ← @Optional() 的【构造函数参数】分支
```

只剩一处。它是同样的 bug 吗？**不靠猜，写测试回答：**

| 场景 | 期望 | 结果 |
| --- | --- | --- |
| 子类**不写**构造函数 | 继承父类构造函数，`@Optional` 参数仍然可选 | ✅ 可选 |
| 子类**重写**构造函数 | 参数下标重新开始，不应继承父类的 `@Optional` | ✅ 必需 |

**结论：参数分支用 `getOwnMetadata` 是有意为之，不是 bug。**
再去注入器里找答案，`packages/core/injector/injector.ts` 的 `reflectOptionalParams()`：

```ts
const ctorOwner = this.getConstructorOwner(type);   // 沿原型链找到【真正声明构造函数的那个类】
return Reflect.getOwnMetadata(OPTIONAL_DEPS_METADATA, ctorOwner) || [];
```

`getConstructorOwner()` 的注释写得很清楚（大意）：子类没有自己的构造函数时，继承父类的参数类型和
`@Optional()` 标记；子类重新声明了构造函数时，**不能**继承父类的标记，因为两者的参数毫无关系。
我们的两个测试正好对应这两句话。

> 💡 一个代码模式（`getOwnMetadata`）在不同位置可能对，也可能错。
> **判断标准是“语义”**：属性会被继承，所以属性分支要读整条原型链；
> 构造函数参数随构造函数一起被替换，所以要读“构造函数所有者”自己的元数据。

> 这次调查没找到 bug，但它示范了一个通用的方法：**读懂一个修复 → 搜索同样的代码模式 → 用测试逐个确认**。
> 这个方法在 microservices（多个传输层）、platform（express/fastify）里同样适用。

## 5. 上游测试

```bash
npx vitest run packages/common
npx vitest run packages/common/test/pipes
npx vitest run packages/common/test/decorators/optional.decorator.spec.ts
npx vitest run --config vitest.config.integration.mts integration/hello-world/e2e/local-pipes.spec.ts
```

上游 common 的测试大多是**纯单元测试**：直接 `new` 一个管道 / 异常，或者对一个类应用装饰器后读元数据。
很少需要启动 app，是最容易上手的一类测试。

## 6. 贡献切入点

1. **继承相关的边界情况**（第 4 节的方法）：`@UseGuards`、`@SetMetadata`、`@Version` 等装饰器在
   子类 / 父类 controller 上组合使用时，元数据是合并、覆盖，还是丢失？
2. **ValidationPipe 的选项组合**：`whitelist`、`transform`、`groups`、`skipMissingProperties`……
   选项很多，组合起来的行为未必都被测过。最近合并的 `test(common): cover serializer context group overrides (#18026)`
   就是一个**只补测试**的 PR。
3. **新功能**：`ParseUUIDPipe` 的版本支持刚扩展过（#17904、#17920），`ConsoleLogger` 的 json 输出刚修过（#17893）。

## 7. 练习

见 `PRACTICES.md` 第八阶段 · common。
