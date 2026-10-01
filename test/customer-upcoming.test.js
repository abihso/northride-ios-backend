import { getTableName } from "drizzle-orm";
import assert from "node:assert/strict";
import test from "node:test";
import { createCustomerUpcomingHandler } from "../src/controllers/customerUpcoming.js";

function mockDb(results) {
  let calls = 0;
  const db = {
    select() {
      return {
        from(table) {
          calls += 1;
          const rows = results[getTableName(table)] ?? [];
          const query = {
            where() {
              return query;
            },
            orderBy() {
              return query;
            },
            limit() {
              return Promise.resolve(rows);
            },
            then(resolve, reject) {
              return Promise.resolve(rows).then(resolve, reject);
            },
          };
          return query;
        },
      };
    },
  };
  return {
    db,
    get calls() {
      return calls;
    },
  };
}

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

test("upcoming tracking combines rides, send/receive deliveries, items, and live rider location", async () => {
  const { db } = mockDb({
    ride_bookings: [
      {
        rideId: 5,
        rideReference: "RD-5",
        status: "in_progress",
        riderId: 8,
      },
    ],
    deliveries: [
      {
        deliveryId: 7,
        deliveryReference: "DEL-7",
        deliveryType: "send",
        status: "in_transit",
        riderId: 8,
      },
      {
        deliveryId: 9,
        deliveryReference: "DEL-9",
        deliveryType: "receive",
        status: "accepted",
        riderId: null,
      },
    ],
    riders: [
      {
        riderId: 8,
        userId: 30,
        currentLatitude: "5.6037",
        currentLongitude: "-0.1870",
        vehicleType: "motorcycle",
      },
    ],
    users: [{ userId: 30, fullName: "Rider One", phoneNumber: "0200000000" }],
    delivery_items: [
      { itemId: 12, deliveryId: 7, itemName: "Parcel", quantity: 2 },
    ],
  });
  const res = response();

  await createCustomerUpcomingHandler({ db })(
    { params: { userId: "4" }, user: { userId: 4, userType: "customer" } },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.rides[0].rider.fullName, "Rider One");
  assert.equal(res.body.data.rides[0].rider.currentLatitude, "5.6037");
  assert.equal(res.body.data.deliveries[0].deliveryType, "send");
  assert.equal(res.body.data.deliveries[0].items[0].itemName, "Parcel");
  assert.equal(res.body.data.deliveries[1].deliveryType, "receive");
  assert.equal(res.body.data.deliveries[1].rider, null);
});

test("upcoming tracking returns empty collections when there is no current data", async () => {
  const { db } = mockDb({ ride_bookings: [], deliveries: [] });
  const res = response();

  await createCustomerUpcomingHandler({ db })(
    { params: { userId: "4" }, user: { userId: 4, userType: "customer" } },
    res,
  );

  assert.deepEqual(res.body.data, { rides: [], deliveries: [] });
});

test("upcoming tracking denies requests for another customer's account", async () => {
  const fixture = mockDb({});
  const res = response();

  await createCustomerUpcomingHandler({ db: fixture.db })(
    { params: { userId: "5" }, user: { userId: 4, userType: "customer" } },
    res,
  );

  assert.equal(res.statusCode, 403);
  assert.equal(fixture.calls, 0);
});
