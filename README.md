# Sefaria design system

Sefaria's design tokens: core and semantic tokens as CSS variables, the source of truth for every product (Figma is not kept in sync). Used by the Library Assistant (`Sefaria/ai-chatbot`, bundled into the widget) and Sefaria-Project (served as `static/design-system/*.css` from `node_modules`, loaded in `base.html`).

| File | Holds | Rule |
|---|---|---|
| `core.css` | The only raw values: color palette, dimension scale | Raw values only |
| `semantic.css` | What a value is for (`--text-primary`) | Each value is `var(--a-core-token)` |

Products use semantic tokens. Product-specific variables (the Library Assistant's `--lc-*`) stay in the product and point at semantic tokens.

Every block uses the selector `:root, :host`: on a page `:root` matches, inside a web component's shadow root `:host` does, so the same file works in both. Dark mode, when it comes, is a second block in `semantic.css` with `:root[data-theme="dark"], :host([data-theme="dark"])` that points semantic tokens at other core tokens.

`npm run check` enforces the rules: the layers, exact selectors, one declaration per line, values limited to colors, lengths, numbers, `var()`, `calc()`, `rgb()` and font names (no `url()`, `!important` or markup), and no install scripts in `package.json`.

## Changing a token

1. **Open a PR.** CI checks the rules. Removing or renaming a token needs the `breaking` label (CI checks it), because products use tokens by name.
2. **Preview it.** A bot comment on the PR has the links: any Sefaria page outside production (a cauldron, staging, or local) opened with `?design_system=<commit>` loads the PR's CSS over the released one, on the page and in the Library Assistant. Nothing is built. `?design_system=<branch>` follows the branch (a push shows within about 5 minutes); add `&chatbot_version=<n>` for a Library Assistant PR's preview; `?design_system=clear` turns it off.
3. **Merge** (one approval). If a token was added or changed its value since the last release, the merge is tagged as a release, `v1.4.0`; `v2.0.0` if a token was removed or renamed. Comments and formatting don't release. The tag is the version (`package.json` stays `0.0.0`).
4. **The products update.** In each product the `sefaria-design-system` app opens (or updates) one PR, "fix(design-system): update to v1.4.0". Nothing changes in a product until that PR merges:
   - Sefaria-Project: merges itself once approved and CI passes; deploys to staging, then prod with the next promotion.
   - ai-chatbot: someone merges it once CI passes; it reaches chat-dev, then prod with the next `production` release.

**For a feature that needs new tokens:** test the feature's preview or cauldron with `?design_system=<this PR's commit>`, so the feature's code and the new tokens are seen together. Merge the design-system PR first; the feature merges once its branch uses the release (after the update PR, or by bumping the version itself). Products' CI fails a branch that points at an unreleased design-system commit.

## Using it in a product

```json
"@sefaria/design-system": "github:Sefaria/design-system#v1.0.0"
```

Products pin a tag; their CI checks that the lockfile installs that tag's commit and that the version isn't older than the base branch's. The CSS is copied into the product's build, so nothing is fetched at runtime (except a preview, outside production) and a rebuild gives the same result.

To try local changes in a product, `npm link` this checkout there and restart its dev server (Vite doesn't watch `node_modules`). `npm link` rewrites `package.json` and the lockfile: restore them (`npm install github:Sefaria/design-system#vX.Y.Z`) before committing.

## Setup (once)

- `main` protected: PR, one approval, CI (`Check tokens`).
- The `sefaria-design-system` GitHub App (Contents and Pull requests: read and write), installed on this repo, ai-chatbot and Sefaria-Project. Org variable `DESIGN_SYSTEM_APP_ID`. The private key is the secret `DESIGN_SYSTEM_APP_PRIVATE_KEY` of a `design-system` environment in each of the three repos, which only the default branch may use, so a workflow pushed on another branch can't read it. Here only `release.yml`'s release job uses it.
- "Allow auto-merge" on in Sefaria-Project.
- Label `breaking`.
