import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import assert from "node:assert/strict";
import test from "node:test";
import { createRiderDashboardHandler } from "../src/controllers/riderDashboard.js";

const dialect = new PgDialect();

function mockDb(results) {
  const queries = [];
  const offsets = new Map();
  const db = {
    select(selection) {
      return {
        from(table) {
          const tableName = getTableName(table);
          const offset = offsets.get(tableName) ?? 0;
          offsets.set(tableName, offset + 1);
          const result = results[tableName]?.[offset] ?? [];
          const query = {
            where(condition) {
              queries.push({
                tableName,
                selection,
                ...dialect.sqlToQuery(condition),
              });
              return query;
            },
            orderBy() {
              return query;
            },
            limit(limit) {
              return Promise.resolve(result.slice(0, limit));
            },
            then(resolve, reject) {
              return Promise.resolve(result).then(resolve, reject);
            },
          };
          return query;
        },
      };
    },
  };
  return { db, queries };
}

const rider = {
  riderId: 42,
  userId: 7,
  vehicleType: "motorcycle",
  vehicleModel: "Test model",
  vehicleColor: "black",
  vehiclePlateNumber: "NR-123",
  isAvailable: true,
  isApproved: true,
  currentLatitude: "5.60",
  currentLongitude: "-0.18",
  rating: "4.80",
  totalDeliveries: 2,
  totalRides: 3,
  idCardImage: null,
  driverLicenseImage: null,
  vehicleRegistrationImage: null,
  insuranceImage: null,
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

test("dashboard scopes rider data and only selects safe offer fields", async () => {
  const deliveryOffer = {
    deliveryId: 9,
    deliveryReference: "DEL-9",
    pickupContactPhone: "private",
    recipientPhone: "private",
    deliveryPin: "123456",
  };
  const rideOffer = { rideId: 12, rideReference: "RD-12" };
  const { db, queries } = mockDb({
    riders: [[rider]],
    deliveries: [[], [deliveryOffer]],
    ride_bookings: [[], [rideOffer]],
    rider_earnings: [
      [{ totalEarned: "180.50", totalPending: "30", totalPaid: "150.50" }],
    ],
    rider_rejections: [[{ deliveryId: 99, rideId: 88 }]],
  });
  const res = response();

  await createRiderDashboardHandler({ db })(
    { user: { userId: 7 }, params: {} },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.rider.riderId, 42);
  assert.equal(res.body.data.earnings.totalEarned, 180.5);
  assert.deepEqual(res.body.data.offers.deliveries, [deliveryOffer]);
  assert.deepEqual(res.body.data.offers.rides, [rideOffer]);

  const riderQuery = queries.find((query) => query.tableName === "riders");
  assert.ok(riderQuery.params.includes(7));
  const deliveryOfferQuery = queries.find(
    (query) => query.tableName === "deliveries" && query.selection?.deliveryId,
  );
  assert.match(deliveryOfferQuery.sql, /NOT IN/i);
  assert.ok(deliveryOfferQuery.params.includes(99));
  assert.equal("recipientPhone" in deliveryOfferQuery.selection, false);
  assert.equal("pickupContactPhone" in deliveryOfferQuery.selection, false);
  assert.equal("deliveryPin" in deliveryOfferQuery.selection, false);
});

test("offline riders receive no work offers", async () => {
  const { db, queries } = mockDb({
    riders: [[{ ...rider, isAvailable: false }]],
    deliveries: [[]],
    ride_bookings: [[]],
    rider_earnings: [[{ totalEarned: 0, totalPending: 0, totalPaid: 0 }]],
  });
  const res = response();

  await createRiderDashboardHandler({ db })(
    { user: { userId: 7 }, params: {} },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data.offers, { deliveries: [], rides: [] });
  assert.equal(
    queries.some((query) => query.tableName === "rider_rejections"),
    false,
  );
});

test("missing rider profile returns setup guidance", async () => {
  const { db } = mockDb({ riders: [[]] });
  const res = response();

  await createRiderDashboardHandler({ db })(
    { user: { userId: 7 }, params: {} },
    res,
  );

  assert.equal(res.statusCode, 404);
  assert.match(res.body.message, /rider setup/i);
});
