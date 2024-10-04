import { ButtonComponent, Modal, Notice, Plugin, App, TFile, TAbstractFile, TFolder } from "obsidian";
import { accessSync, existsSync, lstatSync } from "fs";
import { constants } from "fs/promises";

class ProjsyncBlock {
	path: string;
	exclude: Array<string>;

	constructor(source: string) {
		this.exclude = Array<string>();
		const rows = source.split("\n").filter((row) => row.length > 0);
		for (let i=0; i < rows.length; i++) {
			const words = rows[i].split(" ");
			if (words.length > 0) {
				switch (words[0]) {
					case "path":
						let path = words.slice(1).join('');
						this.path = this.pathcheck(path);
						break;
					
					case "exclude":
						let excludePath = words.slice(1).join('');
						if (excludePath.length == 0) { break }
						if (!this.exclude.includes(excludePath)) { this.exclude.push(excludePath) }
						break;

					default:
						throw SyntaxError(`Invalid key: '${words[0]}'.`)
						break;
				}
			}
		}

		if (this.path == undefined) { throw SyntaxError("Path value was not set.") };
	}

	sync(button?: ButtonComponent) {

	}

	pathcheck(path: string) {
		if (path.length == 0) { throw TypeError("Path is empty."); }
		if (!existsSync(path)) { throw TypeError("Path does not exist."); }
		const stat = lstatSync(path);
		if (stat.isSymbolicLink()) { throw TypeError("Path is symbolic link, see setting to follow symlinks."); }
		if (!stat.isDirectory()) { throw TypeError("Path is not a directory."); }
		try {
			accessSync(path, constants.R_OK | constants.W_OK)
		}
		catch { 
				throw TypeError("Insufficient permissions to sync to path.");
		}

		return path;
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
					this.sync(psb, button);
				})
			} catch(e: unknown) {
				const displayError = el.createEl("div", { cls: "project-sync-displayerror-inline" });
				displayError.createEl("div", {text: `${(e as Error).name}`, cls: "project-sync-displayerror-inline-name"});
				displayError.createEl("small", {text: `${(e as Error).message}`, cls: "project-sync-displayerror-inline-message"});
			}
		  });
	}

	onunload() {

	}

	sync(psb: ProjsyncBlock, button?: ButtonComponent){
		try{
			const active_file = this.app.workspace.getActiveFile();
			if (active_file === null){
				throw TypeError("No active file...");
			}
			const super_folder = active_file.parent;
			if (super_folder === null){
				throw TypeError("No super folder, TODO");
			}
			
			let files: Array<TAbstractFile>;
			if (super_folder.path === "/")
				files = this.app.vault.getAllLoadedFiles();
			else {
				files = this.app.vault.getAllLoadedFiles().filter((file) => { return file.path.startsWith(super_folder.path+'/'); });
			}

			// First pass make directory structure
			for (let i=0; i<files.length; i++) {
				if (files[i] instanceof TFolder){
					console.log(files[i]);
				}
			}

			console.log(files); 
		}
		catch(e: unknown) {
			new ErrorModal(this.app, e as Error).open();
		}
	}
}

class ErrorModal extends Modal {
	exp: Error;
	
	constructor(app: App, exp: Error) {
		super(app);
		this.exp = exp;
	}

	onOpen(): void {
		const {contentEl} = this;
		const displayError = contentEl.createEl("div");
		displayError.createEl("h2", {text: "ProjectSync Error", cls: "project-sync-displayerror-modal-title"});
		displayError.createEl("div", {text: `${(this.exp).name}`, cls: "project-sync-displayerror-modal-name"});
		displayError.createEl("small", {text: `${(this.exp).message}`, cls: "project-sync-displayerror-modal-message"});
	}
}