import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import * as fs from "fs";
import * as path from "path";

interface ActiveNoteSettings {
	pointerFilePath: string;
}

const DEFAULT_SETTINGS: ActiveNoteSettings = {
	pointerFilePath: ".obsidian/active-note.txt",
};

export default class ActiveNotePlugin extends Plugin {
	settings: ActiveNoteSettings;

	async onload() {
		await this.loadSettings();

		this.addSettingTab(new ActiveNoteSettingTab(this.app, this));

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				const file = leaf?.view?.file;
				if (!file) return;

				const vaultPath = (this.app.vault.adapter as any).getBasePath();
				const pointerPath = path.join(vaultPath, this.settings.pointerFilePath);

				try {
					fs.writeFileSync(pointerPath, file.path, "utf8");
				} catch (err) {
					console.error("Active Note plugin failed to write pointer file", err);
				}
			})
		);
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
			.setDesc("Relative path from vault root where the active note path is written")
			.addText((text) =>
				text
					.setPlaceholder(".obsidian/active-note.txt")
					.setValue(this.plugin.settings.pointerFilePath)
					.onChange(async (value) => {
						this.plugin.settings.pointerFilePath = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
