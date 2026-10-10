import { getTableName } from "drizzle-orm";
import assert from "node:assert/strict";
import test from "node:test";
import { createDeleteAccountHandler } from "../src/controllers/auth.js";

function createDb(results) {
  const updates = [];
  const deletes = [];
  const db = {
    select() {
      return {
        from(table) {
          const rows = results[getTableName(table)]?.shift() ?? [];
          const query = {
            where() {
              return query;
            },
            limit() {
              return Promise.resolve(rows);
            },
          };
          return query;
        },
      };
    },
    async transaction(callback) {
      await callback({
        update(table) {
          return {
            set(values) {
              return {
                async where() {
                  updates.push({ table: getTableName(table), values });
                },
              };
            },
          };
        },
        delete(table) {
          return {
            async where() {
              deletes.push(getTableName(table));
            },
          };
        },
      });
    },
  };
  return { db, updates, deletes };
}

function response() {
  return {
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
  };
}

const riderUser = { userId: 7, userType: "rider" };

test("rider removal anonymizes profile data and preserves transaction tables", async () => {
  const { db, updates, deletes } = createDb({
    riders: [[{ riderId: 42 }]],
    deliveries: [[]],
    ride_bookings: [[]],
    rider_earnings: [[]],
    rider_documents: [[{ storageKey: "rider-documents/7/example" }]],
  });
  const req = {
    user: riderUser,
    body: { confirmation: "DELETE" },
    logout(callback) {
      callback(null);
    },
    session: {
      destroy(callback) {
        callback(null);
      },
    },
  };
  const res = response();

  const removedDocuments = [];
  await createDeleteAccountHandler({
    db,
    deleteStoredDocumentFn: async (key) => removedDocuments.push(key),
  })(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.clearedCookie, "connect.sid");
  assert.deepEqual(
    updates.map((update) => update.table),
    ["riders", "users"],
  );
  assert.equal(updates[0].values.isAvailable, false);
  assert.equal(updates[0].values.bankAccountNumber, null);
  assert.equal(updates[1].values.email, "deleted-rider-7@accounts.northride.invalid");
  assert.equal(updates[1].values.isActive, false);
  assert.deepEqual(
    deletes,
    [
      "rider_locations",
      "rider_documents",
      "user_addresses",
      "rider_preferences",
      "notifications",
    ],
  );
  assert.deepEqual(removedDocuments, ["rider-documents/7/example"]);
});

test("rider removal is blocked while earnings remain pending", async () => {
  const { db, updates, deletes } = createDb({
    riders: [[{ riderId: 42 }]],
    deliveries: [[]],
    ride_bookings: [[]],
    rider_earnings: [[{ earningId: 1 }]],
    rider_documents: [[{ storageKey: "rider-documents/7/example" }]],
  });
  const req = {
    user: riderUser,
    body: { confirmation: "DELETE" },
    logout(callback) {
      callback(null);
    },
    session: {
      destroy(callback) {
        callback(null);
      },
    },
  };
  const res = response();

  await createDeleteAccountHandler({ db })(req, res);

  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /pending earnings/i);
  assert.deepEqual(updates, []);
  assert.deepEqual(deletes, []);
});
