import { z } from "zod";

const animationDefSchema = z.object({
  frameDuration: z.number().int().min(50).default(500),
  loop: z.boolean().default(true),
  returnTo: z.string().optional(),
  frames: z.array(z.string()).min(1),
});

const cosmeticOverlaySchema = z.object({
  row: z.number().int().min(0),
  col: z.number().int().min(0),
  art: z.string(),
});

const dialogueUnlockSchema = z.object({
  type: z.literal("dialogue"),
  category: z.string(),
  entries: z.array(z.string()).min(1),
});

const animationUnlockSchema = z.object({
  type: z.literal("animation"),
  name: z.string(),
  definition: animationDefSchema,
});

const cosmeticUnlockSchema = z.object({
  type: z.literal("cosmetic"),
  name: z.string(),
  overlay: cosmeticOverlaySchema,
});

const levelUnlockSchema = z.discriminatedUnion("type", [
  dialogueUnlockSchema,
  animationUnlockSchema,
  cosmeticUnlockSchema,
]);

const buddyStatsSchema = z.object({
  wisdom: z.number().int().min(1).max(10),
  energy: z.number().int().min(1).max(10),
  humor: z.number().int().min(1).max(10),
  debugSkill: z.number().int().min(1).max(10),
  patience: z.number().int().min(1).max(10),
});

const buddyPersonalitySchema = z.object({
  traits: z.array(z.string()).min(1),
  speechStyle: z.string(),
  catchphrase: z.string(),
});

export const buddyDefinitionSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with hyphens"),
  name: z.string().min(1),
  description: z.string(),
  version: z.number().int().min(1).default(1),
  appearance: z.object({
    width: z.number().int().min(1).max(40),
    height: z.number().int().min(1).max(20),
  }),
  stats: buddyStatsSchema,
  personality: buddyPersonalitySchema,
  animations: z
    .record(z.string(), animationDefSchema)
    .refine((anims) => "idle" in anims, {
      message: "Buddy must have an 'idle' animation",
    }),
  dialogue: z
    .record(z.string(), z.array(z.string()).min(1))
    .refine((d) => "greetings" in d, {
      message: "Buddy must have a 'greetings' dialogue category",
    }),
  levelUnlocks: z.record(
    z.string().regex(/^\d+$/),
    z.array(levelUnlockSchema),
  ).default({}),
});

export type ValidatedBuddyDefinition = z.infer<typeof buddyDefinitionSchema>;
