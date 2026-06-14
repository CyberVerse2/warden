import { z } from "zod";
import { postJson } from "../http";
import type { PaidOperation } from "../types";

const ResendSendEmailInputSchema = z
  .object({
    from: z.string().min(1),
    to: z.union([z.string().email(), z.array(z.string().email()).min(1).max(50)]),
    subject: z.string().min(1),
    html: z.string().optional(),
    text: z.string().optional(),
    cc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
    bcc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  })
  .refine((value) => value.html || value.text, {
    message: "Either html or text must be provided",
  });

export interface ResendOperationsOptions {
  apiKey: string;
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
        return postJson(
          context.fetch,
          `${baseUrl}/emails`,
          { authorization: `Bearer ${options.apiKey}` },
          parsed,
        );
      },
    },
  ];
}
