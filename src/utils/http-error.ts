export class HttpError extends Error {
  statusCode: number;
  expose: boolean;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.expose = true;
  }
}
