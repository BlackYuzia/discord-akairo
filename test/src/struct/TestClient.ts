import {
	AkairoClient,
	CommandHandler,
	ContextMenuCommandHandler,
	InhibitorHandler,
	ListenerHandler,
	TaskHandler
} from "#discord-akairo";
import { GatewayIntentBits } from "discord.js";
import path from "path";
import logger from "./Logger";

export default class TestClient extends AkairoClient {
	public commandHandler: CommandHandler;
	public inhibitorHandler: InhibitorHandler;
	public listenerHandler: ListenerHandler;
	public taskHandler: TaskHandler;
	public contextMenuCommandHandler: ContextMenuCommandHandler;
	public constructor() {
		super({
			ownerID: ["123992700587343872", "322862723090219008"],
			intents: [
				GatewayIntentBits.DirectMessageReactions,
				GatewayIntentBits.DirectMessages,
				GatewayIntentBits.DirectMessageTyping,
				GatewayIntentBits.GuildBans,
				GatewayIntentBits.GuildEmojisAndStickers,
				GatewayIntentBits.GuildIntegrations,
				GatewayIntentBits.GuildInvites,
				GatewayIntentBits.GuildMembers,
				GatewayIntentBits.GuildMessageReactions,
				GatewayIntentBits.GuildMessages,
				GatewayIntentBits.GuildMessageTyping,
				GatewayIntentBits.GuildPresences,
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildScheduledEvents,
				GatewayIntentBits.GuildVoiceStates,
				GatewayIntentBits.GuildWebhooks,
				GatewayIntentBits.MessageContent
			]
		});

		this.commandHandler = new CommandHandler(this, {
			directory: path.join(__dirname, "..", "commands"),
			ignoreCooldown: ["132266422679240704"],
			aliasReplacement: /-/g,
			prefix: "!!",
			allowMention: true,
			commandUtil: true,
			commandUtilLifetime: 10000,
			commandUtilSweepInterval: 10000,
			storeMessages: true,
			handleEdits: true,
			argumentDefaults: {
				prompt: {
					start: "What is thing?",
					modifyStart: (msg, text) => `${msg.author}, ${text}\nType \`cancel\` to cancel this command.`,
					retry: "What is thing, again?",
					modifyRetry: (msg, text) => `${msg.author}, ${text}\nType \`cancel\` to cancel this command.`,
					timeout: "Out of time.",
					ended: "No more tries.",
					cancel: "Cancelled.",
					retries: 5
				},
				modifyOtherwise: (msg, text) => `${msg.author}, ${text}`
			},
			autoRegisterSlashCommands: true
		});

		this.inhibitorHandler = new InhibitorHandler(this, {
			directory: path.join(__dirname, "..", "inhibitors")
		});

		this.listenerHandler = new ListenerHandler(this, {
			directory: path.join(__dirname, "..", "listeners")
		});

		this.taskHandler = new TaskHandler(this, {
			directory: path.join(__dirname, "..", "tasks")
		});

		this.contextMenuCommandHandler = new ContextMenuCommandHandler(this, {
			directory: path.join(__dirname, "..", "context-menu-commands")
		});

		this.setup();
	}

	public async setup() {
		this.commandHandler.useInhibitorHandler(this.inhibitorHandler);
		this.commandHandler.useListenerHandler(this.listenerHandler);
		this.commandHandler.useTaskHandler(this.taskHandler);
		this.commandHandler.useContextMenuCommandHandler(this.contextMenuCommandHandler);

		this.listenerHandler.setEmitters({
			commandHandler: this.commandHandler,
			inhibitorHandler: this.inhibitorHandler,
			listenerHandler: this.listenerHandler,
			taskHandler: this.taskHandler,
			contextMenuCommandHandler: this.contextMenuCommandHandler
		});

		const handlers = await Promise.allSettled([
			this.commandHandler
				.loadAll()
				.then(() => logger.log("Startup", "Loaded commands"))
				.catch(e => logger.error("Startup", "Error loading commands", e)),
			this.contextMenuCommandHandler
				.loadAll()
				.then(() => logger.log("Startup", "Loaded context menu commands"))
				.catch(e => logger.error("Startup", "Error loading context menu commands", e)),
			this.listenerHandler
				.loadAll()
				.then(() => logger.log("Startup", "Loaded listeners"))
				.catch(e => logger.error("Startup", "Error loading listeners", e)),
			this.inhibitorHandler
				.loadAll()
				.then(() => logger.log("Startup", "Loaded inhibitors"))
				.catch(e => logger.error("Startup", "Error loading inhibitors", e)),
			this.taskHandler
				.loadAll()
				.then(() => logger.log("Startup", "Loaded tasks"))
				.catch(e => logger.error("Startup", "Error loading tasks", e))
		]);

		const resolver = this.commandHandler.resolver;
		resolver.addType("1-10", (_, phrase) => {
			const num = resolver.type("integer")!(_, phrase);
			if (num == null) return null;
			if (num < 1 || num > 10) return null;
			return num;
		});

		if (handlers.some(h => h.status === "rejected")) {
			throw new Error("At least one handler failed to load.");
		}
	}

	public async start(token: string) {
		await this.login(token);
		this.taskHandler.startAll();
	}
}
