import { and, eq, inArray } from "drizzle-orm";
import * as schema from "../db/schema.js";

const activeRideBookingStatuses = [
  "pending",
  "searching",
  "confirmed",
  "arrived",
  "in_progress",
];
const activeRideDeliveryStatuses = [
  "pending",
  "searching",
  "accepted",
  "picked_up",
  "in_transit",
];

export async function findActiveRequest(db, userId, requestType) {
  const activeDeliveryStatuses = activeRideDeliveryStatuses;
  const [delivery] = await db
    .select({
      deliveryId: schema.deliveries.deliveryId,
      status: schema.deliveries.status,
    })
    .from(schema.deliveries)
    .where(
      and(
        eq(schema.deliveries.senderId, userId),
        eq(schema.deliveries.deliveryType, requestType),
        inArray(schema.deliveries.status, activeDeliveryStatuses),
      ),
    )
    .limit(1);
  if (delivery) return { kind: "delivery", ...delivery };

  if (requestType !== "ride") return null;

  const [rideBooking] = await db
    .select({
      rideId: schema.rideBookings.rideId,
      status: schema.rideBookings.status,
    })
    .from(schema.rideBookings)
    .where(
      and(
        eq(schema.rideBookings.userId, userId),
        inArray(schema.rideBookings.status, activeRideBookingStatuses),
      ),
    )
    .limit(1);
  return rideBooking ? { kind: "ride", ...rideBooking } : null;
}

export const findActiveRideRequest = (db, userId) =>
  findActiveRequest(db, userId, "ride");
