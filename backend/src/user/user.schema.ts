import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

type Stats = {
    wins: number;
    losses: number;
}

@Schema()
export class User {
    @Prop({required: true, unique: true})
    email: string;

    @Prop({required: true})
    provider: string;

    @Prop({required: true})
    providerId: string;

    @Prop()
    username: string;

    @Prop()
    avatar: string;
}

export const UserSchema = SchemaFactory.createForClass(User);