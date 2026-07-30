export interface RandomService {
  /** Inclusive integer in `[min, max]`. */
  intBetween(min: number, max: number): number;
}

export class SystemRandomService implements RandomService {
  intBetween(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new RangeError('min and max must be integers');
    }

    if (min > max) {
      throw new RangeError('min must be less than or equal to max');
    }

    const span = max - min + 1;
    return min + Math.floor(Math.random() * span);
  }
}
