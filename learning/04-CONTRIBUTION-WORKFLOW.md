# 04: The contribution workflow, end to end

## 1. One-time setup: fork + two remotes

Convention: `origin` = **my fork** (I can push), `upstream` = **the real
project** (read only for me).

```bash
git remote rename origin upstream                       # the clone came from nestjs/nest
git remote add origin git@github.com:fengdi721/nest.git # my fork
git remote -v
```

Keep `master` as a **pristine mirror** of upstream. Never commit on it.

```bash
git checkout master
git fetch upstream
git merge --ff-only upstream/master
git push origin master
```

## 2. Choosing what to work on (realistic view for Nest)

What I found by browsing GitHub (October 2026):

- Nest has **very few open issues (~10)**. The core team triages and fixes fast.
  All `good first issue 👍` issues are already closed.
- Labels tell you the state: `needs triage` (nobody confirmed it yet),
  `scope: core|common|…`, `effort1: hours`, `state: community` (someone outside
  the core team is on it), `status: wip ⚡️`.
- New bugs often come **with a fix PR from the reporter** (e.g. #18052 → #18053).
  ⇒ **Never open a competing PR.** Comment, review, or reproduce instead.

So the realistic ladder, from easiest to hardest:

1. **Triage**: reproduce a `needs triage` issue locally and comment with your
   findings (minimal repro, root cause line). Zero code merged, high value.
   Practised in `specs/06`.
2. **Review** open PRs: pull the branch, run its tests, leave useful comments.
   `gh pr checkout <n> --repo nestjs/nest`.
3. **Docs**: https://github.com/nestjs/docs.nestjs.com: typos, unclear
   examples, missing explanations. The friendliest entry point.
4. **Test coverage**: find untested code (e.g. there was no unit test for
   `FastifyAdapter.listen()`). Run `npm run test:cov`.
5. **Samples** (`sample/`): keep them in sync with new APIs.
6. **Bug fix**: needs an issue first (or a very obvious bug) + unit + e2e test.
7. **Feature**: open a `[discussion]` issue first and wait for a maintainer to agree.

Also explore the wider ecosystem: `nestjs/config`, `nestjs/swagger`,
`nestjs/typeorm` and `nestjs/schematics` usually have more open issues.

## 3. The branch → commit → PR loop

```bash
git fetch upstream
git checkout -b fix/fastify-listen-socket-path upstream/master   # ONE topic per branch

# code + tests…
npx vitest run packages/platform-fastify
npm run lint

git add -p                    # stage hunk by hunk; review what you commit
git commit                    # hooks run: prettier (lint-staged) + commitlint
git push -u origin fix/fastify-listen-socket-path
gh pr create --repo nestjs/nest --base master   # fill the template!
```

### Commit message (enforced by `.commitlintrc.json` + `.husky/commit-msg`)

```
<type>(<scope>): <subject, imperative, header ≤ 72 chars>

<body: WHY, not what. What was broken, what changes.>

Closes #18052
```

- type: `fix feat docs test refactor perf chore build ci style revert sample`
- scope = package: `common core microservices express fastify socket.io ws testing websockets sample`
- Header ≤ **72** chars (enforced by `@commitlint/config-angular`), even though
  CONTRIBUTING.md says 100: the tool wins. Subject must be one consistent case:
  avoid mixing in UPPER_CASE identifiers.
- Look at `git log --oneline` for real examples.

### The PR description (`.github/PULL_REQUEST_TEMPLATE.md`)

Tick the checklist honestly, state the **current** behaviour (link the issue),
the **new** behaviour, and say whether it is a breaking change.

## 4. Review & after the merge

- Maintainers may ask for changes → push more commits, or
  `git rebase upstream/master` + `git push --force-with-lease` (never plain `-f`).
- Be patient and polite. Silence for a week is normal.
- Once merged: delete the branch, update `master` from upstream.

## 5. Etiquette checklist

- [ ] Searched issues **and** PRs (open + closed) before starting
- [ ] Commented "I'd like to work on this" when there is no fix in progress yet
- [ ] One concern per PR, minimal diff, no drive-by reformatting
- [ ] Tests that fail before and pass after the fix
- [ ] Ran `npm test` and `npm run lint` locally
- [ ] Followed the template; linked the issue
- [ ] No unrelated files (like this `learning/` folder!) in the PR
