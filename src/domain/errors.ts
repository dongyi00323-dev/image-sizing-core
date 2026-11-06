export type ErrorCode =
  | "INVALID_REQUEST"
  | "INPUT_NOT_FOUND"
  | "UNSUPPORTED_FORMAT"
  | "DECODE_FAILED"
  | "INVALID_TARGET_DIMENSIONS"
  | "INVALID_DPI"
  | "INPUT_OUTPUT_PATH_CONFLICT"
  | "OUTPUT_EXISTS"
  | "RESOURCE_LIMIT_EXCEEDED"
  | "INSUFFICIENT_TEMP_SPACE"
  | "BACKGROUND_STRATEGY_UNAVAILABLE"
  | "BACKGROUND_CONFIDENCE_LOW"
  | "OUTPUT_VERIFY_FAILED"
  | "SOURCE_CHANGED"
  | "CANCELLED"
  | "INTERNAL_ERROR";

export class EngineError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "EngineError";
  }
}
