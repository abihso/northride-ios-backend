// src/db/schema.js
import { 
  pgTable, 
  serial, 
  varchar, 
  text, 
  integer, 
  decimal, 
  timestamp, 
  boolean, 
  pgEnum, 
  index,
  unique,
  foreignKey 
} from "drizzle-orm/pg-core";

// =============================================
// ENUMS
// =============================================
export const userTypeEnum = pgEnum("user_type", ["customer", "rider", "admin"]);
export const vehicleTypeEnum = pgEnum("vehicle_type", ["bicycle", "motorcycle", "car", "scooter", "van", "truck"]);
export const rideTypeEnum = pgEnum("ride_type", ["standard", "premium", "shared", "luxury"]);
export const bookingTypeEnum = pgEnum("booking_type", ["now", "scheduled"]);
export const rideStatusEnum = pgEnum("ride_status", ["pending", "searching", "confirmed", "arrived", "in_progress", "completed", "cancelled", "rejected", "no_show"]);
export const paymentMethodEnum = pgEnum("payment_method", ["cash", "card", "wallet", "bank_transfer","paystack"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "paid", "failed", "refunded","paidandwaiting"]);
export const orderTypeEnum = pgEnum("order_type", ["delivery", "pickup", "ride"]);
export const orderStatusEnum = pgEnum("order_status", ["pending", "confirmed", "preparing", "ready", "picked_up", "in_transit", "delivered", "cancelled", "rejected"]);
export const addressTypeEnum = pgEnum("address_type", ["home", "work", "other"]);
export const walletTransactionTypeEnum = pgEnum("wallet_transaction_type", ["deposit", "withdrawal", "payment", "refund", "bonus", "ride_payment"]);
export const notificationTypeEnum = pgEnum("notification_type", ["order", "payment", "delivery", "ride", "system", "promotion"]);
export const dayOfWeekEnum = pgEnum("day_of_week", ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]);
export const supportCategoryEnum = pgEnum("support_category", ["order", "payment", "delivery", "ride", "account", "other"]);
export const priorityEnum = pgEnum("priority", ["low", "medium", "high", "urgent"]);
export const supportStatusEnum = pgEnum("support_status", ["open", "in_progress", "resolved", "closed"]);
export const discountTypeEnum = pgEnum("discount_type", ["percentage", "fixed"]);
export const applicableToEnum = pgEnum("applicable_to", ["delivery", "ride", "both"]);
export const earningTypeEnum = pgEnum("earning_type", ["delivery", "ride", "bonus"]);
export const matchStatusEnum = pgEnum("match_status", ["pending", "accepted", "rejected", "completed"]);
export const paymentTypeEnum = pgEnum("payment_type", ["order", "ride", "delivery", "wallet_topup", "withdrawal"]);
export const deliveryTypeEnum = pgEnum("delivery_type", ["send", "receive","ride"]);
export const deliveryStatusEnum = pgEnum("delivery_status", ["pending", "searching", "accepted", "picked_up", "in_transit", "delivered", "failed", "cancelled"]);

// =============================================
// 1. USERS TABLE
// =============================================
export const users = pgTable("users", {
  userId: serial("user_id").primaryKey(),
  fullName: varchar("full_name", { length: 100 }).default("not set yet"),
  email: varchar("email", { length: 100 }).notNull().unique(),
  phoneNumber: varchar("phone_number", { length: 20 }).default("not set yet"),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  profilePicture: varchar("profile_picture", { length: 255 }).default("not set yet"),
  userType: userTypeEnum("user_type").default("customer"),
  riderOnboardingCompleted: boolean("rider_onboarding_completed").notNull().default(false),
  isVerified: boolean("is_verified").default(false),
  disableNotifications: boolean("disableNotifications").default(false),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()),
  lastLogin: timestamp("last_login", { withTimezone: true }),
}, (table) => ({
  users_email_idx: index("users_email_idx").on(table.email),
  users_phone_idx: index("users_phone_idx").on(table.phoneNumber),
  users_user_type_idx: index("users_user_type_idx").on(table.userType),
}));

// USER SYSTEM CONFIG
// =============================================
export const userSystemConfig = pgTable("User_system_config", {
  configId: serial("config_id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => users.userId, { onDelete: "cascade" }),
  configKey: varchar("config_key", { length: 50 }).notNull().unique(),
  configValue: text("config_value"),
  isEditable: boolean("is_editable").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date())
}, (table) => ({
  user_config_key_idx: index("user_config_key_idx").on(table.configKey),
  // config_group_idx: index("config_group_idx").on(table.configGroup),
}));

export const riderPreferences = pgTable("rider_preferences", {
  preferenceId: serial("preference_id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => users.userId, { onDelete: "cascade" }),
  receiveRideOffers: boolean("receive_ride_offers").notNull().default(true),
  receiveDeliveryOffers: boolean("receive_delivery_offers").notNull().default(true),
  receiveRideUpdates: boolean("receive_ride_updates").notNull().default(true),
  receiveDeliveryUpdates: boolean("receive_delivery_updates").notNull().default(true),
  receivePaymentUpdates: boolean("receive_payment_updates").notNull().default(true),
  receiveAccountUpdates: boolean("receive_account_updates").notNull().default(true),
  preferredContactMethod: varchar("preferred_contact_method", { length: 20 }).notNull().default("email"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()),
});

// =============================================
// 2. RIDERS TABLE
// =============================================
export const riders = pgTable("riders", {
  riderId: serial("rider_id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => users.userId, { onDelete: "cascade" }),
  vehicleType: vehicleTypeEnum("vehicle_type").notNull(),
  vehiclePlateNumber: varchar("vehicle_plate_number", { length: 20 }),
  vehicleModel: varchar("vehicle_model", { length: 50 }),
  vehicleColor: varchar("vehicle_color", { length: 30 }),
  licenseNumber: varchar("license_number", { length: 50 }),
  isAvailable: boolean("is_available").default(true),
  isApproved: boolean("is_approved").default(false),
  currentLatitude: decimal("current_latitude", { precision: 10, scale: 8 }),
  currentLongitude: decimal("current_longitude", { precision: 11, scale: 8 }),
  rating: decimal("rating", { precision: 3, scale: 2 }).default("0.00"),
  totalDeliveries: integer("total_deliveries").default(0),
  totalRides: integer("total_rides").default(0),
  earningBalance: decimal("earning_balance", { precision: 10, scale: 2 }).default("0.00"),
  bankAccountName: varchar("bank_account_name", { length: 100 }),
  bankAccountNumber: varchar("bank_account_number", { length: 50 }),
  bankName: varchar("bank_name", { length: 50 }),
  idCardImage: varchar("id_card_image", { length: 255 }),
  driverLicenseImage: varchar("driver_license_image", { length: 255 }),
  vehicleRegistrationImage: varchar("vehicle_registration_image", { length: 255 }),
  insuranceImage: varchar("insurance_image", { length: 255 }),
  maxPassengers: integer("max_passengers").default(1),
  hasAirConditioning: boolean("has_air_conditioning").default(false),
  hasWifi: boolean("has_wifi").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  riders_availability_idx: index("riders_availability_idx").on(table.isAvailable),
  riders_location_idx: index("riders_location_idx").on(table.currentLatitude, table.currentLongitude),
  riders_approved_idx: index("riders_approved_idx").on(table.isApproved),
  riders_vehicle_type_idx: index("riders_vehicle_type_idx").on(table.vehicleType),
}));

export const riderDocuments = pgTable("rider_documents", {
  documentId: serial("document_id").primaryKey(),
  riderId: integer("rider_id").notNull().references(() => riders.riderId, { onDelete: "cascade" }),
  documentType: varchar("document_type", { length: 40 }).notNull(),
  storageKey: varchar("storage_key", { length: 512 }).notNull().unique(),
  contentType: varchar("content_type", { length: 40 }).notNull(),
  fileSize: integer("file_size").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  rider_documents_type_unique: unique("rider_documents_type_unique").on(table.riderId, table.documentType),
  rider_documents_rider_idx: index("rider_documents_rider_idx").on(table.riderId),
}));

// =============================================
// 3. SHOPS TABLE
// =============================================
export const shops = pgTable("shops", {
  shopId: serial("shop_id").primaryKey(),
  ownerId: integer("owner_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
  shopName: varchar("shop_name", { length: 100 }).notNull(),
  shopDescription: text("shop_description"),
  shopCategory: varchar("shop_category", { length: 50 }),
  address: varchar("address", { length: 255 }).notNull(),
  city: varchar("city", { length: 50 }),
  state: varchar("state", { length: 50 }),
  country: varchar("country", { length: 50 }),
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  phoneNumber: varchar("phone_number", { length: 20 }),
  email: varchar("email", { length: 100 }),
  logo: varchar("logo", { length: 255 }),
  coverImage: varchar("cover_image", { length: 255 }),
  isOpen: boolean("is_open").default(true),
  isVerified: boolean("is_verified").default(false),
  rating: decimal("rating", { precision: 3, scale: 2 }).default("0.00"),
  openingTime: timestamp("opening_time", { withTimezone: true }),
  closingTime: timestamp("closing_time", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  shops_location_idx: index("shops_location_idx").on(table.latitude, table.longitude),
  shops_open_status_idx: index("shops_open_status_idx").on(table.isOpen),
  shops_verified_idx: index("shops_verified_idx").on(table.isVerified),
}));

// =============================================
// 4. PRODUCTS TABLE
// =============================================
export const products = pgTable("products", {
  productId: serial("product_id").primaryKey(),
  shopId: integer("shop_id").notNull().references(() => shops.shopId, { onDelete: "cascade" }),
  productName: varchar("product_name", { length: 100 }).notNull(),
  productDescription: text("product_description"),
  category: varchar("category", { length: 50 }),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  discountPrice: decimal("discount_price", { precision: 10, scale: 2 }),
  stockQuantity: integer("stock_quantity").default(0),
  unit: varchar("unit", { length: 20 }).default("piece"),
  imageUrl: varchar("image_url", { length: 255 }),
  isAvailable: boolean("is_available").default(true),
  isFeatured: boolean("is_featured").default(false),
  preparationTime: integer("preparation_time").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  products_shop_idx: index("products_shop_idx").on(table.shopId),
  products_availability_idx: index("products_availability_idx").on(table.isAvailable),
  products_category_idx: index("products_category_idx").on(table.category),
}));

// =============================================
// 5. RIDE BOOKINGS TABLE
// =============================================
export const rideBookings = pgTable("ride_bookings", {
  rideId: serial("ride_id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
  riderId: integer("rider_id").references(() => riders.riderId, { onDelete: "set null" }),
  rideReference: varchar("ride_reference", { length: 50 }).notNull().unique(),
  rideType: rideTypeEnum("ride_type").default("standard"),
  bookingType: bookingTypeEnum("booking_type").default("now"),
  pickupAddress: varchar("pickup_address", { length: 255 }).notNull(),
  pickupLatitude: decimal("pickup_latitude", { precision: 10, scale: 8 }).notNull(),
  pickupLongitude: decimal("pickup_longitude", { precision: 11, scale: 8 }).notNull(),
  pickupLandmark: varchar("pickup_landmark", { length: 100 }),
  dropoffAddress: varchar("dropoff_address", { length: 255 }).notNull(),
  dropoffLatitude: decimal("dropoff_latitude", { precision: 10, scale: 8 }).notNull(),
  dropoffLongitude: decimal("dropoff_longitude", { precision: 11, scale: 8 }).notNull(),
  dropoffLandmark: varchar("dropoff_landmark", { length: 100 }),
  estimatedDistance: decimal("estimated_distance", { precision: 10, scale: 2 }),
  estimatedDuration: integer("estimated_duration"),
  estimatedPrice: decimal("estimated_price", { precision: 10, scale: 2 }),
  actualPrice: decimal("actual_price", { precision: 10, scale: 2 }),
  surgeMultiplier: decimal("surge_multiplier", { precision: 3, scale: 2 }).default("1.00"),
  baseFare: decimal("base_fare", { precision: 10, scale: 2 }).default("0.00"),
  distanceFare: decimal("distance_fare", { precision: 10, scale: 2 }).default("0.00"),
  timeFare: decimal("time_fare", { precision: 10, scale: 2 }).default("0.00"),
  tollCharges: decimal("toll_charges", { precision: 10, scale: 2 }).default("0.00"),
  waitingCharges: decimal("waiting_charges", { precision: 10, scale: 2 }).default("0.00"),
  cancellationFee: decimal("cancellation_fee", { precision: 10, scale: 2 }).default("0.00"),
  numberOfPassengers: integer("number_of_passengers").default(1),
  hasLuggage: boolean("has_luggage").default(false),
  hasPets: boolean("has_pets").default(false),
  requiresWheelchair: boolean("requires_wheelchair").default(false),
  specialRequirements: text("special_requirements"),
  status: rideStatusEnum("status").default("pending"),
  cancellationReason: text("cancellation_reason"),
  cancelledBy: varchar("cancelled_by", { length: 20 }),
  paymentMethod: paymentMethodEnum("payment_method").notNull(), 
  paymentStatus: paymentStatusEnum("payment_status").default("pending"),
  paymentReference: varchar("payment_reference", { length: 100 }),
  bookedAt: timestamp("booked_at", { withTimezone: true }).defaultNow(),
  scheduledTime: timestamp("scheduled_time", { withTimezone: true }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  riderArrivedAt: timestamp("rider_arrived_at", { withTimezone: true }),
  rideStartedAt: timestamp("ride_started_at", { withTimezone: true }),
  rideCompletedAt: timestamp("ride_completed_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  riderRating: integer("rider_rating"),
  riderReview: text("rider_review"),
  passengerRating: integer("passenger_rating"),
  passengerReview: text("passenger_review"),
  routePolyline: text("route_polyline"),
  actualDistance: decimal("actual_distance", { precision: 10, scale: 2 }),
  actualDuration: integer("actual_duration"),
}, (table) => ({
  bookings_user_idx: index("bookings_user_idx").on(table.userId),
  bookings_rider_idx: index("bookings_rider_idx").on(table.riderId),
  bookings_status_idx: index("bookings_status_idx").on(table.status),
  bookings_reference_idx: index("bookings_reference_idx").on(table.rideReference),
  bookings_booking_type_idx: index("bookings_booking_type_idx").on(table.bookingType),
  bookings_scheduled_idx: index("bookings_scheduled_idx").on(table.scheduledTime),
  bookings_location_idx: index("bookings_location_idx").on(table.pickupLatitude, table.pickupLongitude, table.dropoffLatitude, table.dropoffLongitude),
  bookings_date_idx: index("bookings_date_idx").on(table.bookedAt),
}));

// =============================================
// 6. ORDERS TABLE
// =============================================
export const orders = pgTable("orders", {
  orderId: serial("order_id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
  shopId: integer("shop_id").notNull().references(() => shops.shopId, { onDelete: "cascade" }),
  riderId: integer("rider_id").references(() => riders.riderId, { onDelete: "set null" }),
  orderReference: varchar("order_reference", { length: 50 }).notNull().unique(),
  orderType: orderTypeEnum("order_type").default("delivery"),
  status: orderStatusEnum("status").default("pending"),
  paymentMethod: paymentMethodEnum("payment_method").notNull(),
  paymentStatus: paymentStatusEnum("payment_status").default("pending"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  deliveryFee: decimal("delivery_fee", { precision: 10, scale: 2 }).default("0.00"),
  serviceCharge: decimal("service_charge", { precision: 10, scale: 2 }).default("0.00"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).default("0.00"),
  tipAmount: decimal("tip_amount", { precision: 10, scale: 2 }).default("0.00"),
  deliveryAddress: varchar("delivery_address", { length: 255 }),
  deliveryLatitude: decimal("delivery_latitude", { precision: 10, scale: 8 }),
  deliveryLongitude: decimal("delivery_longitude", { precision: 11, scale: 8 }),
  deliveryInstructions: text("delivery_instructions"),
  pickupLatitude: decimal("pickup_latitude", { precision: 10, scale: 8 }),
  pickupLongitude: decimal("pickup_longitude", { precision: 11, scale: 8 }),
  estimatedDeliveryTime: integer("estimated_delivery_time"),
  actualDeliveryTime: integer("actual_delivery_time"),
  orderPlacedAt: timestamp("order_placed_at", { withTimezone: true }).defaultNow(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  preparingAt: timestamp("preparing_at", { withTimezone: true }),
  readyAt: timestamp("ready_at", { withTimezone: true }),
  pickedUpAt: timestamp("picked_up_at", { withTimezone: true }),
  inTransitAt: timestamp("in_transit_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  customerRating: integer("customer_rating"),
  customerReview: text("customer_review"),
  riderRating: integer("rider_rating"),
  riderReview: text("rider_review"),
  rideId: integer("ride_id").references(() => rideBookings.rideId, { onDelete: "set null" }),
}, (table) => ({
  orders_user_idx: index("orders_user_idx").on(table.userId),
  orders_shop_idx: index("orders_shop_idx").on(table.shopId),
  orders_rider_idx: index("orders_rider_idx").on(table.riderId),
  orders_status_idx: index("orders_status_idx").on(table.status),
  orders_reference_idx: index("orders_reference_idx").on(table.orderReference),
  orders_date_idx: index("orders_date_idx").on(table.orderPlacedAt),
  orders_ride_idx: index("orders_ride_idx").on(table.rideId),
}));

// =============================================
// 7. DELIVERIES TABLE (Parcel / Custom Courier Requests)
// =============================================
export const deliveries = pgTable("deliveries", {
  deliveryId: serial("delivery_id").primaryKey(),
  senderId: integer("sender_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
  riderId: integer("rider_id").references(() => riders.riderId, { onDelete: "set null" }),
  orderId: integer("order_id").references(() => orders.orderId, { onDelete: "set null" }),
  deliveryReference: varchar("delivery_reference", { length: 50 }).notNull().unique(),
  deliveryType: deliveryTypeEnum("delivery_type").default("send"),
  status: deliveryStatusEnum("status").default("pending"),
  
  // Pickup Details
  pickupAddress: varchar("pickup_address", { length: 255 }).notNull(),
  pickupLatitude: decimal("pickup_latitude", { precision: 10, scale: 8 }).notNull(),
  pickupLongitude: decimal("pickup_longitude", { precision: 11, scale: 8 }).notNull(),
  pickupContactName: varchar("pickup_contact_name", { length: 100 }),
  pickupContactPhone: varchar("pickup_contact_phone", { length: 20 }),
  pickupInstructions: text("pickup_instructions"),

  // Dropoff Details
  dropoffAddress: varchar("dropoff_address", { length: 255 }).notNull(),
  dropoffLatitude: decimal("dropoff_latitude", { precision: 10, scale: 8 }).notNull(),
  dropoffLongitude: decimal("dropoff_longitude", { precision: 11, scale: 8 }).notNull(),
  recipientName: varchar("recipient_name", { length: 100 }).notNull(),
  recipientPhone: varchar("recipient_phone", { length: 20 }).notNull(),
  dropoffInstructions: text("dropoff_instructions"),

  // Package Specifications & Security
  packageWeightKg: decimal("package_weight_kg", { precision: 5, scale: 2 }),
  isFragile: boolean("is_fragile").default(false),
  deliveryPin: varchar("delivery_pin", { length: 6 }),
  proofOfDeliveryImage: varchar("proof_of_delivery_image", { length: 255 }),

  // Financials
  distanceKm: decimal("distance_km", { precision: 10, scale: 2 }),
  deliveryFee: decimal("delivery_fee", { precision: 10, scale: 2 }).notNull(),
  tipAmount: decimal("tip_amount", { precision: 10, scale: 2 }).default("0.00"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  paymentMethod: paymentMethodEnum("payment_method").notNull(),
  paymentStatus: paymentStatusEnum("payment_status").default("pending"),

  // Timestamps
  scheduledTime: timestamp("scheduled_time", { withTimezone: true }),
  pickedUpAt: timestamp("picked_up_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  deliveries_sender_idx: index("deliveries_sender_idx").on(table.senderId),
  deliveries_rider_idx: index("deliveries_rider_idx").on(table.riderId),
  deliveries_status_idx: index("deliveries_status_idx").on(table.status),
  deliveries_reference_idx: index("deliveries_reference_idx").on(table.deliveryReference),
}));

// =============================================
// 8. DELIVERY ITEMS TABLE
// =============================================
export const deliveryItems = pgTable("delivery_items", {
  itemId: serial("item_id").primaryKey(),
  deliveryId: integer("delivery_id").notNull().references(() => deliveries.deliveryId, { onDelete: "cascade" }),
  itemName: varchar("item_name", { length: 100 }).notNull(),
  quantity: integer("quantity").default(1),
  estimatedValue: decimal("estimated_value", { precision: 10, scale: 2 }),
  description: text("description"),
}, (table) => ({
  delivery_items_delivery_idx: index("delivery_items_delivery_idx").on(table.deliveryId),
}));

// =============================================
// 9. RIDE PRICING TABLE
// =============================================
export const ridePricing = pgTable("ride_pricing", {
  pricingId: serial("pricing_id").primaryKey(),
  rideType: rideTypeEnum("ride_type").notNull(),
  vehicleType: varchar("vehicle_type", { length: 20 }),
  baseFare: decimal("base_fare", { precision: 10, scale: 2 }).notNull(),
  pricePerKm: decimal("price_per_km", { precision: 10, scale: 2 }).notNull(),
  pricePerMinute: decimal("price_per_minute", { precision: 10, scale: 2 }).notNull(),
  minimumFare: decimal("minimum_fare", { precision: 10, scale: 2 }).notNull(),
  cancellationFee: decimal("cancellation_fee", { precision: 10, scale: 2 }).default("0.00"),
  waitingFeePerMinute: decimal("waiting_fee_per_minute", { precision: 10, scale: 2 }).default("0.00"),
  surgeMultiplierMin: decimal("surge_multiplier_min", { precision: 3, scale: 2 }).default("1.00"),
  surgeMultiplierMax: decimal("surge_multiplier_max", { precision: 3, scale: 2 }).default("3.00"),
  isActive: boolean("is_active").default(true),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).defaultNow(),
  effectiveTo: timestamp("effective_to", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  pricing_ride_type_idx: index("pricing_ride_type_idx").on(table.rideType),
  pricing_active_idx: index("pricing_active_idx").on(table.isActive),
  pricing_effective_idx: index("pricing_effective_idx").on(table.effectiveFrom, table.effectiveTo),
}));

// =============================================
// 10. RIDER EARNINGS TABLE
// =============================================
export const riderEarnings = pgTable("rider_earnings", {
  earningId: serial("earning_id").primaryKey(),
  riderId: integer("rider_id").notNull().references(() => riders.riderId, { onDelete: "cascade" }),
  orderId: integer("order_id").references(() => orders.orderId, { onDelete: "cascade" }),
  rideId: integer("ride_id").references(() => rideBookings.rideId, { onDelete: "cascade" }),
  deliveryId: integer("delivery_id").references(() => deliveries.deliveryId, { onDelete: "cascade" }),
  deliveryFee: decimal("delivery_fee", { precision: 10, scale: 2 }).default("0.00"),
  rideFare: decimal("ride_fare", { precision: 10, scale: 2 }).default("0.00"),
  tipAmount: decimal("tip_amount", { precision: 10, scale: 2 }).default("0.00"),
  bonusAmount: decimal("bonus_amount", { precision: 10, scale: 2 }).default("0.00"),
  totalEarned: decimal("total_earned", { precision: 10, scale: 2 }).notNull(),
  earningType: earningTypeEnum("earning_type").default("delivery"),
  status: varchar("status", { length: 20 }).default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
}, (table) => ({
  earnings_rider_idx: index("earnings_rider_idx").on(table.riderId),
  earnings_order_idx: index("earnings_order_idx").on(table.orderId),
  earnings_ride_idx: index("earnings_ride_idx").on(table.rideId),
  earnings_delivery_idx: index("earnings_delivery_idx").on(table.deliveryId),
  earnings_status_idx: index("earnings_status_idx").on(table.status),
  earnings_type_idx: index("earnings_type_idx").on(table.earningType),
}));

// =============================================
// 11. USER ADDRESSES TABLE
// =============================================
export const userAddresses = pgTable("user_addresses", {
  addressId: serial("address_id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
  addressLabel: varchar("address_label", { length: 50 }).default("Home"),
  addressLine1: varchar("address_line1", { length: 255 }).notNull(),
  addressLine2: varchar("address_line2", { length: 255 }),
  city: varchar("city", { length: 50 }),
  state: varchar("state", { length: 50 }),
  country: varchar("country", { length: 50 }),
  postalCode: varchar("postal_code", { length: 20 }),
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  phoneNumber: varchar("phone_number", { length: 20 }),
  isDefault: boolean("is_default").default(false),
  addressType: addressTypeEnum("address_type").default("home"),
  deliveryInstructions: text("delivery_instructions"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  addresses_user_idx: index("addresses_user_idx").on(table.userId),
  addresses_default_idx: index("addresses_default_idx").on(table.isDefault),
  addresses_type_idx: index("addresses_type_idx").on(table.addressType),
}));

// =============================================
// 12. WALLETS TABLE
// =============================================
export const wallets = pgTable("wallets", {
  walletId: serial("wallet_id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => users.userId, { onDelete: "cascade" }),
  balance: decimal("balance", { precision: 10, scale: 2 }).default("0.00"),
  totalDeposits: decimal("total_deposits", { precision: 10, scale: 2 }).default("0.00"),
  totalWithdrawals: decimal("total_withdrawals", { precision: 10, scale: 2 }).default("0.00"),
  lastTransactionAt: timestamp("last_transaction_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  wallets_user_idx: index("wallets_user_idx").on(table.userId),
}));

// =============================================
// 13. WALLET TRANSACTIONS
// =============================================
export const walletTransactions = pgTable("wallet_transactions", {
  transactionId: serial("transaction_id").primaryKey(),
  walletId: integer("wallet_id").notNull().references(() => wallets.walletId, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
  transactionType: walletTransactionTypeEnum("transaction_type").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  balanceAfter: decimal("balance_after", { precision: 10, scale: 2 }).notNull(),
  description: text("description"),
  reference: varchar("reference", { length: 100 }).unique(),
  orderId: integer("order_id").references(() => orders.orderId, { onDelete: "set null" }),
  rideId: integer("ride_id").references(() => rideBookings.rideId, { onDelete: "set null" }),
  deliveryId: integer("delivery_id").references(() => deliveries.deliveryId, { onDelete: "set null" }),
  status: varchar("status", { length: 20 }).default("completed"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  transactions_wallet_idx: index("transactions_wallet_idx").on(table.walletId),
  transactions_user_idx: index("transactions_user_idx").on(table.userId),
  transactions_reference_idx: index("transactions_reference_idx").on(table.reference),
  transactions_order_idx: index("transactions_order_idx").on(table.orderId),
  transactions_ride_idx: index("transactions_ride_idx").on(table.rideId),
  transactions_delivery_idx: index("transactions_delivery_idx").on(table.deliveryId),
}));

// =============================================
// 14. RIDER REJECTIONS
// =============================================
export const riderRejections = pgTable("rider_rejections", {
  rejectionId: serial("rejection_id").primaryKey(),
  orderId: integer("order_id").references(() => orders.orderId, { onDelete: "cascade" }),
  rideId: integer("ride_id").references(() => rideBookings.rideId, { onDelete: "cascade" }),
  deliveryId: integer("delivery_id").references(() => deliveries.deliveryId, { onDelete: "cascade" }),
  riderId: integer("rider_id").notNull().references(() => riders.riderId, { onDelete: "cascade" }),
  reason: text("reason"),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  rejections_order_idx: index("rejections_order_idx").on(table.orderId),
  rejections_ride_idx: index("rejections_ride_idx").on(table.rideId),
  rejections_delivery_idx: index("rejections_delivery_idx").on(table.deliveryId),
  rejections_rider_idx: index("rejections_rider_idx").on(table.riderId),
}));

// =============================================
// 15. RIDE ANALYTICS
// =============================================
export const rideAnalytics = pgTable("ride_analytics", {
  analyticsId: serial("analytics_id").primaryKey(),
  rideId: integer("ride_id").notNull().references(() => rideBookings.rideId, { onDelete: "cascade" }),
  riderId: integer("rider_id").notNull().references(() => riders.riderId, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
  bookingToArrivalTime: integer("booking_to_arrival_time"),
  arrivalToStartTime: integer("arrival_to_start_time"),
  startToCompletionTime: integer("start_to_completion_time"),
  totalTripTime: integer("total_trip_time"),
  distanceTraveled: decimal("distance_traveled", { precision: 10, scale: 2 }),
  averageSpeed: decimal("average_speed", { precision: 5, scale: 2 }),
  idleTime: integer("idle_time"),
  routeEfficiency: decimal("route_efficiency", { precision: 5, scale: 2 }),
  dataUsageMb: decimal("data_usage_mb", { precision: 10, scale: 2 }),
  batteryUsagePercentage: decimal("battery_usage_percentage", { precision: 5, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  analytics_ride_idx: index("analytics_ride_idx").on(table.rideId),
  analytics_rider_idx: index("analytics_rider_idx").on(table.riderId),
  analytics_user_idx: index("analytics_user_idx").on(table.userId),
}));

// =============================================
// 16. RIDE SHARE MATCHES
// =============================================
export const rideShareMatches = pgTable("ride_share_matches", {
  matchId: serial("match_id").primaryKey(),
  primaryRideId: integer("primary_ride_id").notNull().references(() => rideBookings.rideId, { onDelete: "cascade" }),
  secondaryRideId: integer("secondary_ride_id").notNull().references(() => rideBookings.rideId, { onDelete: "cascade" }),
  riderId: integer("rider_id").notNull().references(() => riders.riderId, { onDelete: "cascade" }),
  matchStatus: matchStatusEnum("match_status").default("pending"),
  matchScore: decimal("match_score", { precision: 5, scale: 2 }),
  matchedAt: timestamp("matched_at", { withTimezone: true }).defaultNow(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => ({
  matches_primary_idx: index("matches_primary_idx").on(table.primaryRideId),
  matches_secondary_idx: index("matches_secondary_idx").on(table.secondaryRideId),
  matches_rider_idx: index("matches_rider_idx").on(table.riderId),
  matches_status_idx: index("matches_status_idx").on(table.matchStatus),
}));

// =============================================
// 17. NOTIFICATIONS
// =============================================
export const notifications = pgTable("notifications", {
  notificationId: serial("notification_id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
  title: varchar("title", { length: 100 }).notNull(),
  message: text("message").notNull(),
  type: notificationTypeEnum("type").default("system"),
  isRead: boolean("is_read").default(false),
  isClicked: boolean("is_clicked").default(false),
  referenceId: integer("reference_id"),
  referenceType: varchar("reference_type", { length: 50 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  readAt: timestamp("read_at", { withTimezone: true }),
}, (table) => ({
  notifications_user_idx: index("notifications_user_idx").on(table.userId),
  notifications_read_idx: index("notifications_read_idx").on(table.isRead),
  notifications_type_idx: index("notifications_type_idx").on(table.type),
  notifications_reference_idx: index("notifications_reference_idx").on(table.referenceId, table.referenceType),
}));

// =============================================
// 18. SUPPORT TICKETS
// =============================================
export const supportTickets = pgTable("support_tickets", {
  ticketId: serial("ticket_id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
  subject: varchar("subject", { length: 100 }).notNull(),
  message: text("message").notNull(),
  category: supportCategoryEnum("category").default("other"),
  contactMethod: varchar("contact_method", { length: 20 }),
  priority: priorityEnum("priority").default("medium"),
  status: supportStatusEnum("status").default("open"),
  assignedTo: integer("assigned_to").references(() => users.userId, { onDelete: "set null" }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  tickets_user_idx: index("tickets_user_idx").on(table.userId),
  tickets_status_idx: index("tickets_status_idx").on(table.status),
  tickets_assigned_idx: index("tickets_assigned_idx").on(table.assignedTo),
  tickets_category_idx: index("tickets_category_idx").on(table.category),
}));

// =============================================
// 19. PROMOTIONS
// =============================================
export const promotions = pgTable("promotions", {
  promotionId: serial("promotion_id").primaryKey(),
  shopId: integer("shop_id").references(() => shops.shopId, { onDelete: "cascade" }),
  promoCode: varchar("promo_code", { length: 50 }).notNull().unique(),
  title: varchar("title", { length: 100 }).notNull(),
  description: text("description"),
  discountType: discountTypeEnum("discount_type").notNull(),
  discountValue: decimal("discount_value", { precision: 10, scale: 2 }).notNull(),
  minimumOrderAmount: decimal("minimum_order_amount", { precision: 10, scale: 2 }),
  maximumDiscount: decimal("maximum_discount", { precision: 10, scale: 2 }),
  applicableTo: applicableToEnum("applicable_to").default("both"),
  startDate: timestamp("start_date", { withTimezone: true }).notNull(),
  endDate: timestamp("end_date", { withTimezone: true }).notNull(),
  usageLimit: integer("usage_limit"),
  usedCount: integer("used_count").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  promotions_code_idx: index("promotions_code_idx").on(table.promoCode),
  promotions_active_idx: index("promotions_active_idx").on(table.isActive),
  promotions_date_idx: index("promotions_date_idx").on(table.startDate, table.endDate),
}));

// =============================================
// 20. RIDE BOOKING WAYPOINTS
// =============================================
export const rideBookingWaypoints = pgTable("ride_booking_waypoints", {
  waypointId: serial("waypoint_id").primaryKey(),
  rideId: integer("ride_id").notNull().references(() => rideBookings.rideId, { onDelete: "cascade" }),
  stopOrder: integer("stop_order").notNull(),
  address: varchar("address", { length: 255 }).notNull(),
  latitude: decimal("latitude", { precision: 10, scale: 8 }).notNull(),
  longitude: decimal("longitude", { precision: 11, scale: 8 }).notNull(),
  instructions: text("instructions"),
  estimatedArrivalTime: timestamp("estimated_arrival_time", { withTimezone: true }),
  actualArrivalTime: timestamp("actual_arrival_time", { withTimezone: true }),
  durationAtStop: integer("duration_at_stop").default(0),
}, (table) => ({
  waypoints_ride_idx: index("waypoints_ride_idx").on(table.rideId),
  waypoints_stop_order_idx: index("waypoints_stop_order_idx").on(table.stopOrder),
}));

// =============================================
// 21. USED PROMOTIONS
// =============================================
export const usedPromotions = pgTable("used_promotions", {
  usedPromoId: serial("used_promo_id").primaryKey(),
  promotionId: integer("promotion_id").notNull().references(() => promotions.promotionId, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.userId, { onDelete: "cascade" }),
  orderId: integer("order_id").references(() => orders.orderId, { onDelete: "cascade" }),
  rideId: integer("ride_id").references(() => rideBookings.rideId, { onDelete: "cascade" }),
  deliveryId: integer("delivery_id").references(() => deliveries.deliveryId, { onDelete: "cascade" }),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  used_promotions_promo_idx: index("used_promotions_promo_idx").on(table.promotionId),
  used_promotions_user_idx: index("used_promotions_user_idx").on(table.userId),
  used_promotions_order_idx: index("used_promotions_order_idx").on(table.orderId),
  used_promotions_ride_idx: index("used_promotions_ride_idx").on(table.rideId),
  used_promotions_delivery_idx: index("used_promotions_delivery_idx").on(table.deliveryId),
}));

// =============================================
// 22. RIDER SCHEDULES
// =============================================
export const riderSchedules = pgTable("rider_schedules", {
  scheduleId: serial("schedule_id").primaryKey(),
  riderId: integer("rider_id").notNull().references(() => riders.riderId, { onDelete: "cascade" }),
  dayOfWeek: dayOfWeekEnum("day_of_week").notNull(),
  startTime: timestamp("start_time", { withTimezone: true }).notNull(),
  endTime: timestamp("end_time", { withTimezone: true }).notNull(),
  isAvailable: boolean("is_available").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  schedules_rider_idx: index("schedules_rider_idx").on(table.riderId),
  schedules_day_idx: index("schedules_day_idx").on(table.dayOfWeek),
  schedules_unique_rider_day: unique("schedules_unique_rider_day").on(table.riderId, table.dayOfWeek),
}));

// =============================================
// 23. RIDER LOCATIONS
// =============================================
export const riderLocations = pgTable("rider_locations", {
  locationId: serial("location_id").primaryKey(),
  riderId: integer("rider_id").notNull().references(() => riders.riderId, { onDelete: "cascade" }),
  latitude: decimal("latitude", { precision: 10, scale: 8 }).notNull(),
  longitude: decimal("longitude", { precision: 11, scale: 8 }).notNull(),
  accuracy: decimal("accuracy", { precision: 10, scale: 2 }),
  speed: decimal("speed", { precision: 10, scale: 2 }),
  heading: decimal("heading", { precision: 10, scale: 2 }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  locations_rider_idx: index("locations_rider_idx").on(table.riderId),
  locations_date_idx: index("locations_date_idx").on(table.createdAt),
}));

// =============================================
// 24. SYSTEM CONFIG
// =============================================
export const systemConfig = pgTable("system_config", {
  configId: serial("config_id").primaryKey(),
  configKey: varchar("config_key", { length: 50 }).notNull().unique(),
  configValue: text("config_value"),
  configGroup: varchar("config_group", { length: 50 }),
  description: text("description"),
  isEditable: boolean("is_editable").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  config_key_idx: index("config_key_idx").on(table.configKey),
  config_group_idx: index("config_group_idx").on(table.configGroup),
}));

// =============================================
// 25. RIDE FARE BREAKDOWN
// =============================================
export const rideFareBreakdown = pgTable("ride_fare_breakdown", {
  breakdownId: serial("breakdown_id").primaryKey(),
  rideId: integer("ride_id").notNull().references(() => rideBookings.rideId, { onDelete: "cascade" }),
  baseFare: decimal("base_fare", { precision: 10, scale: 2 }),
  distanceFare: decimal("distance_fare", { precision: 10, scale: 2 }),
  timeFare: decimal("time_fare", { precision: 10, scale: 2 }),
  surgeFee: decimal("surge_fee", { precision: 10, scale: 2 }),
  tollCharges: decimal("toll_charges", { precision: 10, scale: 2 }),
  waitingCharges: decimal("waiting_charges", { precision: 10, scale: 2 }),
  luggageFee: decimal("luggage_fee", { precision: 10, scale: 2 }),
  petsFee: decimal("pets_fee", { precision: 10, scale: 2 }),
  discountAmount: decimal("discount_amount", { precision: 10, scale: 2 }),
  promoCode: varchar("promo_code", { length: 50 }),
  totalFare: decimal("total_fare", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  breakdown_ride_idx: index("breakdown_ride_idx").on(table.rideId),
}));

// =============================================
// 26. SURGE PRICING LOG
// =============================================
export const surgePricingLog = pgTable("surge_pricing_log", {
  surgeId: serial("surge_id").primaryKey(),
  rideType: rideTypeEnum("ride_type").notNull(),
  areaLatitude: decimal("area_latitude", { precision: 10, scale: 8 }),
  areaLongitude: decimal("area_longitude", { precision: 11, scale: 8 }),
  radiusKm: decimal("radius_km", { precision: 5, scale: 2 }),
  multiplier: decimal("multiplier", { precision: 3, scale: 2 }).notNull(),
  riderDemand: integer("rider_demand"),
  availableRiders: integer("available_riders"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  surge_area_idx: index("surge_area_idx").on(table.areaLatitude, table.areaLongitude),
  surge_active_idx: index("surge_active_idx").on(table.isActive),
  surge_ride_type_idx: index("surge_ride_type_idx").on(table.rideType),
}));

// =============================================
// 27. AUDIT LOGS
// =============================================
export const auditLogs = pgTable("audit_logs", {
  logId: serial("log_id").primaryKey(),
  adminId: integer("admin_id").references(() => users.userId, { onDelete: "set null" }),
  actionType: varchar("action_type", { length: 50 }).notNull(),
  actionDescription: text("action_description"),
  targetTable: varchar("target_table", { length: 50 }),
  targetId: integer("target_id"),
  oldValues: text("old_values"),
  newValues: text("new_values"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  audit_admin_idx: index("audit_admin_idx").on(table.adminId),
  audit_action_idx: index("audit_action_idx").on(table.actionType),
  audit_date_idx: index("audit_date_idx").on(table.createdAt),
}));

// Export all tables
export const allTables = {
  users,
  riders,
  shops,
  products,
  rideBookings,
  orders,
  deliveries,
  deliveryItems,
  ridePricing,
  riderEarnings,
  userAddresses,
  wallets,
  walletTransactions,
  riderRejections,
  rideAnalytics,
  rideShareMatches,
  notifications,
  supportTickets,
  promotions,
  rideBookingWaypoints,
  usedPromotions,
  riderSchedules,
  riderLocations,
  systemConfig,
  rideFareBreakdown,
  surgePricingLog,
  auditLogs,
  userSystemConfig,
  riderPreferences,
};