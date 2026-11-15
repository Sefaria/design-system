# Sefaria design system

The code side of Sefaria's Figma design system: core and semantic tokens as CSS variables, one source for every product. Used by the Library Assistant (`Sefaria/ai-chatbot`, bundled into the widget) and Sefaria-Project (served as `static/design-system/*.css` from `node_modules`, loaded in `base.html`).

| File | Holds | Rule |
|---|---|---|
| `core.css` | The only raw values: color palette, dimension scale | Raw values only |
| `semantic.css` | What a value is for (`--semantic-text-primary`) | Each value is `var(--a-core-token)` |

Products use semantic tokens. Product-specific variables (the Library Assistant's `--lc-*`) stay in the product and point at semantic tokens.

Every block uses the selector `:root, :host`: on a page `:root` matches, inside a web component's shadow root `:host` does, so the same file works in both. Dark mode, when it comes, is a second block in `semantic.css` with `:root[data-theme="dark"], :host([data-theme="dark"])` that points semantic tokens at other core tokens.

`npm run check` enforces the rules. A few semantic tokens copied from the Library Assistant still hold raw values; they're marked `/* unmapped */` and listed by the check until they point at core tokens.

## Changing a token

Everything after "open a PR" and "merge" is automatic.

**Before merging: previews.** Every push to your PR updates them.

| Your PR | Library Assistant | Sefaria |
|---|---|---|
| Standalone ("Ships with" empty) | A draft ai-chatbot PR with your CSS; Coolify builds its preview | The `design-system` cauldron (https://design-system.cauldron.sefaria.org) shows your CSS; it holds one PR at a time, the most recently pushed |
| `Ships with: ai-chatbot#123` | The bot commits your CSS to #123's branch; #123's Coolify preview shows it | (unchanged) |
| `Ships with: Sefaria-Project#123` | (unchanged) | The bot commits your CSS to #123's branch; that branch's cauldron shows it |

For a standalone PR, a bot comment links to both: the cauldron URL with `?chatbot_version=<draft PR>` shows Sefaria and the Library Assistant together with your CSS.

A PR that ships with a feature may only add tokens (CI checks it). To change how something looks for a feature, add a new token, let the feature use it, and remove the old one in a later cleanup PR.

**Merging: release, dev, prod.**

1. The merge is tagged as a release (`v1.4.0`; a PR labeled `breaking` bumps the major version).
2. In each product, the bot opens a PR "fix(design-system): update to v1.4.0" that merges itself once CI passes.
   - ai-chatbot `main`: that cuts a dev build, which reaches chat-dev, then prod with the next `production` release.
   - Sefaria-Project `master`: that deploys to staging, then prod with the next promotion.
3. If your PR shipped with a feature PR, the bot also moves that branch to `v1.4.0`, so the feature can merge. Feature PRs can't merge while they still point at an unreleased design-system commit (CI checks it).

## Using it in a product

```json
"@sefaria/design-system": "github:Sefaria/design-system#v1.0.0"
```

Products pin a tag. Main branches only ever point at a tag; feature branches may point at a design-system branch while it's in review. The CSS is copied into the product's build, so nothing is fetched at runtime and a rebuild gives the same result.

To try local changes in a product, `npm link` this checkout there, then switch back to the tag.

## Setup (once)

- The `sefaria-design-system` GitHub App (Contents, Pull requests and Issues: read and write), installed on this repo, ai-chatbot and Sefaria-Project. Org variable `DESIGN_SYSTEM_APP_ID` and org secret `DESIGN_SYSTEM_APP_PRIVATE_KEY`, both limited to those three repos. Workflows create a short-lived token from them. Coolify auto-deploys previews only for members' PRs; if it skips the app's draft ai-chatbot PRs, allow them in Coolify.
- "Allow auto-merge" on in ai-chatbot and Sefaria-Project. If their main branches require an approving review, the bot's update PRs wait for one unless the bot is allowed to bypass it.
- A cauldron named `design-system` tracking Sefaria-Project's `design-system/preview` branch (created by the first standalone preview).
- Label `breaking`.
- Branch protection on `main`: CI must pass.
