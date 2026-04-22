import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { Role } from '../common/enums/role.enum';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private usersService: UsersService,
    private configService: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    await this.seedSuperAdmin();
  }

  private async seedSuperAdmin() {
    const email = this.configService.get<string>('superAdmin.email') ?? 'admin@dashboard.com';
    const password = this.configService.get<string>('superAdmin.password') ?? 'Admin123!';

    const existing = await this.usersService.findByEmail(email);

    if (existing) {
      // Ensure super admin is always active
      if (!existing.isActive) {
        await existing.updateOne({ isActive: true });
        this.logger.log(`Super admin re-activated: ${email}`);
      }
      return;
    }

    await this.usersService.create({
      name: 'Super Admin',
      email,
      password,
      role: Role.SUPER_ADMIN,
    });

    this.logger.log(`Super admin created: ${email}`);
  }
}
