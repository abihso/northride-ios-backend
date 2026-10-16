import assert from "node:assert/strict";
import test from "node:test";
import { createSocialAuthHandler } from "../src/controllers/socialAuth.js";
import {
  verifyFacebookIdentity,
  verifyGoogleIdentity,
} from "../src/utils/socialIdentity.js";

test("Google identity verification requires a valid audience and verified email", async () => {
  const validClaims = {
    sub: "google-user-123",
    email: "Rider@example.com",
    email_verified: "true",
    aud: "google-client",
    iss: "https://accounts.google.com",
    exp: "2000000000",
    name: "Rider Example",
  };
  const identity = await verifyGoogleIdentity("google-token", {
    clientIds: "other-client, google-client",
    now: () => 1_900_000_000_000,
    fetchJsonFn: async () => validClaims,
  });
  assert.deepEqual(identity, {
    subject: "google-user-123",
    email: "Rider@example.com",
    fullName: "Rider Example",
  });

  await assert.rejects(
    verifyGoogleIdentity("google-token", {
      clientIds: "other-client",
      now: () => 1_900_000_000_000,
      fetchJsonFn: async () => validClaims,
    }),
    { status: 401 },
  );
  await assert.rejects(
    verifyGoogleIdentity("google-token", {
      clientIds: "google-client",
      now: () => 1_900_000_000_000,
      fetchJsonFn: async () => ({ ...validClaims, email_verified: false }),
    }),
    { status: 401 },
  );
});

test("Facebook identity verification validates the app token and matching profile", async () => {
  const urls = [];
  const identity = await verifyFacebookIdentity("facebook-user-token", {
    appId: "facebook-app",
    appSecret: "server-secret",
    fetchJsonFn: async (url) => {
      urls.push(new URL(url));
      if (url.includes("/debug_token")) {
        return {
          data: {
            is_valid: true,
            app_id: "facebook-app",
            user_id: "facebook-user-123",
            expires_at: 2_000_000_000,
          },
        };
      }
      return {
        id: "facebook-user-123",
        email: "rider@example.com",
        name: "Rider Example",
      };
    },
  });

  assert.deepEqual(identity, {
    subject: "facebook-user-123",
    email: "rider@example.com",
    fullName: "Rider Example",
  });
  assert.equal(
    urls[0].searchParams.get("access_token"),
    "facebook-app|server-secret",
  );

  await assert.rejects(
    verifyFacebookIdentity("facebook-user-token", {
      appId: "facebook-app",
      appSecret: "server-secret",
      fetchJsonFn: async () => ({
        data: {
          is_valid: true,
          app_id: "facebook-app",
          user_id: "facebook-user-123",
          expires_at: "not-a-time",
        },
      }),
    }),
    { status: 401 },
  );
});

test("social login creates a verified account with the requested role and session", async () => {
  let insertedValues;
  let loggedInUser;
  let savedSession = false;
  const createdUser = {
    userId: 8,
    email: "rider@example.com",
    fullName: "Rider Example",
    userType: "rider",
    isVerified: true,
    isActive: true,
    riderOnboardingCompleted: false,
    passwordHash: "hashed-random-password",
  };
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [],
        }),
      }),
    }),
    insert: () => {
      const builder = {
        values(values) {
          insertedValues = values;
          return builder;
        },
        onConflictDoNothing() {
          return builder;
        },
        returning: async () => [createdUser],
      };
      return builder;
    },
  };
  const handler = createSocialAuthHandler({
    db,
    hashpassword: (password) => {
      assert.ok(password.length >= 40);
      return "hashed-random-password";
    },
    verifyGoogle: async () => ({
      subject: "google-user-123",
      email: "Rider@example.com",
      fullName: "Rider Example",
    }),
  });
  const req = {
    body: { provider: "google", token: "a-valid-provider-token", userType: "rider" },
    logIn(user, callback) {
      loggedInUser = user;
      callback();
    },
    session: {
      save(callback) {
        savedSession = true;
        callback();
      },
    },
  };
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  await handler(req, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.isNewAccount, true);
  assert.equal(res.body.user.email, "rider@example.com");
  assert.equal(res.body.user.passwordHash, undefined);
  assert.equal(insertedValues.userType, "rider");
  assert.equal(insertedValues.isVerified, true);
  assert.equal(insertedValues.googleSubject, "google-user-123");
  assert.equal(insertedValues.email, "rider@example.com");
  assert.equal(loggedInUser, createdUser);
  assert.equal(savedSession, true);
});

test("social login links a verified identity without changing an existing rider role", async () => {
  const existingUser = {
    userId: 12,
    email: "rider@example.com",
    fullName: "Existing Rider",
    userType: "rider",
    googleSubject: null,
    isVerified: false,
    isActive: true,
    riderOnboardingCompleted: true,
    passwordHash: "private-hash",
  };
  let updatedValues;
  let sessionUser;
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [existingUser],
        }),
      }),
    }),
    update: () => {
      const builder = {
        set(values) {
          updatedValues = values;
          return builder;
        },
        where() {
          return builder;
        },
        returning: async () => [
          { ...existingUser, ...updatedValues, googleSubject: "google-123" },
        ],
      };
      return builder;
    },
  };
  const handler = createSocialAuthHandler({
    db,
    hashpassword: () => {
      throw new Error("Existing accounts must not be re-passworded.");
    },
    verifyGoogle: async () => ({
      subject: "google-123",
      email: "RIDER@example.com",
      fullName: "Provider Name",
    }),
  });
  const req = {
    body: { provider: "google", token: "a-valid-provider-token" },
    logIn(user, callback) {
      sessionUser = user;
      callback();
    },
    session: { save: (callback) => callback() },
  };
  const res = {
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  await handler(req, res);

  assert.equal(res.body.success, true);
  assert.equal(res.body.user.userType, "rider");
  assert.equal(res.body.user.riderOnboardingCompleted, true);
  assert.equal(res.body.user.passwordHash, undefined);
  assert.equal(updatedValues.googleSubject, "google-123");
  assert.equal(updatedValues.isVerified, true);
  assert.equal(sessionUser.userId, existingUser.userId);
});
