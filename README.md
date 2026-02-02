# Active Note

An Obsidian plugin that externalizes the "currently active note" state for use by external tools.

## The Problem

The currently open note in Obsidian is UI state — invisible to external tools like CLI assistants, scripts, or automation. There's no way for an external process to know which note you're looking at.

## The Solution

This plugin writes the active note path and any text selection to a JSON pointer file. External tools can read this file to understand your current context.

## Pointer File

By default, the plugin writes to:

```
.obsidian/active-note.json
```

### Format

When no text is selected:
```json
{"path":"projects/my-project/notes.md"}
```

When text is selected:
```json
{"path":"projects/my-project/notes.md","selection":{"text":"GDP grew 3.1% in Q4","startLine":42,"endLine":42}}
```

- `path` — vault-relative path to the active note (always present)
- `selection` — only present when text is selected:
  - `text` — the selected text
  - `startLine` / `endLine` — 1-indexed line range of the selection

## Usage with Claude Code

Run Claude Code from your vault root. Add the following to your vault's `CLAUDE.md` so Claude knows how to interpret the pointer file:

Then you can talk to Claude Code naturally:

- **"Summarize @."** — Claude reads the pointer file, opens the active note, and summarizes it.
- **"Fix the grammar in @."** — Claude edits the note you're looking at.
- **Highlight a paragraph, then ask "Rewrite this part of @."** — Claude uses the selection range to know exactly which lines to change.
- **"Add a YAML frontmatter to @."** — Claude modifies the active note without you typing the path.

The `@.` shorthand eliminates the need to copy-paste file paths between Obsidian and the terminal.

## Other Use Cases

Any external tool can use the pointer file as a bridge to Obsidian's UI state:

- Shell scripts that operate on the current note (`jq -r .path .obsidian/active-note.json`)
- Linters or formatters targeting the active file
- Cross-application workflows and automation

## Settings

The pointer file path is configurable in Settings → Active Note.

## Installation

1. Copy `main.js` and `manifest.json` to your vault's `.obsidian/plugins/active-note/` folder
2. Enable "Active Note" in Settings → Community plugins

## Performance

The plugin is event-driven — it writes to the pointer file when you switch notes or change your selection. Selection changes are debounced (300ms) to avoid excessive writes.
