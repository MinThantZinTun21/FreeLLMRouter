export class BridgeError extends Error {
  readonly statusCode: number;
  readonly code?: string;

  constructor(message: string, statusCode = 401, code?: string) {
    super(message);
    this.name = 'BridgeError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function isBridgeError(error: unknown): error is BridgeError {
  return error instanceof BridgeError;
}
