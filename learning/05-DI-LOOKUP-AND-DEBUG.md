# 05：从一条报错信息倒推源码：依赖查找与调试

> 第 2 步（中文文档从这一篇开始）。
> 配套测试：`learning/specs/07-dependency-lookup.spec.ts`（6 个测试）。

## 本步目标

做 CRUD 时最常见的启动报错是：

```
Nest can't resolve dependencies of the UsersService (?, ConfigService).
Please make sure that the argument DbService at index [0] is available in the UsersModule module.
```

以前遇到它只会“加个 import 试试”。这一步要弄清楚三件事：

1. 这条信息是**哪段代码**拼出来的？每个部分是什么意思？
2. 注入器**按什么顺序、去哪里**找依赖？
3. 遇到复杂情况时，怎样用框架**自带的调试开关**看清查找过程？

顺便练习一个通用的读源码技巧：**从报错信息倒推**。

---

## 一、技巧：从报错文案倒推到源码

任何开源项目都适用，三步：

```bash
# 1. 用报错里一段“固定不变”的文字去搜索
grep -rn "can't resolve dependencies" packages/core
#  → packages/core/errors/messages.ts   UNKNOWN_DEPENDENCIES_MESSAGE

# 2. 看谁使用了这个文案
grep -rn "UNKNOWN_DEPENDENCIES_MESSAGE" packages/core
#  → packages/core/errors/exceptions/unknown-dependencies.exception.ts

# 3. 看谁抛出这个异常
grep -rn "new UnknownDependenciesException" packages/core
#  → packages/core/injector/injector.ts   lookupComponentInParentModules()
```

三次 grep，就从“一句报错”定位到了“注入器的查找算法”。
（最后还可以找对应的测试：`packages/core/test/errors/test/messages.spec.ts`。）

---

## 二、查找算法（`packages/core/injector/injector.ts`）

简化后的伪代码：

```ts
resolveComponentWrapper(moduleRef, token)       // ~580 行
  ├─ 在【当前模块】的 providers 里找 token
  │    找到 → 返回
  └─ lookupComponentInParentModules()           // ~707 行
       └─ lookupComponentInImports(moduleRef, token, registry, isTraversing=false)   // ~732 行
            for (child of moduleRef.imports):
               if (isTraversing && !moduleRef.exports.has(child)) continue   // ★ 关键
               if (registry.has(child)) continue                              // 防止循环
               if (child.exports.has(token) && child.providers.has(token))
                    → 找到，返回
               else
                    → 递归 lookupComponentInImports(child, token, registry, isTraversing=true)
       找不到 → throw new UnknownDependenciesException(...)
```

### ★ 关键结论：imports 不具有传递性

```
AppModule ──imports──▶ BModule ──imports──▶ DbModule (exports DbService)
```

- 第一层（AppModule 的直接 imports）会全部检查。
- 进入递归后（`isTraversing = true`），**只会继续进入 BModule 自己 `exports` 了的子模块**。
- 所以 BModule 只 `imports: [DbModule]` → AppModule **看不到** DbService；
  BModule 写成 `imports: [DbModule], exports: [DbModule]`（re-export）→ **能看到**。

测试证明：`specs/07` › “imports 不具有传递性” / “re-export 模块后就能看到”。

> 工作中的启示：做“共享模块”（SharedModule、CoreModule）时，把常用模块放进
> `exports` 再导出一次，使用方只需导入 SharedModule。

---

## 三、报错信息解剖（`messages.ts` → `UNKNOWN_DEPENDENCIES_MESSAGE`）

```
Nest can't resolve dependencies of the OrdersService (Logger2, ?).
                                       ───────────── ─────────
                                       出错的 provider  构造函数参数列表，缺失的那个写成 ?

Please make sure that the argument DbService at index [1] is available in the RootTestModule module.
                                   ─────────          ───                    ──────────────
                                   缺失的 token       参数下标              在哪个模块里找的
```

这段代码有 **3 个分支**：

| 分支 | 触发条件 | 文案特征 | 上游是否有测试 |
| --- | --- | --- | --- |
| 普通 | 构造函数参数找不到 | `(A, ?)` + `at index [n]` | ✅ `messages.spec.ts` 多个用例 |
| `import type` | 参数类型在运行时是 `undefined` / `Object` | `appears to be undefined at runtime` + ❌/✅ 示例 | ✅ 2 个用例 |
| 属性注入 | `@Inject()` 写在**属性**上，`index` 为空 | `the "cache" property is available in the current context` | ❌ **没找到任何断言** |

`import type` 分支很实用：用 `interface` 或 `import type { X }` 当构造函数参数类型时，
TypeScript 写进 `design:paramtypes` 的是 `Object`，注入器无从得知真正类型。
Nest 会识别这种情况并给出专门提示（`specs/07` 有测试）。

### 发现：一个真实的测试覆盖缺口

我搜索了整个仓库，没有任何测试断言过属性注入分支的文案：

```bash
grep -rln "property is available" packages/*/test integration   # 结果为空
```

这是**第一个上游 PR 的好候选**：只加测试，不改行为，风险最低，维护者也容易接受。
（`specs/07` 的“属性注入缺失”用例已经证明这条分支能触发。见练习 P18。）

---

## 四、调试开关：`NEST_DEBUG`

不用自己往源码里加 `console.log`，框架自带调试日志：

```ts
// packages/core/injector/helpers/is-debug-mode.util.ts
export function isDebugMode(): boolean {
  return !!process.env.NEST_DEBUG;
}
```

在你自己的项目里直接用：

```bash
NEST_DEBUG=1 npm run start:dev
```

本仓库实际运行得到的输出（UsersService 依赖 Logger2 和 DbService）：

```
[InjectorLogger] Resolving dependency Logger2 in the UsersService provider
[InjectorLogger] Looking for Logger2 in RootTestModule
[InjectorLogger] Found Logger2 in RootTestModule
[InjectorLogger] Resolving dependency DbService in the UsersService provider
[InjectorLogger] Looking for DbService in RootTestModule      ← 先找本模块
[InjectorLogger] Looking for DbService in DbModule            ← 再找 imports
[InjectorLogger] Found DbService in DbModule
[InstanceLoader] DbModule dependencies initialized
```

正好对应第二节的算法：**先本模块，再 imports**。

### ⚠️ 坑：在测试里看不到日志

第一次在 vitest 里设置 `NEST_DEBUG=1` 时，什么都没打印。追查发现：

```ts
// packages/testing/services/testing-logger.service.ts
export class TestingLogger extends ConsoleLogger {
  log(message: string) {}      // ← 被吞掉了
  warn(message: string) {}
  debug(message: string) {}
  ...
  error(...) { return super.error(...) }   // 只保留 error
}
```

`Test.createTestingModule().compile()` 默认用 `Logger.overrideLogger(new TestingLogger())`
（`packages/testing/testing-module.builder.ts:211`）。想在测试里看日志：

```ts
await Test.createTestingModule({ ... })
  .setLogger(new ConsoleLogger())   // 换回真正的 logger
  .compile();
```

---

## 五、观察练习：值得为它提 PR 吗？

读 `printResolvingDependenciesLog` 时会注意到：

```ts
`${clc.green(` provider ${isAlias ? '(alias)' : ''}`)}`
```

不是别名时，日志末尾会多一个空格（`...UsersService provider `）。
**这值得提 PR 吗？** 大概率不值得：纯外观问题、对用户没有影响，维护者处理它的成本
比收益高。判断“什么值得提”和会写代码一样重要。
对比：第三节的测试缺口能防止将来改坏一条用户真的会看到的报错，价值高得多。

---

## 本步产出

- 文档：本文件
- 测试：`learning/specs/07-dependency-lookup.spec.ts`，共 6 个，全部通过
  - imports 不传递 / re-export 后可见
  - 报错信息结构（`?`、下标、模块名）
  - 属性注入分支（上游缺少的测试）
  - `interface` / `import type` 分支
  - `NEST_DEBUG` 日志顺序
- 练习：`PRACTICES.md` 第五阶段 P15–P18
