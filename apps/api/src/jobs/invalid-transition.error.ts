export class InvalidTransitionError extends Error {
  readonly currentStatus: string;
  readonly attemptedStatus: string;
  readonly entityType: 'job' | 'url';

  constructor(
    entityType: 'job' | 'url',
    currentStatus: string,
    attemptedStatus: string,
  ) {
    super(
      `Invalid ${entityType} transition: ${currentStatus} -> ${attemptedStatus}`,
    );
    this.name = 'InvalidTransitionError';
    this.entityType = entityType;
    this.currentStatus = currentStatus;
    this.attemptedStatus = attemptedStatus;
  }
}
