import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AuthService } from './auth/auth.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            generateJwt: jest.fn(),
          },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('should be defined', () => {
    expect(appController).toBeDefined();
  });
});
