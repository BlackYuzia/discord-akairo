// @ts-check
"use strict";

/**
 * @typedef {import("../struct/AkairoClient").default} AkairoClient
 */

import AkairoError from "../util/AkairoError.js";
import { AkairoHandlerEvents } from "../util/Constants.js";
import AkairoModule from "./AkairoModule.js";
import Category from "../util/Category.js";
const  { Collection } = await import("discord.js")
import EventEmitter from "events";
import { readdirSync, statSync } from "fs";
import { dirname, sep, extname, resolve, join } from "path";

/**
 * Base class for handling modules.
 * @param {AkairoClient} client - The Akairo client.
 * @param {AkairoHandlerOptions} options - Options for module loading and handling.
 * @extends {EventEmitter}
 */
export default class AkairoHandler extends EventEmitter {
	/**
	 * @param {AkairoClient} client - The Akairo client.
	 * @param {AkairoHandlerOptions} options - Options for module loading and handling.
	 */
	constructor(
		client,
		{
			directory,
			classToHandle = AkairoModule,
			extensions = [".js", ".json", ".ts"],
			automateCategories = false,
			loadFilter = () => true
		}
	) {
		super();

		/**
		 * The Akairo client.
		 * @type {AkairoClient}
		 */
		this.client = client;

		/**
		 * The main directory to modules.
		 * @type {string}
		 */
		this.directory = directory;

		/**
		 * Class to handle.
		 * @type {Function}
		 */
		this.classToHandle = classToHandle;

		/**
		 * File extensions to load.
		 * @type {Set<string>}
		 */
		this.extensions = new Set(extensions);

		/**
		 * Whether or not to automate category names.
		 * @type {boolean}
		 */
		this.automateCategories = Boolean(automateCategories);

		/**
		 * Function that filters files when loading.
		 * @type {LoadPredicate}
		 */
		this.loadFilter = loadFilter;

		/**
		 * Modules loaded, mapped by ID to AkairoModule.
		 * @type {Collection<string, AkairoModule>}
		 */
		this.modules = new Collection();

		/**
		 * Categories, mapped by ID to Category.
		 * @type {Collection<string, Category>}
		 */
		this.categories = new Collection();
	}

	/**
	 * Registers a module.
	 * @param {AkairoModule} mod - Module to use.
	 * @param {string} [filepath] - Filepath of module.
	 * @returns {void}
	 */
	register(mod, filepath) {
		mod.filepath = filepath;
		mod.client = this.client;
		mod.handler = this;
		this.modules.set(mod.id, mod);

		if (mod.categoryID === "default" && this.automateCategories) {
			const dirs = dirname(filepath).split(sep);
			mod.categoryID = dirs[dirs.length - 1];
		}

		if (!this.categories.has(mod.categoryID)) {
			this.categories.set(mod.categoryID, new Category(mod.categoryID));
		}

		const category = this.categories.get(mod.categoryID);
		mod.category = category;
		category.set(mod.id, mod);
	}

	/**
	 * Deregisters a module.
	 * @param {AkairoModule} mod - Module to use.
	 * @returns {void}
	 */
	deregister(mod) {
		if (mod.filepath) delete require.cache[require.resolve(mod.filepath)];
		this.modules.delete(mod.id);
		mod.category.delete(mod.id);
	}

	/**
	 * Loads a module, can be a module class or a filepath.
	 * @param {string|Function} thing - Module class or path to module.
	 * @param {boolean} [isReload=false] - Whether this is a reload or not.
	 * @returns {AkairoModule}
	 */
	load(thing, isReload = false) {
		const isClass = typeof thing === "function";
		// @ts-expect-error
		if (!isClass && !this.extensions.has(extname(thing))) return undefined;

		let mod = isClass
			? thing
			: function findExport(m) {
					if (!m) return null;
					if (m.prototype instanceof this.classToHandle) return m;
					return m.default ? findExport.call(this, m.default) : null;
					// @ts-expect-error
			  }.call(this, require(thing));

		if (mod && mod.prototype instanceof this.classToHandle) {
			mod = new mod(this); // eslint-disable-line new-cap
		} else {
			// @ts-expect-error
			if (!isClass) delete require.cache[require.resolve(thing)];
			return undefined;
		}

		if (this.modules.has(mod.id))
			throw new AkairoError("ALREADY_LOADED", this.classToHandle.name, mod.id);
		// @ts-expect-error
		this.register(mod, isClass ? null : thing);
		this.emit(AkairoHandlerEvents.LOAD, mod, isReload);
		return mod;
	}

	/**
	 * Reads all modules from a directory and loads them.
	 * @param {string} [directory] - Directory to load from.
	 * Defaults to the directory passed in the constructor.
	 * @param {LoadPredicate} [filter] - Filter for files, where true means it should be loaded.
	 * Defaults to the filter passed in the constructor.
	 * @returns {AkairoHandler}
	 */
	loadAll(
		directory = this.directory,
		filter = this.loadFilter || (() => true)
	) {
		// @ts-expect-error
		const filepaths = this.constructor.readdirRecursive(directory);
		for (let filepath of filepaths) {
			filepath = resolve(filepath);
			if (filter(filepath)) this.load(filepath);
		}

		return this;
	}

	/**
	 * Removes a module.
	 * @param {string} id - ID of the module.
	 * @returns {AkairoModule}
	 */
	remove(id) {
		const mod = this.modules.get(id.toString());
		if (!mod)
			throw new AkairoError("MODULE_NOT_FOUND", this.classToHandle.name, id);

		this.deregister(mod);

		this.emit(AkairoHandlerEvents.REMOVE, mod);
		return mod;
	}

	/**
	 * Removes all modules.
	 * @returns {AkairoHandler}
	 */
	removeAll() {
		for (const m of Array.from(this.modules.values())) {
			if (m.filepath) this.remove(m.id);
		}

		return this;
	}

	/**
	 * Reloads a module.
	 * @param {string} id - ID of the module.
	 * @returns {AkairoModule}
	 */
	reload(id) {
		const mod = this.modules.get(id.toString());
		if (!mod)
			throw new AkairoError("MODULE_NOT_FOUND", this.classToHandle.name, id);
		if (!mod.filepath)
			throw new AkairoError("NOT_RELOADABLE", this.classToHandle.name, id);

		this.deregister(mod);

		const filepath = mod.filepath;
		const newMod = this.load(filepath, true);
		return newMod;
	}

	/**
	 * Reloads all modules.
	 * @returns {AkairoHandler}
	 */
	reloadAll() {
		for (const m of Array.from(this.modules.values())) {
			if (m.filepath) this.reload(m.id);
		}

		return this;
	}

	/**
	 * Finds a category by name.
	 * @param {string} name - Name to find with.
	 * @returns {Category}
	 */
	findCategory(name) {
		return this.categories.find(category => {
			return category.id.toLowerCase() === name.toLowerCase();
		});
	}

	/**
	 * Reads files recursively from a directory.
	 * @param {string} directory - Directory to read.
	 * @returns {string[]}
	 */
	static readdirRecursive(directory) {
		const result = [];

		(function read(dir) {
			const files = readdirSync(dir);

			for (const file of files) {
				const filepath = join(dir, file);

				if (statSync(filepath).isDirectory()) {
					read(filepath);
				} else {
					result.push(filepath);
				}
			}
		})(directory);

		return result;
	}
}

/**
 * Emitted when a module is loaded.
 * @event AkairoHandler#load
 * @param {AkairoModule} mod - Module loaded.
 * @param {boolean} isReload - Whether or not this was a reload.
 */

/**
 * Emitted when a module is removed.
 * @event AkairoHandler#remove
 * @param {AkairoModule} mod - Module removed.
 */

/**
 * Options for module loading and handling.
 * @typedef {Object} AkairoHandlerOptions
 * @prop {string} [directory] - Directory to modules.
 * @prop {Function} [classToHandle=AkairoModule] - Only classes that extends this class can be handled.
 * @prop {string[]|Set<string>} [extensions] - File extensions to load.
 * By default this is .js, .json, and .ts files.
 * @prop {boolean} [automateCategories=false] - Whether or not to set each module's category to its parent directory name.
 * @prop {LoadPredicate} [loadFilter] - Filter for files to be loaded.
 * Can be set individually for each handler by overriding the `loadAll` method.
 */

/**
 * Function for filtering files when loading.
 * True means the file should be loaded.
 * @typedef {Function} LoadPredicate
 * @param {String} filepath - Filepath of file.
 * @returns {boolean}
 */
