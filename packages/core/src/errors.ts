export type WardenErrorCode =
  | "unauthorized"
  | "agent_revoked"
  | "wallet_not_found"
  | "policy_not_found"
  | "policy_denied"
  | "approval_required"
  | "challenge_invalid"
  | "challenge_unsupported"
  | "host_not_allowed"
  | "network_not_allowed"
  | "token_not_allowed"
  | "amount_exceeds_request_cap"
  | "amount_exceeds_daily_cap"
  | "rpc_failure"
  | "payment_failed"
  | "internal";

export class WardenError extends Error {
  readonly code: WardenErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    code: WardenErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "WardenError";
    this.code = code;
    this.details = details;
  }

  toJSON() {
    return { code: this.code, message: this.message, details: this.details };
  }
}
