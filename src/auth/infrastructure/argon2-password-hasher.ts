import { Injectable, OnModuleInit } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';
import { randomBytes } from 'node:crypto';
import { PasswordHasher } from '../application/ports/password-hasher.port';

const argon2Options = {
  type: argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class Argon2PasswordHasher implements PasswordHasher, OnModuleInit {
  private readonly dummyHash = hash(randomBytes(32), argon2Options);

  async onModuleInit(): Promise<void> {
    await this.dummyHash;
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  async performDummyVerification(password: string): Promise<void> {
    await verify(await this.dummyHash, password);
  }
}
