import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ApplicationService } from '../applications/application.service';
import { UnknownApplicationError } from '../common/errors';

@ApiTags('public')
@Controller('public')
export class PublicController {
  constructor(private readonly applications: ApplicationService) {}

  /**
   * Login options for the sign-in page, which used to hardcode its two buttons
   * in JSX. Accepts a slug or a client id.
   */
  @Get('applications/:identifier/providers')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @ApiOperation({ summary: 'Enabled login providers for an application' })
  async providers(@Param('identifier') identifier: string) {
    try {
      const application =
        await this.applications.findActiveBySlugOrClientId(identifier);
      const providers = await this.applications.listEnabledProviders(
        application.id,
      );

      return {
        application: { slug: application.slug, name: application.name },
        providers,
      };
    } catch (error) {
      if (error instanceof UnknownApplicationError) {
        // Unknown and disabled applications answer identically so this endpoint
        // cannot be used to enumerate which slugs exist.
        throw new NotFoundException('Application not found');
      }
      throw error;
    }
  }
}
