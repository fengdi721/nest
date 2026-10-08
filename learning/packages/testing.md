# @nestjs/testing 贡献教程

> 配套测试：`learning/specs/packages/testing.spec.ts`（9 个）
> 练习：`PRACTICES.md` 第八阶段 · testing

## 1. 一句话定位

`Test.createTestingModule()` 背后的东西：用**和运行时完全相同的扫描器和注入器**搭一个 Nest 容器，
但允许你在实例化之前**替换**任何东西（provider、guard、模块……），并让日志保持安静。

| 规模 | 数据 |
| --- | --- |
| 源码 | 13 个文件，核心代码 **531 行** |
| 单元测试 | 7 个 spec |
| 2026 年以来的提交 | 以 `test(testing)` 为主，另有新功能 `CapturingLogger`（#17895，2026-09） |

**531 行，一个下午就能读完。** 推荐阅读顺序：

```
test.ts                     → Test.createTestingModule() 只是 new TestingModuleBuilder()
testing-module.builder.ts   → override*() 记下替换项；compile() 做真正的工作
testing-injector.ts         → 继承 core 的 Injector，加入 useMocker 的逻辑
testing-module.ts           → compile() 的结果：继承 NestApplicationContext，多了 createNestApplication()
services/                   → TestingLogger（静音）、CapturingLogger（记录 + 断言）
```

## 2. 核心流程：`compile()` 做了什么

`testing-module.builder.ts:104`：

```ts
this.applyLogger();                       // Logger.overrideLogger(new TestingLogger())  ← 默认静音
const scanner = new DependenciesScanner(...);
await scanner.scan(this.module, { overrides: this.getModuleOverloads() });  // ← overrideModule 在扫描时生效
this.applyOverloadsMap();                 // ← overrideProvider / overrideGuard… 在这里替换
await this.createInstancesOfDependencies(...);   // ← 和 NestFactory 一样的 InstanceLoader
scanner.applyApplicationProviders();
return new TestingModule(...);
```

对比 02 文档里 `NestFactory.initialize()` 的三行代码：**几乎一模一样**。
区别只有：日志静音、扫描时可以换模块、扫描后可以换 provider、注入器换成了 `TestingInjector`。

### `useMocker` 的实现（`testing-injector.ts`）

```ts
public async resolveComponentWrapper(...) {
  try {
    return await super.resolveComponentWrapper(...);   // 第 07 课：先本模块，再 imports
  } catch (err) {
    return this.mockWrapper(err, moduleRef, name, wrapper);   // 找不到 → 问 mocker 要替身
  }
}
// mockWrapper：没有 mocker，或 mocker 返回 undefined → 原样抛出那个 UnknownDependenciesException
```

**它重写的正是第 07 课读过的那个方法。** 前面学的知识在这里直接用上了。

## 3. 动手：配套测试证明了什么

| 测试 | 证明 |
| --- | --- |
| `overrideProvider().useValue()` | 替换深层依赖（`OrdersModule` 导入的 `PaymentsModule` 里的 provider） |
| override 是**原地替换** | `useFactory` 的 `inject` 在**原模块**里解析，看不到根模块的 provider；用 `@Global` 解决 |
| `overrideModule()` | 整个模块换掉 |
| `overrideGuard()` | 同一个 app，替换前 403、替换后 200 |
| 没有 `useMocker` | 缺依赖 → 第 07 课那条报错 |
| `useMocker` | 只对**真正缺失**的依赖调用；记录到它只被要了一次 `PaymentsClient` |
| `TestingLogger` | 默认吞掉 `log`，stdout 里看不到 |
| `CapturingLogger` | `assertLogged({ level, context, message, params })` |
| `CapturingLogger` + `NEST_DEBUG` | 注入器日志自带颜色码，要加 `NO_COLOR=1` 才能按纯文本断言 |

### 写测试时的两个发现

**1. override 是“原地替换”。**
我在根模块提供了 `'CURRENCY'`，然后 `overrideProvider(PaymentsClient).useFactory({ inject: ['CURRENCY'] })`，
结果报错：`argument "CURRENCY" at index [0] is available in the PaymentsModule module`。
原因：替换后的 provider 仍然属于 `PaymentsModule`，它的依赖按第 07 课的规则**从 PaymentsModule 开始找**。

**2. `CapturingLogger` 匹配不到注入器的调试日志。**
`assertLogged({ message: 'Found PaymentsClient in PaymentsModule' })` 失败。把捕获到的内容打出来一看：

```
"Found \u001b[96mPaymentsClient\u001b[39m\u001b[32m in \u001b[39m\u001b[95mPaymentsModule\u001b[39m"
```

`injector.ts` 用 `clc.cyanBright()` 等函数**把颜色码直接拼进了消息文本**，而是否上色只看 `NO_COLOR` 环境变量
（`packages/common/utils/cli-colors.util.ts`），和 logger 的选项无关。

## 4. 判断：这值得报告吗？

| 问题 | 结论 |
| --- | --- |
| 影响范围？ | `grep` 发现只有 `injector.ts`、`instance-wrapper.ts` 和 REPL 会把颜色写进消息。常规日志（路由映射、模块初始化）**不受影响** |
| 有变通办法吗？ | 有：设置 `NO_COLOR=1` |
| 有人报告过吗？ | 没有（`gh search issues "CapturingLogger"` 只找到引入它的 PR #17895） |
| 是新功能吗？ | 是，2026-09 才加入，作者可能还没考虑到这个场景 |

→ **结论：可以开一个 issue 讨论，不急着直接提 PR。** 可能的方向有两个：
`CapturingLogger` 匹配时去掉颜色码，或者注入器不往消息里拼颜色。选哪个应该由维护者决定。
issue 里附上本测试作为最小复现。

## 5. 上游测试

```bash
npx vitest run packages/testing
npx vitest run --config vitest.config.integration.mts integration/testing-module-override
npx vitest run --config vitest.config.integration.mts integration/auto-mock          # useMocker
npx vitest run --config vitest.config.integration.mts integration/hello-world/e2e/capturing-logger.spec.ts
```

## 6. 贡献切入点

1. **上面第 4 节的 issue**（低优先级，但你已经有完整的复现了）。
2. **新功能的边界情况**：`CapturingLogger` 刚加入不久。新功能往往有作者没想到的用法，
   比如 `params` 匹配嵌套对象、`message` 为 lazy 函数、`clear()` 之后的行为……
   读 `capturing-logger.service.spec.ts`，看哪些情况还没被测到。
3. **文档**：“override 是原地替换”这一点，docs.nestjs.com 的 Testing 章节讲清楚了吗？

## 7. 练习

见 `PRACTICES.md` 第八阶段 · testing。
