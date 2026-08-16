export class AuthenticationRejectedError extends Error {
  constructor() {
    super('Authentication rejected.');
    this.name = 'AuthenticationRejectedError';
  }
}
