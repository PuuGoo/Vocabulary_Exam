import { z } from "zod";

export const questionImportItemSchema = z.object({
  question: z.string().trim().min(1).max(4096),
  questionType: z.enum(["multiple_choice", "true_false", "essay", "speaking"]),
  options: z.array(z.string().trim().min(1).max(4096)).max(26).default([]),
  correctOptions: z.array(z.string().regex(/^[A-Z]$/)).max(26).default([]),
  answer: z.string().trim().max(16384).default(""), explanation: z.string().trim().max(16384).default(""),
  difficulty: z.enum(["easy", "medium", "hard"]).nullable().default(null),
  tags: z.array(z.string().trim().min(1).max(64)).max(30).default([]),
  speakingPart: z.enum(["part_1", "part_2", "part_3"]).nullable().default(null), topic: z.string().trim().max(256).nullable().default(null),
  status: z.literal("ready").default("ready"), duplicateAction: z.enum(["skip", "import"]).default("skip"),
}).superRefine((item, ctx) => {
  if (["multiple_choice", "true_false"].includes(item.questionType) && item.options.length < 2) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "MISSING_OPTIONS" });
  if (["multiple_choice", "true_false"].includes(item.questionType) && item.correctOptions.length < 1) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "MISSING_CORRECT_ANSWER" });
  if (item.correctOptions.some((id) => !item.options[id.charCodeAt(0) - 65])) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "INVALID_CORRECT_ANSWER" });
});

export const questionImportRequestSchema = z.object({
  category: z.string().trim().min(1).max(128),
  sourceType: z.enum(["clipboard", "xlsx", "other"]),
  items: z.array(questionImportItemSchema).min(1).max(5000),
});
