import { z } from "zod";
import { postJson } from "../http";
import type { PaidOperation } from "../types";

const ResendAttachmentSchema = z.object({
  filename: z.string().min(1),
  content: z.string().min(1).optional(),
  path: z.string().min(1).optional(),
});

const ResendSendEmailInputSchema = z
  .object({
    from: z.string().min(1).optional(),
    to: z.union([z.string().email(), z.array(z.string().email()).min(1).max(50)]),
    subject: z.string().min(1),
    html: z.string().optional(),
    text: z.string().optional(),
    cc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
    bcc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
    attachments: z.array(ResendAttachmentSchema).min(1).max(10).optional(),
  })
  .refine((value) => value.html || value.text, {
    message: "Either html or text must be provided",
  });

export interface ResendOperationsOptions {
  apiKey: string;
  from?: string;
  baseUrl?: string;
  prices?: Partial<Record<"sendEmail", string>>;
}

export function createResendOperations(
  options: ResendOperationsOptions,
): PaidOperation[] {
  const baseUrl = options.baseUrl ?? "https://api.resend.com";
  return [
    {
      id: "messaging.sendEmail",
      category: "messaging",
      provider: "resend",
      method: "POST",
      path: "/messaging/send-email",
      description: "Send an email with Resend.",
      price: { amountUsd: options.prices?.sendEmail ?? "0.02" },
      input: ResendSendEmailInputSchema,
      async handler(input, context) {
        const parsed = ResendSendEmailInputSchema.parse(input);
        const from = options.from ?? parsed.from;
        if (!from) {
          throw new Error("Resend sender address is required");
        }
        if (parsed.attachments?.some((attachment) => !attachment.content && !attachment.path)) {
          throw new Error("Each Resend attachment requires content or path");
        }
        return postJson(
          context.fetch,
          `${baseUrl}/emails`,
          { authorization: `Bearer ${options.apiKey}` },
          { ...parsed, from },
        );
      },
    },
  ];
}
