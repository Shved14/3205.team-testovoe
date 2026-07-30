import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { CreateJobRequest, ListJobsQuery } from '@repo/shared';
import { createJobSchema, listQuerySchema } from '@repo/shared';
import type { Response } from 'express';

import { ZodValidationPipe } from '../http/zod-validation.pipe';
import { JOBS_SERVICE } from './tokens';
import type { JobsService } from './jobs.service';

@Controller()
export class JobsController {
  constructor(@Inject(JOBS_SERVICE) private readonly jobsService: JobsService) {}

  @Post('api/jobs')
  @HttpCode(201)
  createJob(
    @Body(new ZodValidationPipe(createJobSchema)) body: CreateJobRequest,
  ): { jobId: string } {
    return this.jobsService.createJob(body);
  }

  @Get('api/jobs')
  listJobs(
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListJobsQuery,
  ): ReturnType<JobsService['listJobs']> {
    return this.jobsService.listJobs(query);
  }

  @Get('api/jobs/:id')
  getJob(
    @Param('id') id: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): ReturnType<JobsService['getJob']>['detail'] | void {
    const { detail, version } = this.jobsService.getJob(id);
    const etag = weakEtag(version);
    response.setHeader('ETag', etag);

    if (ifNoneMatch !== undefined && etagMatches(ifNoneMatch, etag)) {
      response.status(304);
      return;
    }

    return detail;
  }

  @Delete('api/jobs/:id')
  cancelJob(@Param('id') id: string): ReturnType<JobsService['cancelJob']> {
    return this.jobsService.cancelJob(id);
  }

  @Get('health')
  health(): ReturnType<JobsService['getHealth']> {
    return this.jobsService.getHealth(process.uptime() * 1000);
  }
}

function weakEtag(version: number): string {
  return `W/"${version}"`;
}

function etagMatches(ifNoneMatch: string, etag: string): boolean {
  const candidates = ifNoneMatch.split(',').map((value) => value.trim());
  return candidates.includes(etag) || candidates.includes('*');
}
