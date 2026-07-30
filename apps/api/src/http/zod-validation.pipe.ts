import {
  BadRequestException,
  type PipeTransform,
} from '@nestjs/common';
import type { ZodType } from 'zod';

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value ?? {});
    if (result.success) {
      return result.data;
    }

    const details = result.error.issues.map((issue) => ({
      path: issue.path,
      message: issue.message,
    }));

    throw new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details,
    });
  }
}
