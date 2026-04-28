import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from 'nestjs-zod';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtGuard } from '../auth/jwt.guard';
import { Roles, RolesGuard } from '../auth/roles.decorator';
import type { AuthenticatedUser } from '../auth/types';
import {
  CONFIGURABLE_ROLES,
  PermissionsService,
  SECTIONS,
  type AccessMatrix,
  type PermissionsResponse,
} from './permissions.service';

const SectionsRecordSchema = z.record(z.boolean());
const SaveBodySchema = z.object({
  access: z.object({
    analyst: SectionsRecordSchema,
    viewer: SectionsRecordSchema,
  }),
});
type SaveBody = z.infer<typeof SaveBodySchema>;

@Controller({ path: 'admin/permissions', version: '1' })
@UseGuards(JwtGuard, RolesGuard)
@ApiBearerAuth()
@ApiTags('admin:permissions')
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  /** Read access — open to every authenticated tenant user so the
   *  sidebar can decide what to render for analyst/viewer. The
   *  matrix itself is not sensitive.
   */
  @Get()
  async get(@CurrentUser() user: AuthenticatedUser): Promise<PermissionsResponse> {
    const tenantId = this.tenantOrThrow(user);
    const access = await this.permissions.load(tenantId);
    return {
      sections: SECTIONS,
      configurable_roles: CONFIGURABLE_ROLES,
      access,
    };
  }

  /** Mutating access still requires admin / super_admin. */
  @Put()
  @Roles('super_admin', 'admin')
  async save(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(SaveBodySchema)) body: SaveBody,
  ): Promise<PermissionsResponse> {
    const tenantId = this.tenantOrThrow(user);
    const matrix = await this.permissions.save(tenantId, body.access as AccessMatrix);
    return {
      sections: SECTIONS,
      configurable_roles: CONFIGURABLE_ROLES,
      access: matrix,
    };
  }

  private tenantOrThrow(user: AuthenticatedUser): string {
    if (!user.tenantId) {
      throw new ForbiddenException(
        'super_admin must impersonate a tenant for tenant-scoped endpoints',
      );
    }
    return user.tenantId;
  }
}
