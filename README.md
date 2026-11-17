# Syntax Highlighter — Woteq Tools

Paste your source code, pick a language and a theme, and copy the result as a
highlighted preview, ready-to-paste HTML, or a Markdown code block.

**Live site:** <https://woteq-tools.github.io/highlight/>

Everything runs in the browser. Highlight.js, all 192 grammars and all 12 themes
are bundled with the page, so the tool makes **no network requests at all** and
keeps working offline.

## What it does

- **192 languages** — every grammar Highlight.js ships, behind a searchable
  picker (type `py`, `c++`, `yml`… to filter).
- **12 themes** — Default, a11y Dark/Light, Agate, GitHub, GitHub Dark, Google
  Code, Hybrid, Idea, Nord, Visual Studio Code and Xcode.
- **Live preview** — the highlighted output refreshes as you type.
- **Line numbers** — a toggle that keeps multi-line spans (block comments,
  template literals) intact.
- **Three output formats**
  - *Highlighted* — a live preview.
  - *HTML* — a `<pre>` block where every token carries its own inline colour,
    so it looks the same in any blog or email client.
  - *Markdown* — a fenced code block.
- **Shareable URLs** — the language, theme and line-number setting live in the
  query string and stay in sync as you change them.
- **No uploads, no tracking, no build step.**

## URL parameters

The tool understands the same parameters as
[highlight.hohli.com](https://highlight.hohli.com/):

| Parameter  | Example                | Meaning                                   |
| ---------- | ---------------------- | ----------------------------------------- |
| `language` | `?language=c`          | Language id (`c`, `cpp`, `python`, …)      |
| `theme`    | `?theme=vs`            | Theme id                                   |
| `numbers`  | `?numbers=1`           | Show line numbers                          |

Example: <https://woteq-tools.github.io/highlight/?theme=vs&language=c>

Unknown values fall back to the defaults, and the URL is rewritten to reflect
whatever is actually in use.

## Project layout

```
index.html                    the page
favicon.svg                   site icon
assets/css/style.css          styles (light/dark via prefers-color-scheme)
assets/js/app.js              UI logic (highlighting, line numbers, clipboard)
assets/js/languages.js        language catalogue (id, display name, aliases)
assets/vendor/highlight.min.js  Highlight.js 11.11.1 (BSD-3-Clause)
assets/vendor/languages/*.js     the 192 grammars, loaded on demand
assets/vendor/styles/*.css       the 12 themes
```

Grammars are fetched from the local `assets/vendor/languages/` folder the first
time a language is selected, so no third-party CDN is ever contacted.

## How the line numbers work

Highlight.js emits a flat HTML tree, and a single span can cover several lines
(a block comment, for example). `splitIntoLines()` walks that tree and rebuilds
it line by line: whenever a line break falls inside an open element, the
element is closed at the end of the line and reopened at the start of the next
one. The result is valid HTML with the highlighting intact.

## Publishing

The site is published from the `main` branch, at the repository root, by the
**Deploy Pages** GitHub Actions workflow. Pages settings live at
[Settings → Pages](https://github.com/woteq-tools/highlight/settings/pages)
with source **GitHub Actions**.

```bash
git clone git@github.com:woteq-tools/highlight.git
cd highlight
# edit index.html / assets
git commit -am "Update tool"
git push origin main
```

## Credits

- Highlighting engine: [Highlight.js](https://highlightjs.org/) 11.11.1 by
  Ivan Sagalaev, released under the BSD 3-Clause licence. A copy of the licence
  is included in [`assets/vendor/LICENSE`](assets/vendor/LICENSE).
- Original inspiration: [highlight.hohli.com](https://highlight.hohli.com/) by
  Anton Shevchuk.
