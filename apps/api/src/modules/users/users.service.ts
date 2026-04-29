import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@cdp/db';
import type { UserRole } from '@cdp/db';
import { PrismaService } from '../../db/prisma.service';
import { AuthService } from '../auth/auth.service';
import { SessionsService } from '../auth/sessions.service';
import { TwoFactorService } from '../auth/two-factor.service';
import type { CreateUserBody, ListUsersQuery, UpdateUserBody } from './dto/users.dto';

export interface UserSummary {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  has_2fa: boolean;
  has_password: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AuditActor {
  id: string;
  ip?: string | null;
  userAgent?: string | null;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly twoFactor: TwoFactorService,
    private readonly sessions: SessionsService,
  ) {}

  async list(tenantId: string, query: ListUsersQuery): Promise<UserSummary[]> {
    const where: Prisma.UserWhereInput = { tenantId };
    if (query.q) {
      where.OR = [
        { email: { contains: query.q, mode: 'insensitive' } },
        { name: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.role) where.role = query.role;

    const rows = await this.prisma.user.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }],
      include: { totpSecret: { select: { verifiedAt: true } } },
    });
    return rows.map(toSummary);
  }

  async get(tenantId: string, id: string): Promise<UserSummary> {
    const user = await this.findScoped(tenantId, id);
    return toSummary(user);
  }

  /** Admin override: clear another user's 2FA without their password. */
  async resetTwoFactor(tenantId: string, actor: AuditActor, id: string): Promise<void> {
    await this.findScoped(tenantId, id); // ensure tenant scoping
    await this.twoFactor.adminReset(id, {
      id: actor.id,
      ip: actor.ip ?? null,
      userAgent: actor.userAgent ?? null,
    });
    // Force the user to re-authenticate so the bypass is single-use.
    await this.sessions.revokeAllForUser(id);
  }

  /**
   * Create a tenant-scoped user. Email is unique system-wide so we can
   * surface a 409 without leaking which tenant already owns it.
   */
  async create(
    tenantId: string,
    actor: AuditActor,
    body: CreateUserBody,
  ): Promise<UserSummary> {
    const email = body.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw new ConflictException(`User with email ${email} already exists`);

    // Password is optional — when omitted, the user can only sign in
    // via Google (their email is the whitelist).
    const passwordHash = body.password ? await AuthService.hashPassword(body.password) : null;

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          tenantId,
          email,
          name: body.name,
          passwordHash,
          role: body.role,
        },
        include: { totpSecret: { select: { verifiedAt: true } } },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actor.id,
          action: 'create',
          entity: 'user',
          entityId: created.id,
          ip: actor.ip ?? null,
          userAgent: actor.userAgent ?? null,
          after: {
            email: created.email,
            name: created.name,
            role: created.role,
            has_password: passwordHash !== null,
          },
        },
      });
      return created;
    });
    return toSummary(user);
  }

  async update(
    tenantId: string,
    actor: AuditActor,
    id: string,
    body: UpdateUserBody,
  ): Promise<UserSummary> {
    const existing = await this.findScoped(tenantId, id);

    // Last-admin guard — refuse to demote the last admin to a non-admin role.
    if (body.role && body.role !== existing.role && existing.role === 'admin') {
      await this.assertNotLastAdmin(tenantId, existing.id);
    }

    const data: Prisma.UserUncheckedUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.role !== undefined) data.role = body.role;
    if (body.password !== undefined) {
      data.passwordHash = await AuthService.hashPassword(body.password);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.user.update({
        where: { id },
        data,
        include: { totpSecret: { select: { verifiedAt: true } } },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actor.id,
          action: 'update',
          entity: 'user',
          entityId: id,
          ip: actor.ip ?? null,
          userAgent: actor.userAgent ?? null,
          before: { name: existing.name, role: existing.role },
          after: {
            name: next.name,
            role: next.role,
            password_changed: body.password !== undefined,
          },
        },
      });
      return next;
    });

    // Password change invalidates every existing session of the target
    // user (admin-driven password reset is the textbook example).
    if (body.password !== undefined) {
      await this.sessions.revokeAllForUser(id);
    }

    return toSummary(updated);
  }

  async delete(tenantId: string, actor: AuditActor, id: string): Promise<void> {
    if (id === actor.id) {
      throw new ForbiddenException('You cannot delete your own user');
    }
    const existing = await this.findScoped(tenantId, id);
    if (existing.role === 'admin') {
      await this.assertNotLastAdmin(tenantId, id);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: actor.id,
          action: 'delete',
          entity: 'user',
          entityId: id,
          ip: actor.ip ?? null,
          userAgent: actor.userAgent ?? null,
          before: { email: existing.email, name: existing.name, role: existing.role },
        },
      });
    });
  }

  private async findScoped(
    tenantId: string,
    id: string,
  ): Promise<UserWith2fa> {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      include: { totpSecret: { select: { verifiedAt: true } } },
    });
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  /**
   * Refuse if the user about to be removed/demoted is the last admin of
   * the tenant. Keeps every tenant from locking itself out.
   */
  private async assertNotLastAdmin(tenantId: string, exceptUserId: string): Promise<void> {
    const otherAdmins = await this.prisma.user.count({
      where: { tenantId, role: 'admin', NOT: { id: exceptUserId } },
    });
    if (otherAdmins === 0) {
      throw new BadRequestException('Cannot remove the last admin of the tenant');
    }
  }
}

type UserWith2fa = Prisma.UserGetPayload<{
  include: { totpSecret: { select: { verifiedAt: true } } };
}>;

function toSummary(user: UserWith2fa): UserSummary {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    has_2fa: user.totpSecret?.verifiedAt != null,
    has_password: user.passwordHash !== null,
    last_login_at: user.lastLoginAt?.toISOString() ?? null,
    created_at: user.createdAt.toISOString(),
    updated_at: user.updatedAt.toISOString(),
  };
}
