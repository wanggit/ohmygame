# Repository instructions

Read [CONTRIBUTING.md](CONTRIBUTING.md) for setup, verification, formatting, and
the contribution workflow. [docs/README.md](docs/README.md) maps modules to
their code, documentation, and tests.

## 项目定位（Project Positioning）

- **OhMyGame 是作者本人用来快速开发游戏的工具**——个人 game studio 的 AI 生产线。
- **通过 OhMyGame 开发的游戏，优先发布到自建游戏站点**（聚合站+广告变现），不依赖第三方门户。
- **OhMyGame 本身先打磨、后获利**：在工具打磨到非常成熟（稳定产出高质量游戏）之前，不考虑通过工具本身获利（如 SaaS/付费版/抽成）。当前阶段的所有投入都服务于"用工具做游戏、发布到自建站"这一主线。
- 由此派生的决策取舍：**优先做"让作者更快做出更好游戏"的功能**，而非"让工具更易售卖"的功能。

## Git

- Keep PRs focused on one feature, bug fix, documentation change, chore, or refactor.
- Start contribution branches from `dev` and target ordinary PRs at `dev`.
  `main` receives maintainer release PRs from `dev`.
- Never open a PR whose head branch is `dev` or `main`. The repository deletes
  head branches after merge, and deleting `dev` closes or retargets every PR
  based on it. Release and synchronization PRs use a temporary `chore/` branch
  pushed from the source branch; see
  [release preparation](docs/maintaining.md#release-preparation).
- Use `feat/<short-name>`, `fix/<short-name>`, `chore/<short-name>`,
  `refactor/<short-name>`, or `docs/<short-name>` for contribution branches.
- Use Conventional Commit PR titles, for example
  `feat(editor): add marquee selection`, `fix(runtime): handle missing tween state`,
  or `docs(agents): update collaboration rules`.
- PR descriptions must say what changed, why it changed, and how it was checked.

## Changes and verification

- Match existing style and keep unrelated formatting cleanup in a separate PR.
- Update relevant documentation when public behavior or file contracts change.
- `README.md` is the source for `README.zh-CN.md`. Update both in the same PR,
  keeping sections, media, and links aligned; say so in the PR if the
  translation must follow later.
- Add new UI text to both `src/renderer/locales/en.ts` and `zh-CN.ts` in the
  same PR, and keep text sent to the agent in English. See
  [UI languages](docs/ui-languages.md).
- Use the [checks guidance](CONTRIBUTING.md#make-and-check-your-change) for the
  change type. Record skipped checks and manual validation still needed.
