import { Injectable } from '@nestjs/common';
import { User } from "./user.schema";
import {InjectModel} from "@nestjs/mongoose";
import {Model} from "mongoose";
import {UserDto} from "./dto/user-dto";

@Injectable()
export class UserService {
    constructor(@InjectModel(User.name) private userModel: Model<User>)  {}

    async create(userData: UserDto): Promise<User> {
        const user = new this.userModel(userData);
        return user.save();
    }

    async findByID(id: string): Promise<User | null> {
        return this.userModel.findOne({ providerId: id }).exec();
    }

    async update(id: string, userData: Partial<UserDto>): Promise<User | null> {
        return this.userModel.findOneAndUpdate({ providerId: id }, userData, { new: true }).exec();
    }
}
