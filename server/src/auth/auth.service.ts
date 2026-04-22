import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);

    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (!user.isActive) throw new UnauthorizedException('Account is disabled');

    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordValid) throw new UnauthorizedException('Invalid credentials');

    const token = this.signToken(user);
    const userObj = user.toObject();
    const { password: _pwd, ...userWithoutPassword } = userObj;

    return { user: userWithoutPassword, token };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const profile = await this.usersService.findOne(userId);
    const user = await this.usersService.findByEmail(profile.email);

    if (!user) throw new UnauthorizedException();

    const isValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isValid) throw new BadRequestException('Current password is incorrect');

    const hashed = await bcrypt.hash(dto.newPassword, 10);
    await user.updateOne({ password: hashed });
    return { message: 'Password changed successfully' };
  }

  async getProfile(userId: string) {
    return this.usersService.findOneWithAvatar(userId);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const { currentPassword, newPassword, ...profileData } = dto;

    const updateData: Record<string, unknown> = { ...profileData };

    if (newPassword) {
      if (!currentPassword) {
        throw new BadRequestException('Введите текущий пароль');
      }
      const profile = await this.usersService.findOne(userId);
      const user = await this.usersService.findByEmail(profile.email);
      if (!user) throw new UnauthorizedException();

      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) throw new BadRequestException('Текущий пароль неверен');

      updateData.password = await bcrypt.hash(newPassword, 10);
    }

    if (profileData.firstName || profileData.lastName) {
      const first = profileData.firstName ?? '';
      const last = profileData.lastName ?? '';
      updateData.name = `${first} ${last}`.trim() || updateData.name;
    }

    const updated = await this.usersService.updateProfile(userId, updateData);
    return updated;
  }

  private signToken(user: UserDocument) {
    const payload = {
      sub: (user._id as any).toString(),
      email: user.email,
      role: user.role,
    };
    return this.jwtService.sign(payload);
  }
}
