import { App, FileSystemAdapter, MarkdownView, Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import * as fs from "fs";
import * as path from "path";

interface ActiveNoteSettings {
	pointerFilePath: string;
	debounceMs: number;
}

function defaultPointerPath(configDir: string): string {
	return `${configDir}/active-note.json`;
}

const DEFAULT_SETTINGS: ActiveNoteSettings = {
	pointerFilePath: "",
	debounceMs: 300,
};

export default class ActiveNotePlugin extends Plugin {
	settings: ActiveNoteSettings;
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;

	get pointerFilePath(): string {
		return this.settings.pointerFilePath || defaultPointerPath(this.app.vault.configDir);
	}

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new ActiveNoteSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => this.writePointer())
		);

		this.registerDomEvent(activeWindow, "keyup", () => this.writePointerDebounced());
		this.registerDomEvent(activeWindow, "mouseup", () => this.writePointerDebounced());
	}

	onunload() {
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
	}

	private writePointerDebounced() {
		if (this.debounceTimer) clearTimeout(this.debounceTimer);
		this.debounceTimer = setTimeout(() => this.writePointer(), this.settings.debounceMs);
	}

	private writePointer() {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view?.file) return;

		const editor = view.editor;
		const selectedText = editor.getSelection();

		const data: Record<string, unknown> = { path: view.file.path };

		if (selectedText) {
			const from = editor.getCursor("from");
			const to = editor.getCursor("to");
			data.selection = {
				text: selectedText,
				startLine: from.line + 1,
				endLine: to.line + 1,
			};
		}

		const adapter = this.app.vault.adapter as FileSystemAdapter;
		const vaultPath = adapter.getBasePath();
		const pointerPath = path.join(vaultPath, this.pointerFilePath);

		try {
			fs.writeFileSync(pointerPath, JSON.stringify(data), "utf8");
		} catch (err) {
			console.error("Active Note plugin failed to write pointer file", err);
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class ActiveNoteSettingTab extends PluginSettingTab {
	plugin: ActiveNotePlugin;

	constructor(app: App, plugin: ActiveNotePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Setup").setHeading();

		new Setting(containerEl)
			.setName("Pointer file path")
			.setDesc("Relative path from vault root where the active note state is written")
			.addText((text) =>
				text
					.setPlaceholder(defaultPointerPath(this.app.vault.configDir))
					.setValue(this.plugin.settings.pointerFilePath)
					.onChange(async (value) => {
						this.plugin.settings.pointerFilePath = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Debounce interval")
			.setDesc("Delay in milliseconds before writing selection changes to the pointer file")
			.addText((text) =>
				text
					.setPlaceholder("300")
					.setValue(String(this.plugin.settings.debounceMs))
					.onChange(async (value) => {
						const parsed = parseInt(value, 10);
						if (!isNaN(parsed) && parsed >= 0) {
							this.plugin.settings.debounceMs = parsed;
							await this.plugin.saveSettings();
						}
					})
			);

		new Setting(containerEl).setName("Claude Code integration").setHeading();

		const claudeMdSnippet = `## Active Note Context\n\nThe Obsidian plugin "Active Note" writes the currently open note and any selected text to \`.obsidian/active-note.json\`.\n\nWhen I reference a file with \`@.\` — read \`.obsidian/active-note.json\` to resolve which note I mean.\n\nFormat (JSON):\n- \`path\` — vault-relative path to the active note (always present)\n- \`selection\` — only present when text is selected:\n  - \`text\` — the selected text\n  - \`startLine\` / \`endLine\` — 1-indexed line range\n\nWhen a selection is present and I refer to "this", "this part", or "the highlighted text", use the selection text and line numbers as context.`;

		this.addSnippetBlock(containerEl, {
			name: "CLAUDE.md snippet",
			desc: "Add this to your vault's CLAUDE.md so Claude Code understands the pointer file",
			text: claudeMdSnippet,
		});

		const statusLineSnippet = `"statusLine": {
  "type": "command",
  "command": "input=$(cat); dir=$(echo \\"$input\\" | jq -r '.workspace.current_dir'); cd \\"$dir\\" 2>/dev/null && branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null); note=''; anf=\\"$dir/.obsidian/active-note.json\\"; if [ -f \\"$anf\\" ]; then p=$(jq -r '.path // empty' \\"$anf\\" 2>/dev/null); if [ -n \\"$p\\" ]; then fn=\\"\${p##*/}\\"; fn=\\"\${fn%.md}\\"; if [ \${#fn} -gt 40 ]; then fn=\\"\${fn:0:37}...\\"; fi; sel=$(jq -r '.selection.text // empty' \\"$anf\\" 2>/dev/null); if [ -n \\"$sel\\" ]; then note=\\"@. $fn | ●\\"; else note=\\"@. $fn\\"; fi; fi; fi; out=$(echo \\"$dir\\" | sed \\"s|^$HOME|~|\\"); if [ -n \\"$branch\\" ]; then out=\\"$out (git: $branch)\\"; fi; if [ -n \\"$note\\" ]; then out=\\"$out | $note\\"; fi; echo -e \\"$out\\""
}`;

		this.addSnippetBlock(containerEl, {
			name: "Claude Code status line",
			desc: "Add this to your Claude Code settings (~/.claude/settings.json) to show the active note in the status bar. Shows the note filename and a dot when text is selected.",
			text: statusLineSnippet,
		});
	}

	private addSnippetBlock(
		containerEl: HTMLElement,
		opts: { name: string; desc: string; text: string }
	) {
		const wrapper = containerEl.createDiv({ cls: "active-note-snippet-block" });

		wrapper.createEl("div", { text: opts.name, cls: "setting-item-name" });
		wrapper.createEl("div", { text: opts.desc, cls: "setting-item-description" });

		const boxWrapper = wrapper.createDiv({ cls: "active-note-snippet-box" });

		const textarea = boxWrapper.createEl("textarea", {
			cls: opts.text.includes("\n") ? "active-note-snippet-tall" : "active-note-snippet-short",
		});
		textarea.value = opts.text;

		const btn = boxWrapper.createEl("button", {
			text: "Copy to clipboard",
			cls: "active-note-snippet-copy-btn",
		});
		btn.addEventListener("click", () => {
			void navigator.clipboard.writeText(textarea.value);
			new Notice("Copied to clipboard");
		});
	}
}
