// Mirrors the Java backend's pattern: business-rule violations throw an
// IllegalArgumentException, caught centrally and returned as a structured
// { success: false, message } response. Default status 400, matching
// GlobalExceptionHandler's default mapping.
export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
