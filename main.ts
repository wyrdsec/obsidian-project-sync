import { ButtonComponent, Modal, Notice, Plugin, App, TFile, TAbstractFile, TFolder, PluginSettingTab, Setting } from "obsidian";
import { accessSync, existsSync, lstatSync, mkdirSync, statSync, writeFileSync } from "fs";
import { constants } from "fs/promises";
import { join as pathjoin, normalize as pathnormalize } from "path";

interface ObsidianProjectSyncSettings {
	followSymlinksDir: boolean;
	followSymlinksFile: boolean;
}

const DEFAULT_SETTINGS: ObsidianProjectSyncSettings = {
	followSymlinksDir: false,
	followSymlinksFile: false,
}

class ProjsyncBlock {
	path: string;
	prettypath: string;
	exclude: Array<RegExp>;

	constructor(source: string, followSymlinksDir: boolean) {
		this.exclude = Array<RegExp>();
		let path_found = false;

		// Each Line
		const rows = source.split("\n").filter((row) => row.length > 0);
		for (let i=0; i < rows.length; i++) {

			// Remove comments
			let row = this.processcomments(rows[i]).trim();
			if (row === ''){
				continue;
			}

			// Each word in line
			const words = row.split(" ");
			if (words.length > 0) {
				switch (words[0]) {
					case "path":
						if (path_found) {
							throw SyntaxError("Only one path keyword allowed per block.");
						}

						// Prettify path
						let path = words.slice(1).join(' ');
						path = pathnormalize(path);
						this.prettypath = path;

						// Check if path is valid
						path = this.processenvs(path);
						this.path = this.pathcheck(path, followSymlinksDir);
						path_found = true;
						break;

					case "exclude":
						let excludePathStr = words.slice(1).join(' ');
						if (excludePathStr.length == 0) { break; }
						let excludePath = new RegExp(excludePathStr);
						if (!this.exclude.includes(excludePath)) { this.exclude.push(excludePath); }
						break;

					default:
						throw SyntaxError(`Invalid key: '${words[0]}'.`);
						break;
				}
			}
		}

		if (this.path == undefined) { throw SyntaxError("Path value was not set."); };
	}

	// Remove comments from line
	processcomments(path: string) : string {
		let reg = RegExp('#.*$');
		return path.replace(reg, '');
	}

	// Replace common env variables
	processenvs(path: string) : string {
		let envs : { [key: string]: any }= {
			"$HOME" : process.env.HOME,
			"~" : process.env.HOME
		};

		for (let key in envs) {
			let val = envs[key];
			if (val === undefined){
				continue;
			}
			else {
				path = path.replace(key, val);
			}
		}

		return path;
	}

	// Validate path exists, optionally isn't symlink, and we can access it.
	pathcheck(path: string, followSymlinksDir: boolean) : string {
		if (path.length == 0) { throw TypeError("Path is empty."); }
		if (!existsSync(path)) { throw TypeError("Path does not exist."); }
		const stat = lstatSync(path);

		if (followSymlinksDir) {
			if (!statSync(path).isDirectory()) { throw TypeError("Path is not a directory."); }
		}
		else {
			if (stat.isSymbolicLink()) { throw TypeError("Path is symbolic link, see setting to follow symlinks."); }
			if (!stat.isDirectory()) { throw TypeError("Path is not a directory."); }
		}

		try {
			accessSync(path, constants.R_OK | constants.W_OK);
		}
		catch { 
			throw ReferenceError("Insufficient permissions to sync to path.");
		}

		return path;
	}
}

export default class ObsidianProjectSync extends Plugin {
	settings: ObsidianProjectSyncSettings;

	async onload() {
		await this.loadSettings();

		// codeblock processor
		this.registerMarkdownCodeBlockProcessor("projsync", (source, el, ctx) => {
			try {
				const psb = new ProjsyncBlock(source, this.settings.followSymlinksDir);

				// Buttons and text
				var buttonDiv = el.createEl("div", { cls: "project-sync-button-div"});
				var button = new ButtonComponent(buttonDiv);
				buttonDiv.createEl("div", {text: `Sync to ${psb.prettypath}`, cls: "project-sync-button-text"});
				this.setButtonIcon(button, "sync", "project-sync-button-button");
				button.setTooltip("Sync to filesystem", {delay: 0, placement: 'bottom'});

				// Activate spinner, sync to path, deactivate spinner, activate checkmark, reset
				button.onClick(async(evt: MouseEvent) => {
					button.buttonEl.children[0].addClass("project-sync-button-icon-spin");
					await this.sync(psb);
					button.buttonEl.children[0].removeClass("project-sync-button-icon-spin");
					this.setButtonIcon(button, "check", "project-sync-button-button-success");
					await this.delay(2000);
					button.buttonEl.removeClass("project-sync-button-button-success");
					this.setButtonIcon(button, "sync", "project-sync-button-button");
				})
			// Catch errors and display them in codeblock
			} catch(e: unknown) {
				const displayError = el.createEl("div", { cls: "project-sync-displayerror-inline" });
				displayError.createEl("div", {text: `${(e as Error).name}`, cls: "project-sync-displayerror-inline-name"});
				displayError.createEl("small", {text: `${(e as Error).message}`, cls: "project-sync-displayerror-inline-message"});
			}
		  });

		this.addSettingTab(new ObsidianProjectSyncSettingsTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	onunload() {

	}

	// Sync vault folder(s) to specified path
	async sync(psb: ProjsyncBlock){
		try{

			// Get parent folder of note that contains projsync block
			const active_file = this.app.workspace.getActiveFile();
			if (active_file === null){
				throw TypeError("No active file...");
			}
			const super_folder = active_file.parent;
			if (super_folder === null){
				throw TypeError("No super folder....");
			}

			// Get all files and folders except parent folder
			let files: Array<TAbstractFile>;
			if (super_folder.path === "/")
				files = this.app.vault.getAllLoadedFiles().filter(file => {return file.path !== "/"});
			else {
				files = this.app.vault.getAllLoadedFiles().filter((file) => { return file.path.startsWith(super_folder.path+'/'); });
			}

			// Path to sync to must be created ouside of this plugin
			if(!existsSync(psb.path)) { throw ReferenceError("Sync path does not exist!"); }

			// Check if path is symlink 
			if (!this.settings.followSymlinksDir && lstatSync(psb.path).isSymbolicLink()) { throw TypeError("Path is symlink, see setting to enable symlink traversal."); }

			//Check path is a directory
			if (!statSync(psb.path).isDirectory()) { throw TypeError ("Path is not a directory!"); }

			// First pass make directory structure
			for (let i=0; i<files.length; i++) {
				if (files[i] instanceof TFolder){
					let syncDestDir: string = pathjoin(psb.path, files[i].path.replace(super_folder.path+'/', ''));
					if ( this.checkDir(syncDestDir) === false) {
						mkdirSync(syncDestDir, {recursive: true});
					}
				}
			}

			// Create all files that are not excluded
			for (let i=0; i<files.length; i++) {
				if (files[i] instanceof TFile) {
					try {
						// Check if file should be excluded
						let skip_file = false;
						for (let regi=0; regi<psb.exclude.length; regi++) {
							skip_file = psb.exclude[regi].test(files[i].name);
							if (skip_file === true) { break; } 
						}
						if (skip_file === true) { continue; }

						// Check to see we can write to the file
						let syncDestFile: string = pathjoin(psb.path, files[i].path.replace(super_folder.path+'/', ''));
						this.checkFile(syncDestFile);

						// Get file content and write it to the sync folder
						let fileContent: ArrayBuffer = await this.app.vault.readBinary(files[i] as TFile);
						writeFileSync(syncDestFile, new Uint8Array(fileContent));
					}
					// Don't abort if a file fails, just alert user
					catch (e: unknown) {
						new Notice(`${(e as Error).message}`, 0);
						continue;
					}
				}
			}

		}
		// Display error
		catch(e: unknown) {
			new ErrorModal(this.app, e as Error).open();
		}
	}

	// Check if path exists and if it does check access to the directory
	checkDir(dir: string) : boolean{
		if (dir.length === 0) { throw TypeError("Empty string..."); }
		if (!existsSync(dir)) { return false; }
		if (!this.settings.followSymlinksDir && lstatSync(dir).isSymbolicLink()) { throw TypeError(`Path leading to '${dir}' is a SymLink, see setting to enable symlink traversal.`); }
		if (!statSync(dir).isDirectory())  { throw TypeError(`Path leading to '${dir}' is not a directory.`); }
		try {
			accessSync(dir, constants.R_OK | constants.W_OK);
		}
		catch { 
			throw ReferenceError(`Insufficient permission to write to directory at '${dir}'`);
		}

		return true;
	}

	// Check if file exists and if it does checks we can write to it
	checkFile(file: string) {
		if (file.length === 0) { throw TypeError("Empty string..."); }
		if (!existsSync(file)) { return false; }
		if (!this.settings.followSymlinksFile && lstatSync(file).isSymbolicLink()) { throw TypeError(`Path leading to '${file}' is a SymLink, see setting to enable symlink traversal.`); }
		if (!statSync(file).isFile()) { throw TypeError(`Path leading to '${file}' is not a file.`); }
		try {
			accessSync(file, constants.R_OK | constants.W_OK);
		}
		catch { 
			throw ReferenceError(`Insufficient permission to write to file at '${file}'`);
		}

		return true;
	}

	// Sets button icon and css class
	setButtonIcon(button: ButtonComponent, icon: string, classTo: string) {
		button.setIcon(icon);
		button.setClass(classTo);
		button.setCta();
	}

	// Delay
	async delay(ms: number) {
		return new Promise( resolve => setTimeout(resolve, ms) );
	}

}

// Helper class to create ok looking modal
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

class ObsidianProjectSyncSettingsTab extends PluginSettingTab {
	plugin: ObsidianProjectSync;

	constructor(app: App, plugin: ObsidianProjectSync){
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Follow Directory Symlinks")
			.setDesc("Allows for following directory symlinks.")
			.addToggle(tog => {
				tog.setValue(this.plugin.settings.followSymlinksDir);
				tog.onChange(async (value) => {
					this.plugin.settings.followSymlinksDir = value;
					await this.plugin.saveSettings();
				})
			});
		
		new Setting(containerEl)
			.setName("Follow File Symlinks")
			.setDesc("Allows for following file symlinks.")
			.addToggle(tog => {
				tog.setValue(this.plugin.settings.followSymlinksFile);
				tog.onChange(async (value) => {
					this.plugin.settings.followSymlinksFile = value;
					await this.plugin.saveSettings();
				})
			});
	}
}