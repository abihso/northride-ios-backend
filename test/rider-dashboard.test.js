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
              if (result instanceof Error) return Promise.reject(result);
              return Promise.resolve(result.slice(0, limit));
            },
            then(resolve, reject) {
              if (result instanceof Error) {
                return Promise.reject(result).then(resolve, reject);
              }
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

test("active assigned rides include the passenger contact details for the rider", async () => {
  const { db } = mockDb({
    riders: [[rider]],
    deliveries: [[]],
    ride_bookings: [[
      {
        rideId: 13,
        userId: 19,
        riderId: rider.riderId,
        status: "confirmed",
      },
    ]],
    rider_earnings: [
      [{ totalEarned: 0, totalPending: 0, totalPaid: 0 }],
    ],
    users: [[
      {
        userId: 19,
        fullName: "Passenger One",
        phoneNumber: "0240000000",
      },
    ]],
  });
  const res = response();

  await createRiderDashboardHandler({ db })(
    { user: { userId: 7 }, params: {} },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data.activeRides[0].customer, {
    fullName: "Passenger One",
    phoneNumber: "0240000000",
  });
});

test("assigned shop orders include their shop and order items", async () => {
  const assignedOrder = {
    orderId: 31,
    riderId: rider.riderId,
    shopId: 5,
    orderReference: "ORD-31",
    status: "ready",
    riderAcceptedAt: null,
    deliveryAddress: "Customer address",
    deliveryLatitude: "5.61",
    deliveryLongitude: "-0.19",
    deliveryFee: "12.50",
    totalAmount: "52.50",
    paymentMethod: "cash",
    paymentStatus: "pending",
    orderPlacedAt: new Date("2026-10-12T10:00:00Z"),
  };
  const item = {
    orderItemId: 4,
    orderId: assignedOrder.orderId,
    productName: "Rice",
    quantity: 2,
  };
  const { db } = mockDb({
    riders: [[rider]],
    rider_preferences: [[]],
    deliveries: [[], []],
    ride_bookings: [[], []],
    orders: [[assignedOrder]],
    order_items: [[item]],
    shops: [[
      {
        shopId: 5,
        shopName: "NorthRide Market",
        pickupAddress: "Market Road",
        pickupLatitude: "5.62",
        pickupLongitude: "-0.17",
      },
    ]],
    rider_earnings: [
      [{ totalEarned: 0, totalPending: 0, totalPaid: 0 }],
    ],
    rider_rejections: [[]],
  });
  const res = response();

  await createRiderDashboardHandler({ db })(
    { user: { userId: 7 }, params: {} },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data.activeOrders, []);
  assert.equal(res.body.data.offers.orders[0].orderId, 31);
  assert.equal(res.body.data.offers.orders[0].shopName, "NorthRide Market");
  assert.equal(res.body.data.offers.orders[0].pickupAddress, "Market Road");
  assert.equal(
    res.body.data.offers.orders[0].items[0].productName,
    "Rice",
  );
});

test("rider offer preferences independently hide offer types", async () => {
  const { db } = mockDb({
    riders: [[rider]],
    rider_preferences: [[
      { receiveRideOffers: true, receiveDeliveryOffers: false },
    ]],
    deliveries: [[], [{ deliveryId: 9 }]],
    ride_bookings: [[], [{ rideId: 12 }]],
    rider_earnings: [
      [{ totalEarned: 0, totalPending: 0, totalPaid: 0 }],
    ],
    rider_rejections: [[]],
  });
  const res = response();

  await createRiderDashboardHandler({ db })(
    { user: { userId: 7 }, params: {} },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data.offers.deliveries, []);
  assert.deepEqual(res.body.data.offers.rides, [{ rideId: 12 }]);
});

test("dashboard uses default offer preferences until the new table migration is applied", async () => {
  const missingPreferencesTable = Object.assign(
    new Error('relation "rider_preferences" does not exist'),
    { code: "42P01" },
  );
  const { db } = mockDb({
    riders: [[rider]],
    rider_preferences: [missingPreferencesTable],
    deliveries: [[], [{ deliveryId: 9 }]],
    ride_bookings: [[], [{ rideId: 12 }]],
    rider_earnings: [
      [{ totalEarned: 0, totalPending: 0, totalPaid: 0 }],
    ],
    rider_rejections: [[]],
  });
  const res = response();

  await createRiderDashboardHandler({ db })(
    { user: { userId: 7 }, params: {} },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data.offers.deliveries, [{ deliveryId: 9 }]);
  assert.deepEqual(res.body.data.offers.rides, [{ rideId: 12 }]);
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
  assert.deepEqual(res.body.data.offers, {
    deliveries: [],
    rides: [],
    orders: [],
  });
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
