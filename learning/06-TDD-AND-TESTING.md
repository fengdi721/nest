# 06：从零学写测试与 TDD

> 第 3 步。配套代码：`learning/tdd/`
> - `kata-1-parse-sort-pipe/`：**我演示**的完整 TDD 过程，每个红/绿都是一个提交
> - `kata-2-cats-crud/`：**你来做**的 CRUD 练习（测试清单 + 骨架 + 模板）

## 为什么这对你特别重要

- **对开源贡献**：Nest 的 CONTRIBUTING 写明 *All features or bug fixes must be tested*。
  没有测试的 PR 不会被合并。会写测试 = 会贡献。
- **对日常 CRUD 工作**：有了测试才敢重构，上线前不用手动点一遍 Postman。

---

## 一、基本概念（5 分钟）

### 1. 测试金字塔

```
          /\        e2e / 集成测试：启动 app，发真实 HTTP 请求（慢、少、最接近用户）
         /  \       Nest：integration/*/e2e、supertest
        /----\
       /      \     单元测试：只测一个类，依赖全部替换掉（快、多、定位精确）
      /________\    Nest：packages/*/test、Test.createTestingModule + useValue
```

一个功能通常 = **多个单元测试**（覆盖各种分支）+ **少量集成测试**（证明接线正确）。
上游提交 `b6295c799` 就是这个结构（见 03 文档）。

### 2. 一个测试的结构：AAA

```ts
it('should pass the sort fields to the repository', async () => {
  // Arrange 准备：数据、mock 的返回值
  repository.findAll.mockResolvedValue(cats);
  // Act 执行：只调用一次被测方法
  const result = await service.findAll(sort);
  // Assert 断言：结果 + （必要时）交互
  expect(result).toBe(cats);
  expect(repository.findAll).toHaveBeenCalledWith(sort);
});
```

### 3. 好测试的标准（FIRST）

| | 含义 | 反例 |
| --- | --- | --- |
| **F**ast | 毫秒级 | 单元测试里连真实数据库 |
| **I**ndependent | 测试之间互不影响，顺序随意 | 共享一个全局数组却不清空（第 04 课用 `beforeEach` 清空 `trace`） |
| **R**epeatable | 任何机器、任何时间结果一样 | 依赖当前时间、随机数、网络 |
| **S**elf-validating | 自动判断对错 | 只 `console.log` 让人看 |
| **T**imely | 和代码同时写（TDD：先写） | 上线后再补 |

命名：`describe('类名') → describe('方法名') → it('should <期望行为> when <条件>')`，
和上游一致（如 `packages/common/test/pipes/parse-int.pipe.spec.ts`）。

---

## 二、TDD：红 → 绿 → 重构

```
   ┌──────────────┐     ┌───────────────────┐     ┌──────────────────────┐
   │ 🔴 红         │ ──▶ │ 🟢 绿             │ ──▶ │ 🔵 重构               │ ──┐
   │ 写一个失败的   │     │ 写【最少】的代码   │     │ 改善代码，测试保持绿   │   │
   │ 测试          │     │ 让它通过          │     │                      │   │
   └──────────────┘     └───────────────────┘     └──────────────────────┘   │
          ▲                                                                   │
          └───────────────────────── 下一个测试 ◀──────────────────────────────┘
```

三条纪律：

1. **没有失败的测试，不写生产代码。**
2. **红要“红得正确”**：失败原因必须是断言不满足，而不是 import 错误、拼写错误。
   所以 kata 1 的第一步先写了一个返回 `undefined` 的空类，让失败变成
   `expected undefined to deeply equal [...]`。
3. **绿只写最少的代码**：哪怕看起来很“傻”（见下面的 *fake it*）。

两个技巧：

- **Fake it（伪实现）**：第一个测试只要求 `'name'` → `[{ field: 'name', order: 'asc' }]`，
  那就直接 `return [{ field: value, order: 'asc' }]`。
- **Triangulation（三角定位）**：再加一个不同的例子（`'name:desc'`），伪实现撑不住了，
  才被迫写出通用逻辑。**是测试在推动设计**，而不是一开始就想好全部代码。

---

## 三、Kata 1 回放：`ParseSortPipe`（我演示的完整过程）

需求：把 `GET /cats?sort=name:asc,createdAt:desc` 解析成
`[{ field: 'name', order: 'asc' }, { field: 'createdAt', order: 'desc' }]`。
这是 CRUD 列表接口里非常常见的需求。

| 轮次 | 🔴 新测试 | 红的原因（真实输出） | 🟢 最少改动 | 提交 |
| --- | --- | --- | --- | --- |
| 1 | `'name'` 默认升序 | `expected undefined to deeply equal [...]` | 直接返回固定结构（fake it） | `8d3b451` / `037d40b` |
| 2 | `'name:desc'` | 伪实现返回了 `asc` | `split(':')` | `9d92622` / `05c4aae` |
| 3 | 多个字段 `a:asc,b:desc` | 只返回了 1 个 | `split(',').map(...)` | `0953ffa` / `fc10d3f` |
| 4 | 去掉空格 `' name : desc '` | `field: ' name '` | `.map(s => s.trim())` | `aa0042d` / `af47ad5` |
| 5 | `undefined` / `''` / `'   '` → `[]` | `TypeError: ...reading 'split'` | 开头判空 | `883e2a3` / `89fd239` |
| 6 | `'name:up'` → 400 | `expected function to throw` | 校验方向 | `da4f5ec` / `9cae320` |
| 7 | 白名单 `allowedFields`，`'password'` → 400 | 没抛错 | 加构造参数并检查 | `f1b5a2e` / `32dac2a` |
| 8 | 重复字段 → 400 | 没抛错 | `Set` 记录已见字段 | `db7b277` / `b4fccb8` |
| 9 | 空字段 `'name,,age'`、`':desc'` → 400 | 没抛错 | 判断 `!field` | `789f90c` / `8fd81ac` |
| 🔵 | 重构：拆成 `parsePart` / `assertNoDuplicates`，加 `@Injectable` | 14 个测试全程保持绿 | | `7da5876` |
| + | 集成测试：真实 Controller + supertest，验证 400 的 JSON 结构 | | | `4c178a9` |

几点体会：

- 第 7 轮的白名单是**安全需求**：不让客户端按 `password` 之类字段排序。
  先写测试，等于先把需求写成了可执行的文档。
- 第 9 轮不是需求文档里的，是写完第 8 轮后**主动思考边界情况**发现的漏洞。
  TDD 的习惯会让你不停地问“还有什么输入会出问题？”
- 重构那一步改动很大，但有 14 个测试兜底，改完一跑全绿，心里有底。

### 自己回放这段历史

```bash
git log --reverse --oneline -- learning/tdd/kata-1-parse-sort-pipe
git show 9d92622            # 看某一个“红”提交加了什么测试
git show 05c4aae            # 看对应的“绿”提交改了什么代码
git diff 8d3b451 7da5876 -- learning/tdd/kata-1-parse-sort-pipe/parse-sort.pipe.ts
```

---

## 四、怎么知道测试写得好不好？——手动变异测试

**思路：故意把代码改坏，看有没有测试失败。** 如果改坏了测试还全绿，说明缺测试。

对 kata 1 做的 6 个“变异”（实际运行结果）：

| 故意改坏 | 结果 |
| --- | --- |
| 删掉 `assertNoDuplicates` | ✅ 1 个测试失败 |
| 白名单判断改成 `false` | ✅ 2 个失败（单元 + 集成） |
| 默认方向 `'asc'` 改成 `'desc'` | ✅ 3 个失败 |
| 不做 `trim()` | ✅ 2 个失败 |
| `!value?.trim()` 改成 `!value` | ✅ 1 个失败 |
| 删掉空字段检查 | ✅ 3 个失败 |

6 个变异全部被“杀死” → 这套测试确实保护了每一条行为。
（有专门的工具如 Stryker 自动做这件事，手动做几次就能建立直觉。）

---

## 五、测试替身速查（mock 不是只有一种）

| 名称 | 作用 | vitest / Nest 写法 | 本仓库例子 |
| --- | --- | --- | --- |
| **Stub** 桩 | 规定返回值 | `vi.fn().mockResolvedValue(x)` | kata 2 `repository.findAll.mockResolvedValue(cats)` |
| **Spy** 间谍 | 记录调用情况 | `expect(fn).toHaveBeenCalledWith(...)`、`vi.spyOn(obj, 'm')` | 第 07 课 spy `Logger.prototype.log` |
| **Mock** | stub + spy 合一 | `vi.fn()` 两者都能做 | kata 2 的整个 `repository` 对象 |
| **Fake** 假实现 | 真能工作的简化版 | 自己写一个类 | `InMemoryCatsRepository`、第 06 课替换 fastify `listen` |
| **Dummy** | 只为凑参数 | `{} as ArgumentMetadata` | 上游 `parse-int.pipe.spec.ts` |

在 Nest 里替换依赖的三种方式：

```ts
// 1. 直接在 providers 里替换（单元测试最常用）
Test.createTestingModule({
  providers: [CatsService, { provide: CatsRepository, useValue: mockRepo }],
});

// 2. 导入真实模块，只覆盖其中一个 provider（集成测试常用）
Test.createTestingModule({ imports: [CatsModule] })
  .overrideProvider(CatsRepository).useClass(InMemoryCatsRepository)
  .compile();

// 3. 不用 Nest，直接 new（纯函数式的类，例如 pipe）
const pipe = new ParseSortPipe({ allowedFields: ['name'] });
```

**什么时候 mock，什么时候用 fake？**
单元测试 service 时 mock repository（快、能精确控制每个分支）；
e2e 测试时用 fake（让整条链路真实运行，只是不连数据库）。
**不要 mock 被测对象自己**，也不要 mock 太多层：测的应该是“行为”，不是“实现细节”。

---

## 六、常见的坑

| 坑 | 现象 | 正确做法 |
| --- | --- | --- |
| 异步断言没 `await` / `return` | 测试永远通过 | `await expect(p).rejects.toThrow(...)` |
| `toBe` vs `toEqual` | 两个相同内容的对象 `toBe` 失败 | 比较引用用 `toBe`，比较内容用 `toEqual` |
| 测试间共享状态 | 单独跑通过，一起跑失败 | `beforeEach` 里重新创建 |
| 忘记 `app.close()` | vitest 不退出 / 端口占用 | `afterEach(() => app.close())` |
| 只测“快乐路径” | 线上报错没被覆盖 | 每个 `throw` 至少一个测试 |
| 断言错误信息太宽松 | `toThrow()` 任何错误都通过 | 带上类型或文案：`toThrow(NotFoundException)` |
| 在测试里看不到日志 | `TestingLogger` 吞掉 log | `.setLogger(new ConsoleLogger())`（见 05 文档） |

---

## 七、轮到你：Kata 2 · Cats CRUD

```
learning/tdd/kata-2-cats-crud/
├── cats.repository.ts     已完成：抽象 repository + 内存 fake
├── cats.service.ts        骨架，需求写在注释里，方法都抛 Not implemented
├── cats.controller.ts     只有 GET /cats，其余路由你来加
├── cats.service.spec.ts   单元测试：1 个模板 + 11 个 it.todo
└── cats.e2e.spec.ts       e2e 测试：1 个模板 + 8 个 it.todo
```

建议顺序：先把 `cats.service.spec.ts` 全部做完（由内向外），再做 e2e。

```bash
# 监听模式：保存文件自动重跑
npx vitest --config learning/vitest.config.mts learning/tdd/kata-2-cats-crud
```

每一轮：

1. 把一个 `it.todo('...')` 改成 `it('...', async () => { ... })`
2. 看到红，**读一下失败信息**，确认原因正确 → `git commit -m "test(learning): kata 2 red, <行为>"`
3. 写最少的实现 → 绿 → `git commit -m "test(learning): kata 2 green, <做了什么>"`
4. 想重构就重构，跑一遍仍是绿 → `refactor(learning): ...`

（我已经用一份参考实现验证过这些需求都能做通，然后删掉了参考实现。
写完后告诉我，我来做 code review。）

---

## 八、和贡献开源的联系

修 bug 的标准流程**本身就是 TDD**：

1. 先写一个**能复现 bug 的失败测试**（第 06 课对 #18052 就是这样做的，用 `it.fails` 标记）
2. 修代码让它变绿
3. PR 里同时提交测试和修复，评审者一眼就能看出“之前坏、现在好”

P18（为属性注入报错补测试）是只写测试、不改代码的 PR。
写的时候要做第四节的检查：**把 `messages.ts` 里那个分支改坏，你的新测试必须失败**。
这样才证明它真的覆盖到了。

## 本步产出

- 文档：本文件
- Kata 1：`ParseSortPipe` + 14 个单元测试 + 3 个集成测试，20 个 TDD 提交
- Kata 2：完整练习骨架（2 个模板测试 + 19 个待完成测试）
- 练习：`PRACTICES.md` 第六阶段 P19–P24
