import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { Role } from '../../common/enums/role.enum';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, select: false })
  password: string;

  @Prop({ type: String, enum: Role, default: Role.CLIENT })
  role: Role;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: String, default: null })
  company: string;

  @Prop({ type: String, default: null })
  phone: string;

  @Prop({ type: String, default: null })
  firstName: string;

  @Prop({ type: String, default: null })
  lastName: string;

  @Prop({ type: String, default: null })
  position: string;

  @Prop({ type: String, default: null })
  avatar: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
