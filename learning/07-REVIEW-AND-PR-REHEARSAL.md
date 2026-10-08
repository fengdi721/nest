# 07：评审真实 PR + 完整提 PR 演练

> 第 4 步。这一步没有新的学习测试，产出是**一次真实的 PR 评审**和**一个开在自己 fork 上的 PR**：
> https://github.com/fengdi721/nest/pull/1

## 本步目标

前面三步练的是“读代码”和“写测试”。真正参与开源，还需要两种能力：

1. **评审别人的代码**：维护者最缺的就是靠谱的评审者，这也是新人最容易做出贡献的地方。
2. **走完一次提 PR 的全流程**：查重 → 开分支 → 改动 → 验证 → 提交 → 推送 → 开 PR、填模板。

---

## 一、第一课：查重会改变计划

原计划是给 `FastifyAdapter.listen()` 补单元测试（P13 里发现的缺口）。动手前先查重：

```bash
gh pr list --repo nestjs/nest --search "fastify listen" --state all
gh pr view 18053 --repo nestjs/nest --json files --jq '.files[].path'
```

结果：仍在 open 的 PR #18053（修复 #18052）**已经给 `listen()` 加了 8 个单元测试**。
如果我们再提一个，就是重复劳动，两个 PR 还会改到同一个文件、互相冲突。

> **结论：改变计划。** 不提重复的 PR，改为**评审**这个 PR（它当时 0 个 review、0 条评论）。
> 记住这个顺序：**先查重，再动手。** 这一步只要 1 分钟，却可能省下几个小时。

---

## 二、评审一个真实 PR：#18053 `fix(fastify): listen on a socket path`

### 评审流程（任何 PR 都适用）

```bash
# 1. 把 PR 检出到本地一个单独的分支（不影响自己的分支）
gh pr checkout 18053 --repo nestjs/nest --branch review/pr-18053

# 2. 看全貌：改了哪些文件、提交信息写了什么
git diff --stat upstream/master...HEAD
git show HEAD --format=%B -s

# 3. 看 CI 和是否能合并
gh pr view 18053 --repo nestjs/nest --json mergeable,statusCheckRollup
git rev-list --count HEAD..upstream/master            # 落后 master 多少个提交
git merge-tree --write-tree upstream/master HEAD      # 和最新 master 有没有冲突

# 4. 跑 PR 自己的测试
npx vitest run packages/platform-fastify/test/adapters/fastify-adapter.spec.ts -t listen
npx vitest run --config vitest.config.integration.mts integration/hello-world/e2e/fastify-listen-socket-path.spec.ts

# 5. 自己独立验证（用自己的测试，而不是只信 PR 的测试）
# 6. 对修复做变异测试，检验 PR 测试的质量
# 7. 想边界情况
```

### 评审结果

| 检查项 | 结果 |
| --- | --- |
| 改动范围 | 3 个文件：修复 6 行 + 单元测试 8 个 + e2e 测试 3 个（“修复 + 单元 + e2e”的标准结构） |
| 提交信息 | 写清了现象、根因（指出是 `522b9912ba` 引入的）、新行为，结尾 `Closes #18052`。**值得学习的写法** |
| CI | 4 项全部通过 |
| 可合并性 | 落后 master 12 个提交，但和最新 master **没有冲突** |
| PR 自带测试 | 单元 8/8，e2e 3/3 通过 |
| **我们自己的复现测试** | 第 06 课的两个测试都翻转了：`BUG` 测试失败，`it.fails` 报 `Expect test to fail` → 证明 bug 确实修好了 |
| 变异测试 | 4 个变异全部被 PR 的测试抓到（见下表） |

对修复代码做的 4 个变异：

| 故意改坏 | 失败的测试数 |
| --- | --- |
| 删掉整个修复 | 5 |
| `Number.isNaN(+x)` 改成 `Number.isNaN(parseInt(x))`（`'3000abc'` 会变成端口 3000） | 1 |
| 对路径也保留 host | 2 |
| 丢掉 callback | 5 |

→ PR 的测试质量很高。

### 想边界情况：和 Node 自己的规则对比

Express 底层用的是 Node 的 `net.Server.listen()`，它也要判断一个字符串是路径还是端口。
我在 scratch 目录写了个小脚本，实际调用 `net.createServer().listen(arg)`：

| 参数 | Node 的处理 | PR 的处理 |
| --- | --- | --- |
| `"abc.sock"` | 路径 | 路径 ✅ |
| `" 8123 "` | 端口 8123 | 端口 8123 ✅ |
| `"0x1F90"` | 端口 8080 | 端口 8080 ✅ |
| `"1e3"` | 端口 1000 | 端口 1000 ✅ |
| `"-1"` | **路径** | **端口 -1** ⚠️ |

只有负数字符串的处理不一样。实际中几乎没人会这么用，所以这是一个 **nit**（小建议），不应该阻塞合并。

### 评审意见草稿（还没有发出）

评审意见分级是一种基本礼仪：**blocking**（必须改）、**suggestion**（建议）、**nit**（小问题，可以忽略）。
先肯定，再给具体、可验证的意见：

```markdown
Thanks for the thorough fix and the clear commit message!

I checked it out locally:
- unit tests (8) and the new e2e test (3) pass, and the branch merges cleanly with the latest master
- an independent reproduction of #18052 that I wrote before seeing this PR now passes
- I mutated the fix (removed it, used `parseInt` instead of `+`, kept the host for paths,
  dropped the callback), and each mutant is caught by the new tests

nit (non-blocking): Node's own `net` treats a string as a pipe name when `Number(x) >= 0` is
false, so `'-1'` is a path in Node/Express but becomes port `-1` here. It is very unlikely
to matter in practice; just mentioning it in case you want to mirror Node's rule exactly.
```

> ⚠️ 这条评论会以你的 GitHub 账号**公开**发出，所以要由你决定是否发、怎么改。
> 想发的话，可以直接在 PR 页面粘贴，也可以用命令：
> `gh pr comment 18053 --repo nestjs/nest --body-file <文件>`

---

## 三、提 PR 全流程演练：CONTRIBUTING 和工具不一致

### 1. 选题与查重

第 2 步时，commitlint 拦下了一个 73 个字符的提交标题，而 CONTRIBUTING.md 写的是 100。
继续查又发现一处：文档说代码按 **100** 字符换行，但 `.prettierrc` 没有设置 `printWidth`，
Prettier 默认是 **80**。

```bash
gh search issues "header-max-length" --repo nestjs/nest       # 无相关结果
gh search issues "commitlint 72" --repo nestjs/nest            # 无相关结果
git log --oneline upstream/master -- CONTRIBUTING.md           # 看到别人修 CONTRIBUTING 的 PR 被合并过
```

### 2. 判断改哪一边

这类“文档和工具不一致”的问题，有两种修法：

- **A. 改文档**：写成 72 / 80（不改变任何行为，风险最低）
- **B. 改配置**：把 commitlint 的上限调到 100（改变了所有贡献者的检查规则）

还查到一个容易让人迷惑的现象：上游最近 500 个提交里有 101 个标题超过 72 个字符。
原因是 GitHub squash 合并时会在标题后加上 ` (#18048)`，而 hook 只检查贡献者自己写的那次提交，两者不冲突。

选了 **A**，并在 PR 描述里写明 B 这个备选方案，**把最终决定权交给维护者**。

### 3. 从最新的 upstream 开分支

```bash
git fetch upstream
git checkout -b docs/contributing-tooling-limits upstream/master
```

注意：新分支里**没有** `learning/` 目录，因为它是从 upstream 开出来的，不是从学习分支开的。
这就保证了 PR 里不会混进无关文件。

### 4. 最小改动 + 用工具实测验证

只改 CONTRIBUTING.md 的两处（+4 −3 行）。改之前，先用工具**实测**文档里要写的每个数字：

```bash
npx prettier --check packages/core/injector/injector.ts                    # 通过 → 当前规则 OK
npx prettier --print-width 100 --check packages/core/injector/injector.ts  # 报格式问题 → 实际不是 100
echo "<72 个字符的标题>" | npx commitlint     # 通过
echo "<73 个字符的标题>" | npx commitlint     # ✖ header-max-length
printf 'docs: x\n\n<150 个字符>\n' | npx commitlint   # 通过 → 正文行长不检查
```

### 5. 提交：写“为什么”

```
docs: align contributing line limits with prettier and commitlint   ← 66 个字符，≤ 72

The guide says code wraps at 100 characters and every commit message
line may be 100 characters long. The tooling enforces other limits:
- .prettierrc sets no printWidth, so Prettier wraps code at its default of 80 ...
- .commitlintrc.json extends @commitlint/config-angular ... header-max-length to 72 ...
```

- 修改 CONTRIBUTING 的提交没有对应的 package，所以不写 scope（参照上游 `7f4f0b800 docs: ...`）
- 正文讲**为什么**改，以及证据在哪里

### 6. 推送、开 PR、填模板

```bash
git push -u origin docs/contributing-tooling-limits
gh pr create --repo fengdi721/nest --base master \
  --head docs/contributing-tooling-limits --title "docs: ..." --body-file pr-body.md
```

PR 描述完整填写了上游模板：勾选项、当前行为（用表格列出“文档写的 / 工具实际 / 来源”）、
验证方法、查重结果、新行为、备选方案、是否破坏性变更。
→ https://github.com/fengdi721/nest/pull/1

### 7. 开 PR 后的自查

```bash
gh pr view 1 --repo fengdi721/nest --json files,commits
# → 只有 CONTRIBUTING.md，1 个提交 ✅
```

---

## 四、要不要真的提交到 nestjs/nest？

这个 PR 已经满足上游的要求，由你来决定：

| 选项 | 做法 |
| --- | --- |
| 提交到上游 | `gh pr create --repo nestjs/nest --base master --head fengdi721:docs/contributing-tooling-limits --body-file ...`（描述里删掉第一行的“Rehearsal”说明） |
| 先不提 | 保留在 fork 上，等你熟悉流程后再说 |

提交后可能遇到的情况：被合并、维护者选择方案 B、或者被关闭（例如维护者认为不重要）。
**被关闭也很正常，不是失败**：它不代表你做错了，只是维护者对优先级的判断。

---

## 本步产出

- 评审：本地完整评审了 nestjs/nest#18053，并写好评审意见草稿（未发出）
- PR 演练：https://github.com/fengdi721/nest/pull/1（1 个提交，只改 CONTRIBUTING.md）
- 本地分支：`review/pr-18053`（评审用，可删除）、`docs/contributing-tooling-limits`（PR 分支）
- 练习：`PRACTICES.md` 第七阶段 P26–P30
