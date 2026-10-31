import { eq, and, isNull } from "drizzle-orm";
import { db } from "../../db/index.js";
import { users } from "../../db/schema/users.js";
import { refreshTokens } from "../../db/schema/refresh-tokens.js";
import { hashPassword, comparePassword } from "../../utils/password.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../../utils/jwt.js";
import { RegisterInput, LoginInput } from "./auth.schema.js";

export class AuthService {
  static async register(input: RegisterInput) {
    // 1. Check existing user
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, input.email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      throw new Error("An account with this email address already exists.");
    }

    // 2. Hash password
    const passwordHash = await hashPassword(input.password);

    // 3. Create user
    const [user] = await db
      .insert(users)
      .values({
        name: input.name,
        email: input.email.toLowerCase(),
        passwordHash,
      })
      .returning();

    // 4. Generate tokens
    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    const refreshToken = signRefreshToken({ userId: user.id, email: user.email });

    // Store refresh token
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const hashedRefresh = await hashPassword(refreshToken);
    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: hashedRefresh,
      expiresAt,
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      },
      accessToken,
      refreshToken,
    };
  }

  static async login(input: LoginInput) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, input.email.toLowerCase()))
      .limit(1);

    if (!user) {
      throw new Error("Invalid email or password.");
    }

    const isMatch = await comparePassword(input.password, user.passwordHash);
    if (!isMatch) {
      throw new Error("Invalid email or password.");
    }

    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    const refreshToken = signRefreshToken({ userId: user.id, email: user.email });

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const hashedRefresh = await hashPassword(refreshToken);
    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash: hashedRefresh,
      expiresAt,
    });

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      },
      accessToken,
      refreshToken,
    };
  }

  static async refresh(token: string) {
    const payload = verifyRefreshToken(token);
    if (!payload) {
      throw new Error("Invalid or expired refresh token.");
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (!user) {
      throw new Error("User no longer exists.");
    }

    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    return { accessToken };
  }

  static async logout(userId: string) {
    // Revoke all active refresh tokens for this user
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }

  static async getProfile(userId: string) {
    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new Error("User not found.");
    }

    return user;
  }
}
