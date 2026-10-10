import { and, desc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import * as schema from "../db/schema.js";

const activeDeliveryStatuses = ["accepted", "picked_up", "in_transit"];
const activeRideStatuses = ["confirmed", "arrived", "in_progress"];
const openStatuses = ["pending", "searching"];

export function createRiderDashboardHandler({ db }) {
  return async (req, res) => {
    try {
      const [rider] = await db
        .select({
          riderId: schema.riders.riderId,
          vehicleType: schema.riders.vehicleType,
          vehicleModel: schema.riders.vehicleModel,
          vehicleColor: schema.riders.vehicleColor,
          vehiclePlateNumber: schema.riders.vehiclePlateNumber,
          bankAccountName: schema.riders.bankAccountName,
          bankAccountNumber: schema.riders.bankAccountNumber,
          bankName: schema.riders.bankName,
          isAvailable: schema.riders.isAvailable,
          isApproved: schema.riders.isApproved,
          currentLatitude: schema.riders.currentLatitude,
          currentLongitude: schema.riders.currentLongitude,
          rating: schema.riders.rating,
          totalDeliveries: schema.riders.totalDeliveries,
          totalRides: schema.riders.totalRides,
          idCardImage: schema.riders.idCardImage,
          driverLicenseImage: schema.riders.driverLicenseImage,
          vehicleRegistrationImage: schema.riders.vehicleRegistrationImage,
          insuranceImage: schema.riders.insuranceImage,
        })
        .from(schema.riders)
        .where(eq(schema.riders.userId, req.user.userId))
        .limit(1);

      if (!rider) {
        return res.status(404).json({
          success: false,
          message: "Complete rider setup to access the dashboard.",
        });
      }

      let savedPreferences;
      try {
        [savedPreferences] = await db
          .select({
            receiveRideOffers: schema.riderPreferences.receiveRideOffers,
            receiveDeliveryOffers:
              schema.riderPreferences.receiveDeliveryOffers,
          })
          .from(schema.riderPreferences)
          .where(eq(schema.riderPreferences.userId, req.user.userId))
          .limit(1);
      } catch (error) {
        if (error.code !== "42P01") throw error;
        console.warn(
          "rider_preferences table is missing; using default offer preferences until migrations are applied.",
        );
      }
      const preferences = savedPreferences ?? {
        receiveRideOffers: true,
        receiveDeliveryOffers: true,
      };

      const [activeDeliveries, activeRides, totals] = await Promise.all([
        db
          .select()
          .from(schema.deliveries)
          .where(
            and(
              eq(schema.deliveries.riderId, rider.riderId),
              inArray(schema.deliveries.status, activeDeliveryStatuses),
            ),
          )
          .orderBy(desc(schema.deliveries.updatedAt))
          .limit(5),
        db
          .select()
          .from(schema.rideBookings)
          .where(
            and(
              eq(schema.rideBookings.riderId, rider.riderId),
              inArray(schema.rideBookings.status, activeRideStatuses),
            ),
          )
          .orderBy(desc(schema.rideBookings.bookedAt))
          .limit(5),
        db
          .select({
            totalEarned: sql`COALESCE(SUM(${schema.riderEarnings.totalEarned}), 0)`,
            totalPending: sql`COALESCE(SUM(CASE WHEN ${schema.riderEarnings.status} = 'pending' THEN ${schema.riderEarnings.totalEarned} ELSE 0 END), 0)`,
            totalPaid: sql`COALESCE(SUM(CASE WHEN ${schema.riderEarnings.status} = 'paid' THEN ${schema.riderEarnings.totalEarned} ELSE 0 END), 0)`,
          })
          .from(schema.riderEarnings)
          .where(eq(schema.riderEarnings.riderId, rider.riderId)),
      ]);

      let deliveryOffers = [];
      let rideOffers = [];
      if (
        rider.isApproved &&
        rider.isAvailable &&
        activeDeliveries.length === 0 &&
        activeRides.length === 0
      ) {
        const rejections = await db
          .select({
            deliveryId: schema.riderRejections.deliveryId,
            rideId: schema.riderRejections.rideId,
          })
          .from(schema.riderRejections)
          .where(eq(schema.riderRejections.riderId, rider.riderId));
        const rejectedDeliveryIds = rejections
          .map((item) => item.deliveryId)
          .filter(Number.isInteger);
        const rejectedRideIds = rejections
          .map((item) => item.rideId)
          .filter(Number.isInteger);

        const deliveryConditions = [
          isNull(schema.deliveries.riderId),
          inArray(schema.deliveries.status, openStatuses),
        ];
        const rideConditions = [
          isNull(schema.rideBookings.riderId),
          inArray(schema.rideBookings.status, openStatuses),
        ];
        if (rejectedDeliveryIds.length) {
          deliveryConditions.push(
            notInArray(schema.deliveries.deliveryId, rejectedDeliveryIds),
          );
        }
        if (rejectedRideIds.length) {
          rideConditions.push(
            notInArray(schema.rideBookings.rideId, rejectedRideIds),
          );
        }

        [deliveryOffers, rideOffers] = await Promise.all([
          preferences.receiveDeliveryOffers
            ? db
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
              packageWeightKg: schema.deliveries.packageWeightKg,
              distanceKm: schema.deliveries.distanceKm,
              deliveryFee: schema.deliveries.deliveryFee,
              totalAmount: schema.deliveries.totalAmount,
              scheduledTime: schema.deliveries.scheduledTime,
              createdAt: schema.deliveries.createdAt,
            })
            .from(schema.deliveries)
            .where(and(...deliveryConditions))
            .orderBy(desc(schema.deliveries.createdAt))
            .limit(20)
            : Promise.resolve([]),
          preferences.receiveRideOffers
            ? db
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
              estimatedDistance: schema.rideBookings.estimatedDistance,
              estimatedDuration: schema.rideBookings.estimatedDuration,
              estimatedPrice: schema.rideBookings.estimatedPrice,
              scheduledTime: schema.rideBookings.scheduledTime,
              numberOfPassengers: schema.rideBookings.numberOfPassengers,
              hasLuggage: schema.rideBookings.hasLuggage,
              hasPets: schema.rideBookings.hasPets,
              requiresWheelchair: schema.rideBookings.requiresWheelchair,
              specialRequirements: schema.rideBookings.specialRequirements,
              bookedAt: schema.rideBookings.bookedAt,
            })
            .from(schema.rideBookings)
            .where(and(...rideConditions))
            .orderBy(desc(schema.rideBookings.bookedAt))
            .limit(20)
            : Promise.resolve([]),
        ]);
      }

      return res.json({
        success: true,
        data: {
          rider,
          activeDeliveries,
          activeRides,
          offers: { deliveries: deliveryOffers, rides: rideOffers },
          earnings: {
            totalEarned: Number(totals[0]?.totalEarned ?? 0),
            totalPending: Number(totals[0]?.totalPending ?? 0),
            totalPaid: Number(totals[0]?.totalPaid ?? 0),
          },
        },
      });
    } catch (error) {
      console.error("Rider dashboard request failed:", error);
      return res.status(500).json({ success: false, message: error.message });
    }
  };
}
