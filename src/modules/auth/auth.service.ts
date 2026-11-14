import crypto from "crypto";
import { eq, and, isNull, gt } from "drizzle-orm";
import { HttpError } from "../../utils/http-error.js";
import { db } from "../../db/index.js";
import { users } from "../../db/schema/users.js";
import { refreshTokens } from "../../db/schema/refresh-tokens.js";
import { hashPassword, comparePassword } from "../../utils/password.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../../utils/jwt.js";
import { env } from "../../config/env.js";
import { durationToMs } from "../../utils/duration.js";
import { RegisterInput, LoginInput } from "./auth.schema.js";

const REFRESH_TTL_MS = durationToMs(env.JWT_REFRESH_EXPIRES_IN, 7 * 24 * 60 * 60 * 1000);

const hashToken = (token: string): string => {
  return crypto.createHash("sha256").update(token).digest("hex");
};

export class AuthService {
  static async register(input: RegisterInput) {
    // 1. Check existing user
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.email, input.email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      throw new HttpError(409, "An account with this email address already exists.");
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

    // Store refresh token for this specific device
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    const tokenHash = hashToken(refreshToken);
    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash,
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
      throw new HttpError(401, "Invalid email or password.");
    }

    const isMatch = await comparePassword(input.password, user.passwordHash);
    if (!isMatch) {
      throw new HttpError(401, "Invalid email or password.");
    }

    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    const refreshToken = signRefreshToken({ userId: user.id, email: user.email });

    // Store refresh token for this specific device (supports unlimited concurrent devices)
    const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
    const tokenHash = hashToken(refreshToken);
    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash,
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
      throw new HttpError(401, "Invalid or expired refresh token.");
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1);

    if (!user) {
      throw new HttpError(401, "User no longer exists.");
    }

    // Check that this device's refresh token is active and not revoked
    const shaHash = hashToken(token);
    const activeTokens = await db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.userId, user.id),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, new Date())
        )
      );

    let matchedToken = activeTokens.find((t) => t.tokenHash === shaHash);
    if (!matchedToken) {
      // Check legacy bcrypt hash if present
      for (const t of activeTokens) {
        if (t.tokenHash.startsWith("$2a$") || t.tokenHash.startsWith("$2b$")) {
          const isMatch = await comparePassword(token, t.tokenHash);
          if (isMatch) {
            matchedToken = t;
            break;
          }
        }
      }
    }

    if (!matchedToken) {
      throw new HttpError(401, "Refresh token has been revoked or expired.");
    }

    const accessToken = signAccessToken({ userId: user.id, email: user.email });
    return { accessToken, refreshToken: token };
  }

  static async logout(userId: string, refreshToken?: string, allDevices = false) {
    if (allDevices) {
      // Revoke all devices if explicitly requested
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
      return;
    }

    // Revoke ONLY the requesting device's refresh token so other devices stay logged in
    if (refreshToken) {
      const shaHash = hashToken(refreshToken);
      await db
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(refreshTokens.userId, userId),
            eq(refreshTokens.tokenHash, shaHash),
            isNull(refreshTokens.revokedAt)
          )
        );

      // Also check legacy bcrypt tokens if any
      const activeTokens = await db
        .select()
        .from(refreshTokens)
        .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));

      for (const t of activeTokens) {
        if (t.tokenHash.startsWith("$2a$") || t.tokenHash.startsWith("$2b$")) {
          const isMatch = await comparePassword(refreshToken, t.tokenHash);
          if (isMatch) {
            await db
              .update(refreshTokens)
              .set({ revokedAt: new Date() })
              .where(eq(refreshTokens.id, t.id));
          }
        }
      }
    }
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
      throw new HttpError(404, "User not found.");
    }

    return user;
  }

  static async updateProfile(userId: string, data: { name?: string }) {
    if (!data.name || !data.name.trim()) {
      throw new HttpError(400, "Name cannot be empty.");
    }

    const [updated] = await db
      .update(users)
      .set({
        name: data.name.trim(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        createdAt: users.createdAt,
      });

    if (!updated) {
      throw new HttpError(404, "User not found.");
    }

    return updated;
  }

  static async changePassword(
    userId: string,
    data: { currentPassword?: string; newPassword?: string }
  ) {
    if (!data.currentPassword || !data.newPassword) {
      throw new HttpError(400, "Current password and new password are required.");
    }
    if (data.newPassword.length < 8) {
      throw new HttpError(400, "New password must be at least 8 characters.");
    }

    const [user] = await db
      .select({
        id: users.id,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new HttpError(404, "User not found.");
    }

    const isMatch = await comparePassword(data.currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new HttpError(400, "Current password is incorrect.");
    }

    const newHash = await hashPassword(data.newPassword);
    await db
      .update(users)
      .set({
        passwordHash: newHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Sign out every device so a stolen session can't outlive the password change
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));

    return { message: "Password changed successfully." };
  }
}
