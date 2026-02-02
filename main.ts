import { App, MarkdownView, Plugin, PluginSettingTab, Setting } from "obsidian";
import * as fs from "fs";
import * as path from "path";

interface ActiveNoteSettings {
	pointerFilePath: string;
}

const DEFAULT_SETTINGS: ActiveNoteSettings = {
	pointerFilePath: ".obsidian/active-note.json",
};

export default class ActiveNotePlugin extends Plugin {
	settings: ActiveNoteSettings;
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;

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
		this.debounceTimer = setTimeout(() => this.writePointer(), 300);
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

		const vaultPath = (this.app.vault.adapter as any).getBasePath();
		const pointerPath = path.join(vaultPath, this.settings.pointerFilePath);

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

		new Setting(containerEl)
			.setName("Pointer file path")
			.setDesc("Relative path from vault root where the active note state is written")
			.addText((text) =>
				text
					.setPlaceholder(".obsidian/active-note.json")
					.setValue(this.plugin.settings.pointerFilePath)
					.onChange(async (value) => {
						this.plugin.settings.pointerFilePath = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
