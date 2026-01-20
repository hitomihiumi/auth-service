import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { User, UserSchema } from './user.schema';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
