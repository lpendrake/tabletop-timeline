# `src/renderer/theme/` — Theme System

Single source of truth for every color in the app.

## Key files

| File | Role |
|------|------|
| `dark-pathfinder.ts` | Default (dark) theme. Every dark-mode color value lives here. |
| `lightfinder.ts` | Light counterpart theme. Cream-parchment aesthetic, all values rebalanced for a light background. |
| `types.ts` | `Theme` interface plus helpers (`DeepPartial`, `WeekdayColors`, `KindColors`, `ColorPreset`). |
| `provider.ts` | `ThemeProvider` singleton — registry, active theme, CSS vars, subscriptions. |
| `index.ts` | Barrel — import everything from here, not from individual files. |

## Core themes

There are two built-in ("core") themes in the registry:

| id | Display name | File |
|----|--------------|------|
| `dark-pathfinder` | Darkfinder | `dark-pathfinder.ts` |
| `lightfinder` | Lightfinder | `lightfinder.ts` |

## ThemeProvider API

`ThemeProvider` is a module-level singleton. It is **not** a React context.

```ts
import { ThemeProvider } from 'src/renderer/theme';

// Called once in main.tsx before React mounts — sets all CSS variables.
ThemeProvider.init();

// Read the active theme object anywhere (TypeScript / canvas / non-React code).
const theme = ThemeProvider.get();

// Override individual tokens. Deep-merges on top of the CURRENT active theme
// and re-applies CSS vars.
ThemeProvider.set({ chrome: { accentGold: '#ffcc00' } });

// Switch to a named theme by registry id (applies the full theme, not merged).
ThemeProvider.setByName('lightfinder');
ThemeProvider.setByName('dark-pathfinder');
// Unknown ids fall back to 'dark-pathfinder' without throwing.

// Get the id of the currently active theme.
const id = ThemeProvider.getActiveThemeId(); // e.g. 'lightfinder'

// List all registered themes (id / name / kind — no Theme objects).
const items = ThemeProvider.listThemes();
// [{ id: 'dark-pathfinder', name: 'Darkfinder', kind: 'core' }, ...]

// Subscribe to theme changes (any setByName or set call notifies all listeners).
const unsubscribe = ThemeProvider.subscribe(() => {
  // re-render or update derived state here
});
unsubscribe(); // call the returned function to remove the listener
```

`init()` is called in `main.tsx` before `ReactDOM.createRoot(...)`, so CSS variables are available before the first React render.

### Registering an additional theme

1. Create `src/renderer/theme/my-theme.ts` exporting `export const myTheme: Theme = { ... }`.
2. In `provider.ts`, import the constant and add an entry to the `registry` array:
   ```ts
   { id: 'my-theme', name: 'My Theme', kind: 'core', theme: myTheme }
   ```
   Use `kind: 'custom'` for user-defined or plugin-supplied themes.
3. Re-export the constant from `index.ts`.
4. Add a test file mirroring `__tests__/lightfinder.test.ts`.

## Theme sections (`Theme` interface)

| Section | What it covers |
|---------|---------------|
| `chrome` | App-wide shell: backgrounds, surfaces, panels, text, accents, links, borders, danger. These are the tokens exposed as `--theme-*` CSS variables. |
| `timeline` | Day-of-week colors (`days`), session band palette (`sessions[]`), event color presets (`eventColorPresets[]`). Used by timeline render and editor code, not in CSS variables. |
| `notes` | Note-kind accent colors (`kinds.*`) exposed as `--kind-*` CSS variables; `savedIndicator` and `errorToast` exposed as `--notes-saved` / `--notes-error`. |
| `editor` | CodeMirror-specific tokens. `foldPlaceholder`, `invalid` and `selection` are read via `ThemeProvider.get()` (`selection` is also emitted as `--editor-selection-rgb`, driving the CodeMirror selection highlight color). The `directive*` tokens (`directiveBackground`, `directiveBorder`, `directiveHover`, `directiveValueHighlight`) style relationship-directive blocks and ARE exposed as `--theme-directive-*` CSS vars — see "CSS variable mapping" below. Directive error/attention/delete states reuse `chrome.danger`/`chrome.warning` (`--theme-danger`/`--theme-warning`) rather than their own tokens. |
| `bootstrap` | Campaign-selector / pre-campaign screens only. A darker, higher-contrast palette for the app before a campaign is loaded. **Do not use `bootstrap` tokens inside campaign views.** |
| `relationships` | Relationships-view specific tokens (progress bars, ladder rungs, chips, drag/drop, row hover, step-set dividers). Exposed as `--theme-relationships-*` CSS vars — see "CSS variable mapping" below. Relationship error text reuses `chrome.danger` (`--theme-danger`), not its own token. |

## Consuming colors

### In CSS / stylesheets — prefer CSS variables

```css
/* chrome tokens */
color: var(--theme-text-primary);
background: var(--theme-surface);
border-color: var(--theme-border);

/* note-kind accent colors */
color: var(--kind-npc);

/* RGB variants (available for accent-gold, accent-warm, danger) */
background: rgba(var(--theme-danger-rgb) / 0.15);
```

### In TypeScript / inline styles — use `ThemeProvider.get()`

```ts
const theme = ThemeProvider.get();
style={{ color: theme.chrome.textPrimary }}

// Pre-campaign / bootstrap screens:
const bs = ThemeProvider.get().bootstrap;
style={{ backgroundColor: bs.bg, color: bs.text }}

// Timeline rendering (canvas / DOM):
const weekdays = ThemeProvider.get().timeline.days;
const sessionColor = ThemeProvider.get().timeline.sessions[0];
```

## CSS variable mapping

`applyCssVars` (internal to `provider.ts`) maps `chrome.*` camelCase keys to `--theme-kebab-case` variables. The full set:

```
--theme-background       chrome.background
--theme-surface          chrome.surface
--theme-panel            chrome.panel
--theme-panel-accent     chrome.panelAccent
--theme-text-primary     chrome.textPrimary
--theme-text-secondary   chrome.textSecondary
--theme-text-muted       chrome.textMuted
--theme-accent-gold      chrome.accentGold
--theme-accent-warm      chrome.accentWarm
--theme-accent           chrome.accent
--theme-link             chrome.link
--theme-border           chrome.border
--theme-border-strong    chrome.borderStrong
--theme-danger           chrome.danger
--theme-danger-hover     chrome.dangerHover
--theme-dotted-future    chrome.dottedFuture
--theme-warning          chrome.warning
```

RGB triplet variants (space-separated, suitable for `rgb(var(--theme-x-rgb) / <alpha>)`):
```
--theme-accent-gold-rgb    chrome.accentGold
--theme-accent-warm-rgb    chrome.accentWarm
--theme-danger-rgb         chrome.danger
--theme-warning-rgb        chrome.warning
--editor-selection-rgb     editor.selection   (base color for CodeMirror selection highlights)
```

`applyCssVars` also maps the `editor.directive*` and `relationships.*` tokens straight through to CSS vars (camelCase → kebab-case, same as `chrome`):
```
--theme-directive-background          editor.directiveBackground
--theme-directive-border              editor.directiveBorder
--theme-directive-hover               editor.directiveHover
--theme-directive-value-highlight     editor.directiveValueHighlight

--theme-relationships-bar-track           relationships.barTrack
--theme-relationships-bar-fill            relationships.barFill
--theme-relationships-band-tick           relationships.bandTick
--theme-relationships-rung-inactive       relationships.rungInactive
--theme-relationships-rung-active         relationships.rungActive
--theme-relationships-chip-background     relationships.chipBackground
--theme-relationships-chip-text           relationships.chipText
--theme-relationships-chip-mutual-border  relationships.chipMutualBorder
--theme-relationships-row-hover           relationships.rowHover
--theme-relationships-drop-indicator      relationships.dropIndicator
--theme-relationships-step-set-break      relationships.stepSetBreak
```

There are deliberately no `directive-error`/`directive-delete`/`directive-attention`/`relationships-error-text` tokens — error, delete and attention states in directive blocks and the Relationships view reuse the existing `--theme-danger` (errors, the delete cross) and `--theme-warning` (attention/unfinished prompts) chrome tokens instead of duplicating them.

Note-kind and indicator variables:
```
--kind-pc  --kind-npc  --kind-location  --kind-faction
--kind-plot  --kind-rule  --kind-session  --kind-misc
--notes-saved
--notes-error
```

## Don't

- **Never hardcode a hex color.** If a value isn't in the theme, add it to `dark-pathfinder.ts` and the `Theme` interface.
- **Don't use `bootstrap` tokens in campaign views.** `bootstrap` is for pre-load screens (campaign selector, setup) only.
- **Don't import from sub-files directly.** Use the barrel: `import { ThemeProvider } from 'src/renderer/theme'`.
- **Don't call `ThemeProvider.set()` in a render path.** It re-applies all CSS variables — call it only in response to explicit user action or at startup.
- **Don't reach into `timeline` tokens, or `editor.foldPlaceholder`/`editor.invalid`/`editor.selection`, via CSS variables** — those are not exposed as CSS vars; read them through `ThemeProvider.get()` in TypeScript. (`editor.directive*` and `relationships.*` are the exception — they ARE exposed as `--theme-directive-*` / `--theme-relationships-*`, see "CSS variable mapping" above.)
- **Don't add a new `directive*`/`relationships.*` color for an error, delete or attention state.** Reuse `chrome.danger` (`--theme-danger`) or `chrome.warning` (`--theme-warning`) instead of duplicating them into a section-specific token.
