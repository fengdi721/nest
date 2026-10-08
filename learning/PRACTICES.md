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
