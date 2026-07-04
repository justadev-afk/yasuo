# Contributing to yasuo

Thanks for your interest in improving yasuo! This project is the zero-dependency
evolution of [twisted](https://github.com/justadev-afk/twisted), and we care a lot about
keeping the surface small, typed and dependency-free.

> **Heads-up:** yasuo is still **under construction** and pre-1.0. The public API
> may change between commits. Please open an issue to discuss anything non-trivial
> before sending a large PR.

## Getting set up

yasuo uses [Bun](https://bun.sh) as its package manager and test runner.

```bash
bun install
bun run typecheck        # tsc --noEmit
bun run lint             # biome check .
bun test test/unit       # unit tests (no network)
bun run build            # single-file ESM + CJS + d.ts
```

The one-shot gate that CI also runs:

```bash
bun run check            # typecheck + lint + unit tests
```

### Live integration tests (optional)

The `test/integration/*.live.test.ts` suite hits the real Riot API. It is skipped
automatically unless a key is present:

```bash
echo "RIOT_API_KEY=RGAPI-your-dev-key" >> .env   # .env is gitignored
bun run test:integration
```

The suite shares one cached, self-pacing client and stays under a development
key's basic limit (20 req/s, 100 req/2min). **Never commit your key.**

## Ground rules

These are enforced in review (and mostly by `biome`/`tsc`):

- **Zero runtime dependencies.** Never add to `dependencies`. Small helpers live in
  `src/core/util`.
- **No magic strings/numbers.** Every Riot constant is an `enum` in `src/enums`.
- **One declaration per file.** At most one class (or a cohesive group of
  types/functions) per file.
- **DTOs mirror the wire** (`src/dto`, `*DTO`, `readonly`); **entities are the
  ergonomics** (`src/entities`, `*.entity.ts`).
- **Every network call flows through `RequestExecutor.request()`** — namespaces
  never call `fetch` directly (the sole exception is `DataDragonNamespace`).
- **Every export is JSDoc'd**, and new public surface is exported from
  `src/index.ts`.
- **Keep the docs alive.** Any change to the public API must update the guides
  under `docs/` and, where relevant, `examples/basic-usage.ts`, in the *same* PR.
  The published site at <https://justadev-afk.github.io/yasuo/> is the canonical
  reference. See [the architecture guide](docs/architecture.md).

More detail on layout and conventions lives in
[`docs/architecture.md`](docs/architecture.md) — please read it before making
structural changes.

## Commits & PRs

- Branch off `main`; keep each PR focused on one logical change.
- Conventional-commit-style messages are appreciated (`feat:`, `fix:`, `docs:`,
  `chore:`).
- Fill out the PR template checklist. CI must be green before review.

## Reporting bugs / requesting features

Use the [issue templates](https://github.com/justadev-afk/yasuo/issues/new/choose).
Always redact your API key (`RGAPI-***`) from any snippet.

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
