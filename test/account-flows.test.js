import assert from "node:assert/strict";
import test from "node:test";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  createLoginHandler,
  getCurrentUser,
  logoutUser,
} from "../src/controllers/auth.js";
import {
  createRegistrationHandler,
  createVerificationHandler,
} from "../src/controllers/registration.js";
import { createCompleteRiderOnboardingHandler } from "../src/controllers/riderOnboarding.js";

const dialect = new PgDialect();
const account = (userId, userType = "rider", extra = {}) => ({
  userId,
  email: `user${userId}@example.test`,
  passwordHash: "private-password-hash",
  userType,
  isActive: true,
  isVerified: true,
  riderOnboardingCompleted: false,
  ...extra,
});

// The handlers run unchanged against a tiny in-memory adapter. Predicates are
// compiled by the installed Drizzle dialect, so assertions exercise the actual
// account identifiers used by the production queries without opening a socket.
const fixture = (accounts = [], profiles = []) => {
  const state = {
    users: structuredClone(accounts),
    riders: structuredClone(profiles),
  };
  let failProfileInsert = false;
  const matching = (rows, condition) => {
    const query = dialect.sqlToQuery(condition);
    const field = query.sql.includes('"email"') ? "email" : "userId";
    return rows.filter((row) => row[field] === query.params[0]);
  };
  const adapter = (data) => ({
    select() {
      let rows;
      const query = {
        from(table) {
          rows = data[getTableName(table)];
          return query;
        },
        where(condition) {
          rows = matching(rows, condition);
          return query;
        },
        for() {
          return query;
        },
        async limit(limit) {
          return rows.slice(0, limit).map((row) => ({ ...row }));
        },
      };
      return query;
    },
    insert(table) {
      return {
        values(value) {
          const rows = data[getTableName(table)];
          return {
            async returning() {
              const row = {
                ...value,
                userId: Math.max(0, ...rows.map((item) => item.userId)) + 1,
              };
              rows.push(row);
              return [{ ...row }];
            },
            async onConflictDoUpdate({ set }) {
              if (failProfileInsert)
                throw new Error("simulated database failure");
              const existing = rows.find((row) => row.userId === value.userId);
              if (existing) Object.assign(existing, set);
              else rows.push({ riderId: rows.length + 1, ...value });
            },
          };
        },
      };
    },
    update(table) {
      return {
        set(value) {
          return {
            where(condition) {
              return {
                async returning() {
                  return matching(data[getTableName(table)], condition).map(
                    (row) => {
                      Object.assign(row, value);
                      return { ...row };
                    },
                  );
                },
              };
            },
          };
        },
      };
    },
  });
  const db = adapter(state);
  db.transaction = async (run) => {
    const staged = structuredClone(state);
    const result = await run(adapter(staged));
    Object.assign(state, staged);
    return result;
  };
  return {
    db,
    state,
    failNextProfileInsert() {
      failProfileInsert = true;
    },
  };
};

const response = () => ({
  statusCode: 200,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
  clearCookie(name) {
    this.clearedCookie = name;
  },
});
const request = (user, body = {}) => {
  const events = [];
  const req = {
    user,
    body,
    events,
    isAuthenticated: () => Boolean(req.user),
    session: {
      save(callback) {
        queueMicrotask(() => {
          events.push("saved");
          callback();
        });
      },
    },
    logIn(value, callback) {
      req.user = value;
      events.push("login");
      callback();
    },
  };
  return req;
};
const profile = {
  vehicleType: "motorcycle",
  bankAccountName: "Test Rider",
  bankAccountNumber: "0123456789",
  bankName: "Test Bank",
};
const registration = (db) =>
  createRegistrationHandler({
    db,
    hashpassword: () => "hashed-password",
    generateSixDigitCode: () => 123456,
    sendSms: async () => {},
    sendVerificationEmail: async () => {},
  });

test("registration persists rider/client choices and defaults legacy clients", async () => {
  for (const [role, expected] of [
    ["rider", "rider"],
    ["customer", "customer"],
    [undefined, "customer"],
  ]) {
    const { db, state } = fixture();
    const req = request(null, {
      email: "New.User@Example.Test",
      passwordHash: "password",
      userType: role,
      riderOnboardingCompleted: true,
      isVerified: true,
    });
    const res = response();
    await registration(db)(req, res);
    assert.equal(res.statusCode, 201);
    assert.equal(state.users[0].userType, expected);
    assert.equal(state.users[0].email, "new.user@example.test");
    assert.equal(state.users[0].riderOnboardingCompleted, false);
    assert.equal(state.users[0].isVerified, false);
    assert.equal("passwordHash" in res.body.data, false);
    assert.equal(req.session.verification.userId, state.users[0].userId);
    assert.deepEqual(req.events, ["saved"]);
  }
});

test("registration rejects administrator and invalid roles before any database write", async () => {
  for (const role of ["admin", "client", "RIDER", "", null, {}, []]) {
    const { db, state } = fixture();
    const res = response();
    await registration(db)(
      request(null, {
        email: "new@example.test",
        passwordHash: "password",
        userType: role,
      }),
      res,
    );
    assert.equal(res.statusCode, 400);
    assert.equal(state.users.length, 0);
  }
});

test("verification signs in the selected rider and persists a safe session response", async () => {
  const { db, state } = fixture([account(7, "rider", { isVerified: false })]);
  const req = request(null, {
    email: "USER7@EXAMPLE.TEST",
    code: ["1", "2", "3", "4", "5", "6"],
  });
  req.session.verification = {
    email: "user7@example.test",
    userId: 7,
    code: 123456,
    attempts: 0,
    expiresAt: Date.now() + 60_000,
  };
  const res = response();
  await createVerificationHandler({ db })(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(state.users[0].isVerified, true);
  assert.equal(req.user.userId, 7);
  assert.deepEqual(req.events, ["login", "saved"]);
  assert.equal(req.session.verification, undefined);
  assert.equal(res.body.user.userType, "rider");
  assert.equal(res.body.user.riderOnboardingCompleted, false);
  assert.equal("passwordHash" in res.body.user, false);
});

test("verification cannot authenticate a different account with another session's code", async () => {
  const { db, state } = fixture([
    account(7, "rider", { isVerified: false }),
    account(8, "customer", { isVerified: false }),
  ]);
  const req = request(null, { email: "user8@example.test", code: "123456" });
  req.session.verification = {
    email: "user7@example.test",
    userId: 7,
    code: 123456,
    attempts: 0,
    expiresAt: Date.now() + 60_000,
  };
  const res = response();
  await createVerificationHandler({ db })(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(req.user, null);
  assert.ok(state.users.every((user) => !user.isVerified));
});

test("login and restoration return persisted onboarding state without exposing password hashes", async () => {
  const user = account(7, "rider", { riderOnboardingCompleted: true });
  const passport = {
    authenticate: (_strategy, callback) => () => callback(null, user),
  };
  const req = request(null);
  const res = response();
  await createLoginHandler(passport)(req, res, () => {});
  assert.equal(res.body.user.riderOnboardingCompleted, true);
  assert.equal("passwordHash" in res.body.user, false);
  assert.equal(user.passwordHash, "private-password-hash");
  assert.deepEqual(req.events, ["login", "saved"]);
  const restored = response();
  getCurrentUser(req, restored);
  assert.deepEqual(restored.body.user, res.body.user);
  const unauthenticated = response();
  getCurrentUser(request(null), unauthenticated);
  assert.equal(unauthenticated.statusCode, 401);
});

test("login returns the not verified response for unverified accounts", async () => {
  const passport = {
    authenticate: (_strategy, callback) => () =>
      callback(null, false, { message: "not verified" }),
  };
  const res = response();
  await createLoginHandler(passport)(request(null), res, () => {});
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { success: false, message: "not verified" });
});

test("onboarding is scoped to the authenticated rider and cannot grant privileges", async () => {
  const rider = account(7);
  const { db, state } = fixture([rider, account(8)]);
  const req = request(rider, {
    ...profile,
    userId: 8,
    userType: "admin",
    isApproved: true,
    isAvailable: true,
  });
  const res = response();
  await createCompleteRiderOnboardingHandler({ db })(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(
    state.users.find((user) => user.userId === 7).riderOnboardingCompleted,
    true,
  );
  assert.equal(
    state.users.find((user) => user.userId === 8).riderOnboardingCompleted,
    false,
  );
  assert.equal(state.riders.length, 1);
  assert.equal(state.riders[0].userId, 7);
  assert.equal(state.riders[0].isApproved, false);
  assert.equal(state.riders[0].isAvailable, false);
  assert.equal(res.body.user.userType, "rider");
  assert.equal("passwordHash" in res.body.user, false);
});

test("repeating completion preserves one profile and does not reset approved riders", async () => {
  const rider = account(7);
  const { db, state } = fixture([rider]);
  const complete = createCompleteRiderOnboardingHandler({ db });
  await complete(request(rider, profile), response());
  state.riders[0].isApproved = true;
  state.riders[0].isAvailable = true;
  const second = response();
  await complete(
    request(rider, { ...profile, bankAccountNumber: "changed" }),
    second,
  );
  assert.equal(second.statusCode, 200);
  assert.equal(state.riders.length, 1);
  assert.equal(state.riders[0].bankAccountNumber, profile.bankAccountNumber);
  assert.equal(state.riders[0].isApproved, true);
  assert.equal(state.riders[0].isAvailable, true);
});

test("existing incomplete profiles are updated without creating duplicates", async () => {
  const rider = account(7);
  const { db, state } = fixture(
    [rider],
    [
      {
        riderId: 10,
        userId: 7,
        vehicleType: "bicycle",
        isApproved: false,
        isAvailable: false,
      },
    ],
  );
  await createCompleteRiderOnboardingHandler({ db })(
    request(rider, profile),
    response(),
  );
  assert.equal(state.riders.length, 1);
  assert.equal(state.riders[0].riderId, 10);
  assert.equal(state.riders[0].vehicleType, "motorcycle");
  assert.equal(state.users[0].riderOnboardingCompleted, true);
});

test("clients, anonymous users, and incomplete profiles cannot complete rider onboarding", async () => {
  for (const [user, body, expected] of [
    [account(7, "customer"), profile, 403],
    [null, profile, 403],
    [account(7), {}, 400],
  ]) {
    const { db, state } = fixture(user ? [user] : []);
    const res = response();
    await createCompleteRiderOnboardingHandler({ db })(
      request(user, body),
      res,
    );
    assert.equal(res.statusCode, expected);
    assert.equal(state.riders.length, 0);
    assert.ok(state.users.every((item) => !item.riderOnboardingCompleted));
  }
});

test("a failed profile write cannot mark onboarding complete", async () => {
  const user = account(7);
  const setup = fixture([user]);
  setup.failNextProfileInsert();
  const res = response();
  await createCompleteRiderOnboardingHandler(setup)(
    request(user, profile),
    res,
  );
  assert.equal(res.statusCode, 500);
  assert.equal(setup.state.users[0].riderOnboardingCompleted, false);
  assert.equal(setup.state.riders.length, 0);
});

test("logout removes passport authentication and destroys the saved session", async () => {
  const events = [];
  const req = {
    logout(callback) {
      events.push("logout");
      callback();
    },
    session: {
      destroy(callback) {
        events.push("destroy");
        callback();
      },
    },
  };
  const res = response();
  await logoutUser(req, res);
  assert.deepEqual(events, ["logout", "destroy"]);
  assert.equal(res.clearedCookie, "connect.sid");
  assert.equal(res.body.success, true);
});
