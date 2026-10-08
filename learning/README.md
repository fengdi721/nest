# Learning to read and contribute to NestJS, from zero

This folder is my notebook for going from "I build CRUD apps with Nest" to
"I can read the framework's source and open a quality PR".

It lives on the branch `learning/first-steps` of my fork
(`git@github.com:fengdi721/nest.git`). It is **never** meant to be part of an
upstream PR; real contributions go on their own branches cut from a fresh
`upstream/master` (see [04-CONTRIBUTION-WORKFLOW.md](04-CONTRIBUTION-WORKFLOW.md)).

> 从第 2 步（05）开始，文档使用中文编写。

## Roadmap

| #   | Read                                                         | Then run / do                                     |
| --- | ------------------------------------------------------------ | ------------------------------------------------- |
| 1   | [01-REPO-ANATOMY.md](01-REPO-ANATOMY.md): how the repo is organised and why | P1–P3 in [PRACTICES.md](PRACTICES.md)              |
| 2   | [02-HOW-NEST-BOOTS.md](02-HOW-NEST-BOOTS.md): `NestFactory.create()` traced through the source | `specs/01`, `02`, `03`, `05`, then P4–P6 |
| 3   | [03-TESTING.md](03-TESTING.md): unit, integration, samples; how upstream tests things | `specs/04`, exercises E1–E4, P7–P9          |
| 4   | [04-CONTRIBUTION-WORKFLOW.md](04-CONTRIBUTION-WORKFLOW.md): fork → branch → commit → PR → review | `specs/06` (real issue triage), P10–P14   |
| 5   | [05-DI-LOOKUP-AND-DEBUG.md](05-DI-LOOKUP-AND-DEBUG.md) (中文): 从报错倒推源码、依赖查找算法、`NEST_DEBUG` | `specs/07`, P15–P18 |
| 6   | [06-TDD-AND-TESTING.md](06-TDD-AND-TESTING.md) (中文): 写测试与 TDD：AAA、红绿重构、测试替身、变异测试 | `tdd/kata-1` 回放，`tdd/kata-2` 自己做，P19–P25 |
| 7   | [07-REVIEW-AND-PR-REHEARSAL.md](07-REVIEW-AND-PR-REHEARSAL.md) (中文): 评审真实 PR #18053 + 在自己 fork 上完整演练提 PR | P26–P30 |
| ∞   | [JOURNAL.md](JOURNAL.md): log of every session, finding and test written | keep adding to it                                  |

## Running everything

```bash
# once, from the repo root
npm ci --legacy-peer-deps

# all learning specs (lessons + exercises)
npx vitest run --config learning/vitest.config.mts

# watch one lesson while you read the source next to it
npx vitest --config learning/vitest.config.mts learning/specs/02
```

`learning/vitest.config.mts` reuses the repository's own `vitest.config.mts`
(aliases `@nestjs/*` → `packages/*` **TypeScript sources**). That means you can add a
`console.log` inside `packages/core/injector/injector.ts`, re-run a learning spec,
and see it: the fastest way to learn the internals.

## What is in here

```
learning/
├── README.md                     ← you are here
├── 01-REPO-ANATOMY.md            folder philosophy
├── 02-HOW-NEST-BOOTS.md          bootstrap walkthrough with file:line pointers
├── 03-TESTING.md                 test strategy of the project
├── 04-CONTRIBUTION-WORKFLOW.md   git/GitHub process, conventions, etiquette
├── 05-DI-LOOKUP-AND-DEBUG.md     (中文) 从报错倒推源码 / 依赖查找 / NEST_DEBUG
├── 06-TDD-AND-TESTING.md         (中文) 写测试与 TDD
├── 07-REVIEW-AND-PR-REHEARSAL.md (中文) 评审 PR + 提 PR 演练
├── PRACTICES.md                  checklist of hands-on practices (+ hints)
├── JOURNAL.md                    session log: what we did, what we found
├── vitest.config.mts             runs only learning/**/*.spec.ts
├── specs/                        lessons: passing tests that PROVE a concept
│   ├── 01-decorators-are-metadata.spec.ts
│   ├── 02-dependency-injection.spec.ts
│   ├── 03-provider-scopes.spec.ts
│   ├── 04-request-lifecycle.spec.ts
│   ├── 05-lifecycle-hooks.spec.ts
│   ├── 06-triage-issue-18052.spec.ts
│   └── 07-dependency-lookup.spec.ts
├── exercises/
│   └── exercises.spec.ts         E1–E4, skipped until you solve them
└── tdd/
    ├── kata-1-parse-sort-pipe/   TDD 演示：每个红/绿一个提交
    └── kata-2-cats-crud/         TDD 练习：你来写测试
```
