export class PublicRegistrationDisabledError extends Error {
  constructor() {
    super('Public registration is disabled.');
    this.name = 'PublicRegistrationDisabledError';
  }
}

export class PublicRegistrationEmailConflictError extends Error {
  constructor() {
    super('The normalized e-mail is already registered.');
    this.name = 'PublicRegistrationEmailConflictError';
  }
}
