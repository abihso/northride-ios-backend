import { and, desc, eq, inArray } from "drizzle-orm";
import * as schema from "../db/schema.js";

const activeRideStatuses = [
  "pending",
  "searching",
  "confirmed",
  "arrived",
  "in_progress",
];
const activeDeliveryStatuses = [
  "pending",
  "searching",
  "accepted",
  "picked_up",
  "in_transit",
];

export function createCustomerUpcomingHandler({ db }) {
  return async (req, res) => {
    const userId = Number(req.params.userId);
    if (userId !== req.user.userId && req.user.userType !== "admin") {
      return res.status(403).json({
        success: false,
        message: "You cannot view these upcoming trips.",
      });
    }

    try {
      const [rides, deliveries] = await Promise.all([
        db
          .select({
            rideId: schema.rideBookings.rideId,
            rideReference: schema.rideBookings.rideReference,
            rideType: schema.rideBookings.rideType,
            bookingType: schema.rideBookings.bookingType,
            status: schema.rideBookings.status,
            pickupAddress: schema.rideBookings.pickupAddress,
            pickupLatitude: schema.rideBookings.pickupLatitude,
            pickupLongitude: schema.rideBookings.pickupLongitude,
            dropoffAddress: schema.rideBookings.dropoffAddress,
            dropoffLatitude: schema.rideBookings.dropoffLatitude,
            dropoffLongitude: schema.rideBookings.dropoffLongitude,
            estimatedPrice: schema.rideBookings.estimatedPrice,
            actualPrice: schema.rideBookings.actualPrice,
            bookedAt: schema.rideBookings.bookedAt,
            scheduledTime: schema.rideBookings.scheduledTime,
            numberOfPassengers: schema.rideBookings.numberOfPassengers,
            specialRequirements: schema.rideBookings.specialRequirements,
            riderId: schema.rideBookings.riderId,
          })
          .from(schema.rideBookings)
          .where(
            and(
              eq(schema.rideBookings.userId, userId),
              inArray(schema.rideBookings.status, activeRideStatuses),
            ),
          )
          .orderBy(desc(schema.rideBookings.bookedAt))
          .limit(20),
        db
          .select({
            deliveryId: schema.deliveries.deliveryId,
            deliveryReference: schema.deliveries.deliveryReference,
            deliveryType: schema.deliveries.deliveryType,
            status: schema.deliveries.status,
            pickupAddress: schema.deliveries.pickupAddress,
            pickupLatitude: schema.deliveries.pickupLatitude,
            pickupLongitude: schema.deliveries.pickupLongitude,
            dropoffAddress: schema.deliveries.dropoffAddress,
            dropoffLatitude: schema.deliveries.dropoffLatitude,
            dropoffLongitude: schema.deliveries.dropoffLongitude,
            recipientName: schema.deliveries.recipientName,
            packageWeightKg: schema.deliveries.packageWeightKg,
            distanceKm: schema.deliveries.distanceKm,
            deliveryFee: schema.deliveries.deliveryFee,
            totalAmount: schema.deliveries.totalAmount,
            paymentStatus: schema.deliveries.paymentStatus,
            scheduledTime: schema.deliveries.scheduledTime,
            createdAt: schema.deliveries.createdAt,
            updatedAt: schema.deliveries.updatedAt,
            riderId: schema.deliveries.riderId,
          })
          .from(schema.deliveries)
          .where(
            and(
              eq(schema.deliveries.senderId, userId),
              inArray(schema.deliveries.deliveryType, ["send", "receive"]),
              inArray(schema.deliveries.status, activeDeliveryStatuses),
            ),
          )
          .orderBy(desc(schema.deliveries.createdAt))
          .limit(20),
      ]);

      const riderIds = [
        ...new Set(
          [...rides, ...deliveries]
            .map((job) => job.riderId)
            .filter((riderId) => Number.isInteger(riderId)),
        ),
      ];
      const deliveryIds = deliveries.map((delivery) => delivery.deliveryId);

      const [riders, items] = await Promise.all([
        riderIds.length
          ? db
              .select({
                riderId: schema.riders.riderId,
                userId: schema.riders.userId,
                vehicleType: schema.riders.vehicleType,
                vehicleModel: schema.riders.vehicleModel,
                vehicleColor: schema.riders.vehicleColor,
                vehiclePlateNumber: schema.riders.vehiclePlateNumber,
                currentLatitude: schema.riders.currentLatitude,
                currentLongitude: schema.riders.currentLongitude,
                locationUpdatedAt: schema.riders.updatedAt,
              })
              .from(schema.riders)
              .where(inArray(schema.riders.riderId, riderIds))
          : Promise.resolve([]),
        deliveryIds.length
          ? db
              .select({
                itemId: schema.deliveryItems.itemId,
                deliveryId: schema.deliveryItems.deliveryId,
                itemName: schema.deliveryItems.itemName,
                quantity: schema.deliveryItems.quantity,
                description: schema.deliveryItems.description,
              })
              .from(schema.deliveryItems)
              .where(inArray(schema.deliveryItems.deliveryId, deliveryIds))
          : Promise.resolve([]),
      ]);

      const userIds = [...new Set(riders.map((rider) => rider.userId))];
      const riderUsers = userIds.length
        ? await db
            .select({
              userId: schema.users.userId,
              fullName: schema.users.fullName,
              phoneNumber: schema.users.phoneNumber,
              profilePicture: schema.users.profilePicture,
            })
            .from(schema.users)
            .where(inArray(schema.users.userId, userIds))
        : [];
      const usersById = new Map(
        riderUsers.map((riderUser) => [riderUser.userId, riderUser]),
      );
      const ridersById = new Map(
        riders.map((rider) => [
          rider.riderId,
          {
            riderId: rider.riderId,
            ...usersById.get(rider.userId),
            vehicleType: rider.vehicleType,
            vehicleModel: rider.vehicleModel,
            vehicleColor: rider.vehicleColor,
            vehiclePlateNumber: rider.vehiclePlateNumber,
            currentLatitude: rider.currentLatitude,
            currentLongitude: rider.currentLongitude,
            locationUpdatedAt: rider.locationUpdatedAt,
          },
        ]),
      );
      const itemsByDeliveryId = new Map();
      for (const item of items) {
        const deliveryItems = itemsByDeliveryId.get(item.deliveryId) ?? [];
        deliveryItems.push(item);
        itemsByDeliveryId.set(item.deliveryId, deliveryItems);
      }

      return res.json({
        success: true,
        data: {
          rides: rides.map((ride) => ({
            ...ride,
            rider: ride.riderId ? (ridersById.get(ride.riderId) ?? null) : null,
          })),
          deliveries: deliveries.map((delivery) => ({
            ...delivery,
            rider: delivery.riderId
              ? (ridersById.get(delivery.riderId) ?? null)
              : null,
            items: itemsByDeliveryId.get(delivery.deliveryId) ?? [],
          })),
        },
      });
    } catch (error) {
      return res.status(500).json({ success: false, message: error.message });
    }
  };
}
