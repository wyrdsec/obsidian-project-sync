import { ButtonComponent, Notice, Plugin, TextComponent } from "obsidian";
import { existsSync } from "fs";

class ProjsyncBlock {
	path: string;
	exclude: Array<string>;

	constructor(source: string) {
		const rows = source.split("\n").filter((row) => row.length > 0);
		for (let i=0; i < rows.length; i++) {
			const words = rows[i].split(" ");
			if (words.length > 0) {
				switch (words[0]) {
					case "path":
						let path = words.slice(1).join('');
						if (path.length == 0) { throw TypeError("Path is empty.") }
						if (!existsSync(path)) { throw TypeError("Path does not exist.")}
						this.path = path;
						break;
					
					case "exclude":
						let excludePath = words.slice(1).join('');
						if (excludePath.length == 0) { break }
						if (!this.exclude.includes(excludePath)) { this.exclude.push(excludePath) }
						break;

					default:
						break;
				}
			}
		}

		if (this.path == undefined) { throw SyntaxError("Path value was not set.") };
	}
}

export default class ObsidianProjectSync extends Plugin {
	async onload() {
		this.registerMarkdownCodeBlockProcessor("projsync", (source, el, ctx) => {

			try {
				const psb = new ProjsyncBlock(source);

				var button = new ButtonComponent(el);
				button.setIcon("sync");
				button.setTooltip("Sync to filesystem", {delay: 0, placement: 'bottom'});
				button.onClick((evt: MouseEvent) => {
					new Notice("This is a notice!");
				})
			} catch(e: unknown) {
				const displayError = el.createEl("div", { cls: "project-sync-displayerror" });
				displayError.createEl("div", {text: `${(e as Error).name}`, cls: "project-sync-displayerror-name"});
				displayError.createEl("small", {text: `${(e as Error).message}`, cls: "project-sync-displayerror-message"});
			}
		  });
	}
}