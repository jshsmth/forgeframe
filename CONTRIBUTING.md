# Contributing to ForgeFrame

Thanks for helping improve ForgeFrame. Report security issues privately as
described in [SECURITY.md](SECURITY.md), not in public issues.

## Before you start

- Open an issue to discuss behavior changes before sending a large pull request.
- Read [Developing ForgeFrame](README.md#developing-forgeframe) for setup, the
  playground, and the project wiki. The [architecture guide](docs/architecture/_index.md)
  and [test index](packages/forgeframe/tests/README.md) explain where code and
  tests belong.

## Making a change

- Keep public types, wire formats, origin checks, and cleanup ordering stable
  unless the change is intended; describe any intended change in the pull request.
- Add a regression test at the public boundary for behavior changes.
- Edit documentation in the root `README.md`; the build copies it into the package.

## Checks

Run these from the repository root before opening a pull request:

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm run test:coverage
```

For cross-window, popup, or React lifecycle changes, also run
`npm run test:browser`, which needs the engines from
`npx playwright install chromium firefox webkit`. For documentation changes,
run `npm run docs:check`. Before a release, or to run everything CI checks
except the browser suite and the wiki, run `npm run release:check`.

Pull requests run the Test workflow (unit, integration, package and bundle
checks on Node 22, 24 and 26, plus the browser suite) and the Documentation
workflow. Every job must pass before merging.
