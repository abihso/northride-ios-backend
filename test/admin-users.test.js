import assert from "node:assert/strict";
import test from "node:test";
import { getTableName } from "drizzle-orm";
import { createAdminManagedUserHandler } from "../src/controllers/adminUsers.js";

const admin = { userType: "admin", isActive: true, isVerified: true };
const validInput = {
  fullName: "Rider Example",
  email: "RIDER@EXAMPLE.TEST",
  phoneNumber: "",
  password: "long-enough-password",
  userType: "rider",
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
});

test("admin account creation saves a verified account and omits its password hash", async () => {
  let inserted;
  const db = {
    insert(table) {
      assert.equal(getTableName(table), "users");
      return {
        values(value) {
          inserted = value;
          return {
            async returning() {
              return [{ userId: 17, ...value, passwordHash: "hashed-secret" }];
            },
          };
        },
      };
    },
  };
  const res = response();

  await createAdminManagedUserHandler({
    db,
    hashpassword: (password) => `hashed:${password}`,
  })({ user: admin, body: validInput }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(inserted.email, "rider@example.test");
  assert.equal(inserted.phoneNumber, null);
  assert.equal(inserted.userType, "rider");
  assert.equal(inserted.isActive, true);
  assert.equal(inserted.isVerified, true);
  assert.equal("passwordHash" in res.body.data, false);
});

test("account creation rejects non-admins and invalid roles without writing", async () => {
  let writes = 0;
  const handler = createAdminManagedUserHandler({
    db: {
      insert() {
        writes += 1;
        throw new Error("unexpected write");
      },
    },
    hashpassword: () => "hashed",
  });
  const denied = response();
  await handler(
    { user: { ...admin, userType: "customer" }, body: validInput },
    denied,
  );
  assert.equal(denied.statusCode, 403);

  const invalidRole = response();
  await handler(
    { user: admin, body: { ...validInput, userType: "superadmin" } },
    invalidRole,
  );
  assert.equal(invalidRole.statusCode, 400);
  assert.equal(writes, 0);
});
