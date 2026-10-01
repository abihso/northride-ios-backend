import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import assert from "node:assert/strict";
import test from "node:test";
import {
  findActiveRequest,
  findActiveRideRequest,
} from "../src/utils/activeRideRequest.js";

const dialect = new PgDialect();

function fixture(results) {
  const queries = [];
  const db = {
    select(selection) {
      let rows = [];
      let tableName;
      const query = {
        from(table) {
          tableName = getTableName(table);
          rows = results[tableName] ?? [];
          return query;
        },
        where(condition) {
          const compiled = dialect.sqlToQuery(condition);
          queries.push({ tableName, ...compiled });
          const [userId, deliveryType, ...statuses] = compiled.params;
          rows = rows.filter((row) => {
            if (tableName === "deliveries") {
              return (
                row.senderId === userId &&
                row.deliveryType === deliveryType &&
                statuses.includes(row.status)
              );
            }
            return (
              row.userId === userId && compiled.params.includes(row.status)
            );
          });
          return query;
        },
        limit(count) {
          return Promise.resolve(
            rows
              .slice(0, count)
              .map((row) =>
                Object.fromEntries(
                  Object.keys(selection).map((key) => [key, row[key]]),
                ),
              ),
          );
        },
      };
      return query;
    },
  };
  return { db, queries };
}

test("an active ride delivery prevents a second ride request", async () => {
  const { db } = fixture({
    deliveries: [
      { deliveryId: 18, senderId: 7, deliveryType: "ride", status: "accepted" },
    ],
  });

  assert.deepEqual(await findActiveRideRequest(db, 7), {
    kind: "delivery",
    deliveryId: 18,
    status: "accepted",
  });
});

test("an active ride-booking record prevents another ride request", async () => {
  const { db } = fixture({
    ride_bookings: [{ rideId: 24, userId: 7, status: "in_progress" }],
  });

  assert.deepEqual(await findActiveRideRequest(db, 7), {
    kind: "ride",
    rideId: 24,
    status: "in_progress",
  });
});

test("completed, cancelled, and another customer's rides do not block booking", async () => {
  const { db } = fixture({
    deliveries: [
      { deliveryId: 1, senderId: 7, deliveryType: "ride", status: "delivered" },
      { deliveryId: 2, senderId: 9, deliveryType: "ride", status: "accepted" },
      { deliveryId: 3, senderId: 7, deliveryType: "send", status: "pending" },
    ],
    ride_bookings: [
      { rideId: 4, userId: 7, status: "completed" },
      { rideId: 5, userId: 7, status: "cancelled" },
      { rideId: 6, userId: 9, status: "confirmed" },
    ],
  });

  assert.equal(await findActiveRideRequest(db, 7), null);
});

test("send and receive each allow only one active request of their own type", async () => {
  const { db } = fixture({
    deliveries: [
      { deliveryId: 31, senderId: 7, deliveryType: "send", status: "pending" },
      {
        deliveryId: 32,
        senderId: 7,
        deliveryType: "receive",
        status: "accepted",
      },
    ],
  });

  assert.deepEqual(await findActiveRequest(db, 7, "send"), {
    kind: "delivery",
    deliveryId: 31,
    status: "pending",
  });
  assert.deepEqual(await findActiveRequest(db, 7, "receive"), {
    kind: "delivery",
    deliveryId: 32,
    status: "accepted",
  });
});

test("active requests in other categories do not block a new category", async () => {
  const { db } = fixture({
    deliveries: [
      { deliveryId: 41, senderId: 7, deliveryType: "send", status: "pending" },
    ],
  });

  assert.equal(await findActiveRequest(db, 7, "receive"), null);
  assert.equal(await findActiveRequest(db, 7, "ride"), null);
});
