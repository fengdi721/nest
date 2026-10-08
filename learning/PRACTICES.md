# Practices: get familiar with the process by doing it

Tick each box as you finish it, and commit the change to this file
(`docs(learning): complete P3`). Writing the commit is part of the practice.

## Stage 1: Orientation (repo anatomy)

- [ ] **P1. Read the guide files.** Read `Readme.md`, `CONTRIBUTING.md` and
      `.github/PULL_REQUEST_TEMPLATE.md`. Write 3 rules you did not know into JOURNAL.md.
- [ ] **P2. Anatomy of a real fix.** Run `git log --oneline -15`, pick one `fix(...)`
      commit and `git show --stat <sha>`. Answer in JOURNAL.md: which package?
      Which source file? Which unit test? Was there an e2e test?
- [ ] **P3. Follow an error to its source.** Run
      `grep -rn "can't resolve dependencies" packages/core` and find the function
      that builds the message. Then find which test asserts it
      (`grep -rn "UnknownDependenciesException" packages/core/test`).

## Stage 2: Reading the engine (with lessons 01–05)

- [ ] **P4. Run the lessons.** Run `npx vitest run --config learning/vitest.config.mts`.
      All green, 4 skipped (the exercises).
- [ ] **P5. Break a lesson on purpose.** In `specs/02`, remove `exports: [Logger]`
      from `SharedModule` and read the full error message. Restore it.
- [ ] **P6. Instrument the engine.** Add the `console.log` from
      02-HOW-NEST-BOOTS.md › "debugging trick", run `specs/02`, and paste the
      resolution order into JOURNAL.md. Then `git checkout packages/`.

## Stage 3: Tests (with lesson 04 + exercises)

- [ ] **P7. Solve E1–E4** in `learning/exercises/exercises.spec.ts`
      (one commit per exercise: `test(learning): solve E2 forwardRef`).
      <details><summary>Hints (only after 15 minutes of trying)</summary>

      - E1: `ctx.switchToHttp().getRequest().headers['user-agent']`
      - E2: `constructor(@Inject(forwardRef(() => B)) readonly b: B)`, on both sides.
        First try **without** forwardRef and read the error.
      - E3: `@Global()` alone is not enough: the provider must also be in `exports`.
      - E4: `{ module: DbModule, providers: [{ provide: 'DB_URL', useValue: url }], exports: ['DB_URL'] }`
      </details>
- [ ] **P8. Run upstream tests for one package.**
      `npx vitest run packages/common` then `npx vitest run packages/core/test/injector`.
      Note the counts and durations in JOURNAL.md.
- [ ] **P9. Write a lesson yourself:** `learning/specs/07-global-prefix.spec.ts`,
      proving `app.setGlobalPrefix('api', { exclude: ['health'] })` with supertest.
      Read `packages/core/application-config.ts` first.

## Stage 4: The contribution loop (on GitHub)

- [ ] **P10. Sync ritual.** Update `master` from upstream and push it to your
      fork (commands in 04-CONTRIBUTION-WORKFLOW.md §1). Do this weekly.
- [ ] **P11. Triage a real issue.** Read nestjs/nest#18052, then `specs/06`. Read
      the reporter's fix PR #18053 and compare it with what you would have done.
      When it is merged: rebase `learning/first-steps` onto `upstream/master`,
      watch `it.fails` start failing, and flip it to `it`.
- [ ] **P12. Review an open PR** (read only): `gh pr list --repo nestjs/nest`,
      `gh pr checkout <n> --repo nestjs/nest`, run the touched package's tests.
      Write in JOURNAL.md what you would comment. (Post only when you have
      something genuinely useful to say.)
- [ ] **P13. Dry-run PR on your own fork.** Make a branch from `upstream/master`,
      add a missing unit test (e.g. `FastifyAdapter.listen()` with a number / with
      `{ host, port }`: there are none today), commit it with the convention, push
      it, and open a PR **against your fork's master** (`--repo fengdi721/nest`).
      Fill in the template. This rehearses everything with zero risk.
- [ ] **P14. First real contribution.** Docs typo/clarification in
      `nestjs/docs.nestjs.com`, a missing test upstream, or a confirmed
      reproduction comment on a `needs triage` issue.

## 第五阶段：从报错倒推源码 & 调试（配合 05 文档 + specs/07）

- [ ] **P15. 三次 grep 定位。** 不看文档，自己从
      `Nest can't resolve dependencies` 一路 grep 到 `injector.ts` 里抛异常的那一行，
      把每一步的命令和结果写进 JOURNAL.md。
- [ ] **P16. 在自己的工作项目里用 `NEST_DEBUG=1` 启动一次。** 挑一个依赖层级较深的
      service，对照日志画出它的查找路径（先本模块 → 再 imports）。
- [ ] **P17. 换一个报错再倒推一次。** 故意在 `specs/02` 里制造循环依赖
      （A ↔ B，不用 forwardRef），用同样的方法找到报错的出处
      （提示：`packages/core/errors/exceptions/` 下找）。
- [ ] **P18. 准备第一个上游 PR（只做到本地，先不提交到 nestjs）：**
      1. `git fetch upstream && git checkout -b test/unknown-deps-property-message upstream/master`
      2. 在 `packages/core/test/errors/test/messages.spec.ts` 的 `UNKNOWN_DEPENDENCIES_MESSAGE`
         `describe` 里，**模仿已有用例的写法**，为“属性注入”分支（`index` 为 `undefined`、
         `key: 'cache'`）加一个测试
      3. `npx vitest run packages/core/test/errors` 通过
      4. 提交信息：`test(core): cover property-based unknown dependency message`
      5. 推到自己的 fork，**向自己 fork 的 master** 开 PR 演练一遍模板
      6. 先 `gh pr list --repo nestjs/nest --search "messages.spec"` 确认没人在做，
         然后再决定是否向上游提交（下一步一起做）

## 第六阶段：写测试与 TDD（配合 06 文档 + learning/tdd）

- [ ] **P19. 回放 kata 1。** 用 `git log --reverse --oneline -- learning/tdd/kata-1-parse-sort-pipe`
      逐个 `git show` 红/绿提交。每一轮先**猜**绿提交会怎么改，再看答案。
- [ ] **P20. 自己重做 kata 1。** 新建 `learning/tdd/my-kata-1/`，不看答案，从第一个测试开始
      重新 TDD 一遍 `ParseSortPipe`。完成后和我的版本对比，写下差异到 JOURNAL.md。
- [ ] **P21. 完成 kata 2 单元测试**（`cats.service.spec.ts`，11 个 todo），每个红/绿各一次提交。
- [ ] **P22. 完成 kata 2 e2e**（`cats.e2e.spec.ts`，8 个 todo），并补齐 controller 路由。
- [ ] **P23. 给 kata 2 做变异测试。** 至少改坏 5 处（例如删掉 `trim()`、把 `< 0` 改成 `<= 0`、
      删掉 `findOne` 检查），记录哪些被测试抓到、哪些没有；没抓到的补测试。
- [ ] **P24. 读 3 个上游 spec 学写法：** `packages/common/test/pipes/parse-int.pipe.spec.ts`、
      `packages/core/test/injector/module.spec.ts`、
      `integration/hello-world/e2e/guards.spec.ts`。记下 3 个以后会用的写法。
- [ ] **P25. 把 TDD 用到工作里。** 下次在工作项目里新加接口或修 bug 时，先写失败的测试。

## 第七阶段：评审与提 PR（配合 07 文档）

- [ ] **P26. 读懂我的评审。** 照着 07 文档第二节的 7 个步骤，自己把 #18053 重新评审一遍
      （分支 `review/pr-18053` 已经在本地）。看看能不能找到我没发现的问题。
- [ ] **P27. 决定评审意见。** 修改 07 文档里的评审草稿，决定发还是不发。
      如果发，在 PR 页面粘贴即可。发之前先看看这时有没有维护者已经评论过。
- [ ] **P28. 决定演练 PR 的去向。** 读 https://github.com/fengdi721/nest/pull/1 ，
      决定是否提交到 nestjs/nest（命令在 07 文档第四节）。提交后的每一次互动都记进 JOURNAL.md。
- [ ] **P29. 自己走一遍全流程：P18。** 为属性注入的报错文案补测试，完全按照 07 文档第三节的
      7 个步骤做，先在自己的 fork 上开 PR。写完后让 Claude 评审。
- [ ] **P30. 评审一个别人的 PR。** `gh pr list --repo nestjs/nest` 找一个你感兴趣的 PR，
      按第二节的步骤评审，把结论写进 JOURNAL.md（可以不发）。
