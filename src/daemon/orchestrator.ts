import { DaemonServer, type ClientConnection } from "./server.js";
import type {
  InboundMessage,
  BuddyStateUpdate,
  AgentEvent,
} from "./protocol.js";
import { eventBus } from "../core/events.js";
import { initLogger, log, closeLogger } from "../utils/logger.js";
import { PatternMatcher } from "../monitor/pattern-matcher.js";
import { getReaction } from "../monitor/reactions.js";
import { BuddyRegistry } from "../buddy/registry.js";
import { BuddyInstance } from "../buddy/instance.js";
import { XpTracker } from "../progression/xp-tracker.js";
import {
  getBuddyProgress,
  saveBuddyProgress,
  getActiveBuddyId,
  setActiveBuddyId,
  updateStreak,
} from "../progression/persistence.js";
import { DialogueEngine } from "../conversation/dialogue-engine.js";
import { ConversationContext } from "../conversation/context.js";
import { loadConfig } from "../core/config.js";
import { levelProgress, xpToNextLevel } from "../progression/level-system.js";
import type { DevBuddyConfig } from "../types/config.js";

const TICK_INTERVAL_MS = 100;
const IDLE_TIMEOUT_MS = 30_000;
const SLEEP_TIMEOUT_MS = 300_000;
const AUTOSAVE_INTERVAL_MS = 60_000;
const INACTIVITY_SHUTDOWN_MS = 3 * 60 * 60 * 1000; // 3 hours

export class Orchestrator {
  private config: DevBuddyConfig;
  private server: DaemonServer;
  private registry: BuddyRegistry;
  private buddy: BuddyInstance | null = null;
  private patternMatcher: PatternMatcher;
  private xpTracker: XpTracker | null = null;
  private dialogueEngine: DialogueEngine | null = null;
  private context: ConversationContext;

  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private autosaveTimer: ReturnType<typeof setInterval> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private sleepTimer: ReturnType<typeof setTimeout> | null = null;
  private shutdownTimer: ReturnType<typeof setTimeout> | null = null;
  private frameCount = 0;
  private lastTickTime = Date.now();
  private startTime = Date.now();
  private running = false;

  private currentSpeech: string | null = null;
  private speechTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(config?: Partial<DevBuddyConfig>) {
    this.config = loadConfig(config);
    this.server = new DaemonServer((msg, client) =>
      this.handleMessage(msg, client),
    );
    this.registry = new BuddyRegistry();
    this.patternMatcher = new PatternMatcher();
    this.context = new ConversationContext();
  }

  async start(): Promise<void> {
    initLogger(this.config.debugLog);
    log("info", "Orchestrator starting");

    this.registry.loadBuiltIn();
    for (const dir of this.config.buddiesDir) {
      this.registry.loadFromDir(dir);
    }

    if (this.registry.size === 0) {
      console.error("No buddies found. Check your buddies directory.");
      process.exit(1);
    }

    this.buddy = this.selectBuddy();
    this.xpTracker = new XpTracker(this.buddy);
    this.dialogueEngine = new DialogueEngine(this.buddy, this.context);

    const streak = updateStreak();
    this.xpTracker.awardSessionStart();
    this.xpTracker.awardStreakBonus(streak);

    log("info", `Buddy: ${this.buddy.name} (Lv.${this.buddy.level})`);

    this.setupEventListeners();
    await this.server.start();

    this.running = true;
    this.startTime = Date.now();
    this.lastTickTime = Date.now();
    this.tickTimer = setInterval(() => this.tick(), TICK_INTERVAL_MS);
    this.autosaveTimer = setInterval(
      () => this.autosave(),
      AUTOSAVE_INTERVAL_MS,
    );

    this.resetIdleTimer();
    this.resetShutdownTimer();

    const greeting = this.buddy.getDialogue("greetings");
    if (greeting) {
      this.showSpeech(greeting);
    }

    this.setupSignalHandlers();
    eventBus.emit("engine:started");
    log("info", "Orchestrator started");
  }

  private selectBuddy(): BuddyInstance {
    let def;
    const requestedId = this.config.activeBuddyId || getActiveBuddyId();
    if (requestedId) {
      def = this.registry.getByName(requestedId);
    }
    if (!def) {
      def = this.registry.getRandom();
    }

    setActiveBuddyId(def.id);
    const progress = getBuddyProgress(def.id);
    return new BuddyInstance(def, progress);
  }

  private lastBroadcastFrame = -1;
  private lastBroadcastSpeech: string | null = null;
  private lastBroadcastAnim = "";

  private tick(): void {
    if (!this.running || !this.buddy) return;

    const now = Date.now();
    const deltaMs = now - this.lastTickTime;
    this.lastTickTime = now;
    this.frameCount++;

    this.buddy.tick(deltaMs * this.config.animationSpeed);

    const frameChanged = this.buddy.animator.frameIndex !== this.lastBroadcastFrame
      || this.buddy.animator.state !== this.lastBroadcastAnim;
    const speechChanged = this.currentSpeech !== this.lastBroadcastSpeech;

    if (frameChanged || speechChanged) {
      this.lastBroadcastFrame = this.buddy.animator.frameIndex;
      this.lastBroadcastAnim = this.buddy.animator.state;
      this.lastBroadcastSpeech = this.currentSpeech;
      this.broadcastState();
    }

    eventBus.emit("engine:tick", { frame: this.frameCount });
  }

  private buildStateUpdate(): BuddyStateUpdate | null {
    if (!this.buddy) return null;

    return {
      type: "state",
      buddy: {
        id: this.buddy.id,
        name: this.buddy.name,
        stats: this.buddy.definition.stats,
        personality: this.buddy.definition.personality,
      },
      animation: {
        state: this.buddy.animator.state,
        frameIndex: this.buddy.animator.frameIndex,
        frameLines: this.buddy.getCurrentFrameLines(),
      },
      speech: this.currentSpeech,
      progress: this.buddy.progress,
      xpProgress: levelProgress(this.buddy.progress.xp),
      xpToNext: xpToNextLevel(this.buddy.progress.xp),
    };
  }

  private broadcastState(): void {
    if (this.server.subscriberCount === 0) return;
    const state = this.buildStateUpdate();
    if (state) {
      this.server.broadcast(state);
    }
  }

  private forceBroadcast(): void {
    this.lastBroadcastFrame = -1;
    this.lastBroadcastAnim = "";
    this.lastBroadcastSpeech = null;
    this.broadcastState();
  }

  private showSpeech(text: string, durationMs?: number): void {
    this.currentSpeech = text;
    if (this.speechTimeout) clearTimeout(this.speechTimeout);
    this.speechTimeout = setTimeout(
      () => {
        this.currentSpeech = null;
      },
      durationMs || this.config.speechBubbleDuration,
    );
  }

  private handleMessage(msg: InboundMessage, client: ClientConnection): void {
    this.resetShutdownTimer();

    switch (msg.type) {
      case "cmd":
        this.handleCommandEvent(msg.cmd, msg.exit, msg.cwd);
        break;

      case "output":
        this.handleOutputLine(msg.line);
        break;

      case "agent_event":
        this.handleAgentEvent(msg);
        break;

      case "chat":
        this.handleChat(msg.text, client);
        break;

      case "subscribe":
        client.subscribed = true;
        log("debug", `Client ${client.id} subscribed`);
        // Send immediate state
        const state = this.buildStateUpdate();
        if (state) this.server.send(client, state);
        // Send buddy list
        this.server.send(client, {
          type: "buddy_list",
          buddies: this.registry.getAll().map((b) => ({
            id: b.id,
            name: b.name,
            description: b.description,
            active: b.id === this.buddy?.id,
          })),
        });
        break;

      case "choose_buddy": {
        const def = this.registry.getByName(msg.buddyId);
        if (!def) {
          this.server.send(client, {
            type: "error",
            message: `Buddy "${msg.buddyId}" not found`,
          });
          return;
        }
        this.switchBuddy(def.id);
        break;
      }

      case "ping":
        this.server.send(client, {
          type: "pong",
          uptime: Date.now() - this.startTime,
          clients: this.server.clientCount,
        });
        break;

      case "stop":
        this.stop();
        break;
    }
  }

  private handleCommandEvent(cmd: string, exitCode: number, cwd: string): void {
    this.resetIdleTimer();
    this.context.addEvent("terminal:output");
    log("debug", `Command event: exit=${exitCode}`, { cmd: cmd.slice(0, 100) });

    if (this.buddy) {
      this.buddy.progress.totalCommands++;
    }

    const match = this.patternMatcher.match(cmd);

    if (match && exitCode !== 0) {
      this.handlePatternMatch("generic:error");
    } else if (match) {
      this.handlePatternMatch(match.event);
    } else if (exitCode !== 0) {
      this.handlePatternMatch("generic:error");
    } else {
      this.handlePatternMatch("generic:success");
    }
  }

  private handleOutputLine(line: string): void {
    this.resetIdleTimer();
    this.context.addEvent("terminal:output");

    const match = this.patternMatcher.match(line);
    if (match) {
      this.handlePatternMatch(match.event);
    }
  }

  private handleAgentEvent(msg: AgentEvent): void {
    this.resetIdleTimer();
    const eventKey = `agent:${msg.kind === "prompt_submit" ? "prompt" : msg.kind === "tool_use" ? "tool" : msg.kind === "file_edit" ? "edit" : msg.kind}`;
    this.context.addEvent(eventKey);

    const detail = [msg.source, msg.tool, msg.file, msg.summary]
      .filter(Boolean)
      .join(" ");
    log("debug", `Agent event: ${eventKey}`, { source: msg.source, detail: detail.slice(0, 120) });

    this.handlePatternMatch(eventKey);
  }

  private handlePatternMatch(event: string): void {
    this.context.addEvent(event);
    const reaction = getReaction(event);
    if (!reaction || !this.buddy) return;

    if (this.buddy.animator.hasAnimation(reaction.animation)) {
      this.buddy.setAnimation(reaction.animation);
    }

    const dialogue = this.buddy.getDialogue(reaction.dialogueCategory);
    if (dialogue) {
      this.showSpeech(dialogue);
    }

    this.xpTracker?.award(reaction.xp, event);

    this.server.broadcast({ type: "event", event, detail: dialogue || undefined });
  }

  private async handleChat(text: string, client: ClientConnection): Promise<void> {
    if (!this.dialogueEngine || !this.buddy) return;

    this.buddy.setAnimation("thinking");
    const response = await this.dialogueEngine.respond(text);
    this.buddy.setAnimation("happy");
    this.showSpeech(response);

    this.xpTracker?.award(5, "chat");

    this.server.send(client, { type: "chat_response", text: response });
    eventBus.emit("chat:response", { text: response });
  }

  private switchBuddy(buddyId: string): void {
    // Save current buddy
    if (this.buddy) {
      saveBuddyProgress(this.buddy.id, this.buddy.progress);
    }

    const def = this.registry.get(buddyId);
    if (!def) return;

    setActiveBuddyId(def.id);
    const progress = getBuddyProgress(def.id);
    this.buddy = new BuddyInstance(def, progress);
    this.xpTracker = new XpTracker(this.buddy);
    this.dialogueEngine = new DialogueEngine(this.buddy, this.context);

    const greeting = this.buddy.getDialogue("greetings");
    if (greeting) this.showSpeech(greeting);

    this.forceBroadcast();
    log("info", `Switched to buddy: ${this.buddy.name}`);
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.sleepTimer) clearTimeout(this.sleepTimer);

    if (this.buddy?.animator.state === "sleeping") {
      this.buddy.setAnimation("idle");
    }

    this.idleTimer = setTimeout(() => {
      if (!this.buddy) return;
      const quip = this.buddy.getDialogue("idle");
      if (quip) this.showSpeech(quip);

      this.sleepTimer = setTimeout(() => {
        this.buddy?.setAnimation("sleeping");
      }, SLEEP_TIMEOUT_MS - IDLE_TIMEOUT_MS);
    }, IDLE_TIMEOUT_MS);
  }

  private resetShutdownTimer(): void {
    if (this.shutdownTimer) clearTimeout(this.shutdownTimer);
    this.shutdownTimer = setTimeout(() => {
      log("info", "Inactivity timeout, shutting down daemon");
      this.stop();
    }, INACTIVITY_SHUTDOWN_MS);
  }

  private setupEventListeners(): void {
    eventBus.on("level:up", ({ newLevel, unlocks }) => {
      if (!this.buddy) return;
      this.buddy.setAnimation("celebrating");
      const msg = this.buddy.getDialogue("levelUp") || `Level ${newLevel}!`;
      const unlockText =
        unlocks.length > 0 ? `\n${unlocks.join("\n")}` : "";
      this.showSpeech(`${msg}${unlockText}`, 6000);
    });
  }

  private setupSignalHandlers(): void {
    const gracefulStop = () => this.stop();
    process.on("SIGINT", gracefulStop);
    process.on("SIGTERM", gracefulStop);
  }

  private autosave(): void {
    if (this.buddy) {
      saveBuddyProgress(this.buddy.id, this.buddy.progress);
      log("debug", "Autosaved buddy progress");
    }
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    log("info", "Orchestrator stopping");

    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.autosaveTimer) clearInterval(this.autosaveTimer);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    if (this.shutdownTimer) clearTimeout(this.shutdownTimer);
    if (this.speechTimeout) clearTimeout(this.speechTimeout);

    this.autosave();
    await this.server.stop();

    closeLogger();
    process.exit(0);
  }
}
