-- =============================================
-- NORTHRIDE DELIVERY APP DATABASE SCHEMA
-- WITH RIDE BOOKING FUNCTIONALITY
-- =============================================

-- 1. USERS TABLE (Unchanged)
CREATE TABLE users (
    user_id INT PRIMARY KEY AUTO_INCREMENT,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone_number VARCHAR(20) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    profile_picture VARCHAR(255),
    user_type ENUM('customer', 'rider', 'admin') DEFAULT 'customer',
    is_verified BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_phone (phone_number),
    INDEX idx_user_type (user_type)
);

-- 2. RIDERS TABLE (Updated with ride-specific fields)
CREATE TABLE riders (
    rider_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT UNIQUE NOT NULL,
    vehicle_type ENUM('bicycle', 'motorcycle', 'car', 'scooter', 'van', 'truck') NOT NULL,
    vehicle_plate_number VARCHAR(20),
    vehicle_model VARCHAR(50),
    vehicle_color VARCHAR(30),
    license_number VARCHAR(50),
    is_available BOOLEAN DEFAULT TRUE,
    is_approved BOOLEAN DEFAULT FALSE,
    current_latitude DECIMAL(10, 8),
    current_longitude DECIMAL(11, 8),
    rating DECIMAL(3, 2) DEFAULT 0.00,
    total_deliveries INT DEFAULT 0,
    total_rides INT DEFAULT 0,
    earning_balance DECIMAL(10, 2) DEFAULT 0.00,
    bank_account_name VARCHAR(100),
    bank_account_number VARCHAR(50),
    bank_name VARCHAR(50),
    id_card_image VARCHAR(255),
    driver_license_image VARCHAR(255),
    vehicle_registration_image VARCHAR(255),
    insurance_image VARCHAR(255),
    max_passengers INT DEFAULT 1,
    has_air_conditioning BOOLEAN DEFAULT FALSE,
    has_wifi BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_availability (is_available),
    INDEX idx_location (current_latitude, current_longitude),
    INDEX idx_approved (is_approved),
    INDEX idx_vehicle_type (vehicle_type)
);

-- 3. SHOPS TABLE (Unchanged)
CREATE TABLE shops (
    shop_id INT PRIMARY KEY AUTO_INCREMENT,
    owner_id INT NOT NULL,
    shop_name VARCHAR(100) NOT NULL,
    shop_description TEXT,
    shop_category VARCHAR(50),
    address VARCHAR(255) NOT NULL,
    city VARCHAR(50),
    state VARCHAR(50),
    country VARCHAR(50),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    phone_number VARCHAR(20),
    email VARCHAR(100),
    logo VARCHAR(255),
    cover_image VARCHAR(255),
    is_open BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,
    rating DECIMAL(3, 2) DEFAULT 0.00,
    opening_time TIME,
    closing_time TIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_location (latitude, longitude),
    INDEX idx_open_status (is_open),
    INDEX idx_verified (is_verified)
);

-- 4. PRODUCTS TABLE (Unchanged)
CREATE TABLE products (
    product_id INT PRIMARY KEY AUTO_INCREMENT,
    shop_id INT NOT NULL,
    product_name VARCHAR(100) NOT NULL,
    product_description TEXT,
    category VARCHAR(50),
    price DECIMAL(10, 2) NOT NULL,
    discount_price DECIMAL(10, 2),
    stock_quantity INT DEFAULT 0,
    unit VARCHAR(20) DEFAULT 'piece',
    image_url VARCHAR(255),
    is_available BOOLEAN DEFAULT TRUE,
    is_featured BOOLEAN DEFAULT FALSE,
    preparation_time INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (shop_id) REFERENCES shops(shop_id) ON DELETE CASCADE,
    INDEX idx_shop (shop_id),
    INDEX idx_availability (is_available),
    INDEX idx_category (category)
);

-- =============================================
-- 5. RIDE BOOKINGS TABLE (NEW)
-- =============================================
CREATE TABLE ride_bookings (
    ride_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    rider_id INT,
    ride_reference VARCHAR(50) UNIQUE NOT NULL,
    ride_type ENUM('standard', 'premium', 'shared', 'luxury') DEFAULT 'standard',
    booking_type ENUM('now', 'scheduled') DEFAULT 'now',
    
    -- Pickup details
    pickup_address VARCHAR(255) NOT NULL,
    pickup_latitude DECIMAL(10, 8) NOT NULL,
    pickup_longitude DECIMAL(11, 8) NOT NULL,
    pickup_instructions TEXT,
    pickup_landmark VARCHAR(100),
    
    -- Dropoff details
    dropoff_address VARCHAR(255) NOT NULL,
    dropoff_latitude DECIMAL(10, 8) NOT NULL,
    dropoff_longitude DECIMAL(11, 8) NOT NULL,
    dropoff_instructions TEXT,
    dropoff_landmark VARCHAR(100),
    
    -- Trip details
    estimated_distance DECIMAL(10, 2), -- in kilometers
    estimated_duration INT, -- in minutes
    estimated_price DECIMAL(10, 2),
    actual_price DECIMAL(10, 2),
    surge_multiplier DECIMAL(3, 2) DEFAULT 1.00,
    base_fare DECIMAL(10, 2) DEFAULT 0.00,
    distance_fare DECIMAL(10, 2) DEFAULT 0.00,
    time_fare DECIMAL(10, 2) DEFAULT 0.00,
    toll_charges DECIMAL(10, 2) DEFAULT 0.00,
    waiting_charges DECIMAL(10, 2) DEFAULT 0.00,
    cancellation_fee DECIMAL(10, 2) DEFAULT 0.00,
    
    -- Passenger details
    number_of_passengers INT DEFAULT 1,
    has_luggage BOOLEAN DEFAULT FALSE,
    has_pets BOOLEAN DEFAULT FALSE,
    requires_wheelchair BOOLEAN DEFAULT FALSE,
    special_requirements TEXT,
    
    -- Status flow
    status ENUM('pending', 'searching', 'confirmed', 'arrived', 'in_progress', 'completed', 'cancelled', 'rejected', 'no_show') 
          DEFAULT 'pending',
    cancellation_reason TEXT,
    cancelled_by ENUM('user', 'rider', 'system'),
    
    -- Payment
    payment_method ENUM('cash', 'card', 'wallet', 'bank_transfer') NOT NULL,
    payment_status ENUM('pending', 'paid', 'failed', 'refunded') DEFAULT 'pending',
    payment_reference VARCHAR(100),
    
    -- Timestamps
    booked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    scheduled_time TIMESTAMP, -- For scheduled rides
    confirmed_at TIMESTAMP,
    rider_arrived_at TIMESTAMP,
    ride_started_at TIMESTAMP,
    ride_completed_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    
    -- Ratings
    rider_rating TINYINT CHECK (rider_rating BETWEEN 1 AND 5),
    rider_review TEXT,
    passenger_rating TINYINT CHECK (passenger_rating BETWEEN 1 AND 5),
    passenger_review TEXT,
    
    -- Tracking
    route_polyline TEXT, -- Encoded route path
    actual_distance DECIMAL(10, 2),
    actual_duration INT,
    
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (rider_id) REFERENCES riders(rider_id) ON DELETE SET NULL,
    INDEX idx_user (user_id),
    INDEX idx_rider (rider_id),
    INDEX idx_status (status),
    INDEX idx_reference (ride_reference),
    INDEX idx_booking_type (booking_type),
    INDEX idx_scheduled (scheduled_time),
    INDEX idx_location (pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude),
    INDEX idx_date (booked_at)
);

-- =============================================
-- 6. RIDE BOOKING ITEMS (for scheduled rides)
-- =============================================
CREATE TABLE ride_booking_waypoints (
    waypoint_id INT PRIMARY KEY AUTO_INCREMENT,
    ride_id INT NOT NULL,
    stop_order INT NOT NULL,
    address VARCHAR(255) NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    instructions TEXT,
    estimated_arrival_time TIMESTAMP,
    actual_arrival_time TIMESTAMP,
    duration_at_stop INT DEFAULT 0,
    FOREIGN KEY (ride_id) REFERENCES ride_bookings(ride_id) ON DELETE CASCADE,
    INDEX idx_ride (ride_id),
    INDEX idx_stop_order (stop_order)
);

-- =============================================
-- 7. RIDE PRICING TABLE
-- =============================================
CREATE TABLE ride_pricing (
    pricing_id INT PRIMARY KEY AUTO_INCREMENT,
    ride_type ENUM('standard', 'premium', 'shared', 'luxury') NOT NULL,
    vehicle_type VARCHAR(20),
    base_fare DECIMAL(10, 2) NOT NULL,
    price_per_km DECIMAL(10, 2) NOT NULL,
    price_per_minute DECIMAL(10, 2) NOT NULL,
    minimum_fare DECIMAL(10, 2) NOT NULL,
    cancellation_fee DECIMAL(10, 2) DEFAULT 0.00,
    waiting_fee_per_minute DECIMAL(10, 2) DEFAULT 0.00,
    surge_multiplier_min DECIMAL(3, 2) DEFAULT 1.00,
    surge_multiplier_max DECIMAL(3, 2) DEFAULT 3.00,
    is_active BOOLEAN DEFAULT TRUE,
    effective_from TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    effective_to TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ride_type (ride_type),
    INDEX idx_active (is_active),
    INDEX idx_effective (effective_from, effective_to)
);

-- Insert default pricing
INSERT INTO ride_pricing (ride_type, vehicle_type, base_fare, price_per_km, price_per_minute, minimum_fare, cancellation_fee, waiting_fee_per_minute) VALUES
('standard', 'car', 2.50, 1.20, 0.30, 4.00, 3.00, 0.25),
('premium', 'car', 5.00, 2.00, 0.50, 8.00, 5.00, 0.40),
('luxury', 'car', 10.00, 3.50, 0.80, 15.00, 10.00, 0.60),
('shared', 'car', 1.50, 0.80, 0.20, 2.50, 2.00, 0.15);

-- =============================================
-- 8. RIDE FARE BREAKDOWN (NEW)
-- =============================================
CREATE TABLE ride_fare_breakdown (
    breakdown_id INT PRIMARY KEY AUTO_INCREMENT,
    ride_id INT NOT NULL,
    base_fare DECIMAL(10, 2),
    distance_fare DECIMAL(10, 2),
    time_fare DECIMAL(10, 2),
    surge_fee DECIMAL(10, 2),
    toll_charges DECIMAL(10, 2),
    waiting_charges DECIMAL(10, 2),
    luggage_fee DECIMAL(10, 2),
    pets_fee DECIMAL(10, 2),
    discount_amount DECIMAL(10, 2),
    promo_code VARCHAR(50),
    total_fare DECIMAL(10, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ride_id) REFERENCES ride_bookings(ride_id) ON DELETE CASCADE,
    INDEX idx_ride (ride_id)
);

-- =============================================
-- 9. ORDERS TABLE (Updated with ride info)
-- =============================================
CREATE TABLE orders (
    order_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    shop_id INT NOT NULL,
    rider_id INT,
    order_reference VARCHAR(50) UNIQUE NOT NULL,
    order_type ENUM('delivery', 'pickup', 'ride') DEFAULT 'delivery',
    status ENUM('pending', 'confirmed', 'preparing', 'ready', 'picked_up', 'in_transit', 'delivered', 'cancelled', 'rejected') 
          DEFAULT 'pending',
    payment_method ENUM('cash', 'card', 'wallet', 'bank_transfer') NOT NULL,
    payment_status ENUM('pending', 'paid', 'failed', 'refunded') DEFAULT 'pending',
    subtotal DECIMAL(10, 2) NOT NULL,
    delivery_fee DECIMAL(10, 2) DEFAULT 0.00,
    service_charge DECIMAL(10, 2) DEFAULT 0.00,
    total_amount DECIMAL(10, 2) NOT NULL,
    discount_amount DECIMAL(10, 2) DEFAULT 0.00,
    tip_amount DECIMAL(10, 2) DEFAULT 0.00,
    delivery_address VARCHAR(255),
    delivery_latitude DECIMAL(10, 8),
    delivery_longitude DECIMAL(11, 8),
    delivery_instructions TEXT,
    pickup_latitude DECIMAL(10, 8),
    pickup_longitude DECIMAL(11, 8),
    estimated_delivery_time INT,
    actual_delivery_time INT,
    order_placed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    confirmed_at TIMESTAMP,
    preparing_at TIMESTAMP,
    ready_at TIMESTAMP,
    picked_up_at TIMESTAMP,
    in_transit_at TIMESTAMP,
    delivered_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    rejection_reason TEXT,
    customer_rating TINYINT CHECK (customer_rating BETWEEN 1 AND 5),
    customer_review TEXT,
    rider_rating TINYINT CHECK (rider_rating BETWEEN 1 AND 5),
    rider_review TEXT,
    ride_id INT, -- Link to ride if this is a combined service
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (shop_id) REFERENCES shops(shop_id) ON DELETE CASCADE,
    FOREIGN KEY (rider_id) REFERENCES riders(rider_id) ON DELETE SET NULL,
    FOREIGN KEY (ride_id) REFERENCES ride_bookings(ride_id) ON DELETE SET NULL,
    INDEX idx_user (user_id),
    INDEX idx_shop (shop_id),
    INDEX idx_rider (rider_id),
    INDEX idx_status (status),
    INDEX idx_reference (order_reference),
    INDEX idx_date (order_placed_at),
    INDEX idx_ride (ride_id)
);

-- =============================================
-- 10. RIDER AVAILABILITY SCHEDULE (NEW)
-- =============================================
CREATE TABLE rider_schedules (
    schedule_id INT PRIMARY KEY AUTO_INCREMENT,
    rider_id INT NOT NULL,
    day_of_week ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday') NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (rider_id) REFERENCES riders(rider_id) ON DELETE CASCADE,
    UNIQUE KEY unique_rider_day (rider_id, day_of_week),
    INDEX idx_rider (rider_id),
    INDEX idx_day (day_of_week)
);

-- =============================================
-- 11. SURGE PRICING LOG (NEW)
-- =============================================
CREATE TABLE surge_pricing_log (
    surge_id INT PRIMARY KEY AUTO_INCREMENT,
    ride_type ENUM('standard', 'premium', 'shared', 'luxury') NOT NULL,
    area_latitude DECIMAL(10, 8),
    area_longitude DECIMAL(11, 8),
    radius_km DECIMAL(5, 2),
    multiplier DECIMAL(3, 2) NOT NULL,
    rider_demand INT,
    available_riders INT,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_area (area_latitude, area_longitude),
    INDEX idx_active (is_active),
    INDEX idx_ride_type (ride_type)
);

-- =============================================
-- 12. RIDE HISTORY & ANALYTICS (NEW)
-- =============================================
CREATE TABLE ride_analytics (
    analytics_id INT PRIMARY KEY AUTO_INCREMENT,
    ride_id INT NOT NULL,
    rider_id INT NOT NULL,
    user_id INT NOT NULL,
    booking_to_arrival_time INT, -- seconds
    arrival_to_start_time INT, -- seconds
    start_to_completion_time INT, -- seconds
    total_trip_time INT, -- seconds
    distance_traveled DECIMAL(10, 2), -- km
    average_speed DECIMAL(5, 2), -- km/h
    idle_time INT, -- seconds
    route_efficiency DECIMAL(5, 2), -- percentage
    data_usage_mb DECIMAL(10, 2),
    battery_usage_percentage DECIMAL(5, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ride_id) REFERENCES ride_bookings(ride_id) ON DELETE CASCADE,
    FOREIGN KEY (rider_id) REFERENCES riders(rider_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_ride (ride_id),
    INDEX idx_rider (rider_id),
    INDEX idx_user (user_id)
);

-- =============================================
-- 13. RIDE SHARE MATCHING (NEW)
-- =============================================
CREATE TABLE ride_share_matches (
    match_id INT PRIMARY KEY AUTO_INCREMENT,
    primary_ride_id INT NOT NULL,
    secondary_ride_id INT NOT NULL,
    rider_id INT NOT NULL,
    match_status ENUM('pending', 'accepted', 'rejected', 'completed') DEFAULT 'pending',
    match_score DECIMAL(5, 2), -- Compatibility score
    matched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP,
    rejected_at TIMESTAMP,
    completed_at TIMESTAMP,
    FOREIGN KEY (primary_ride_id) REFERENCES ride_bookings(ride_id) ON DELETE CASCADE,
    FOREIGN KEY (secondary_ride_id) REFERENCES ride_bookings(ride_id) ON DELETE CASCADE,
    FOREIGN KEY (rider_id) REFERENCES riders(rider_id) ON DELETE CASCADE,
    INDEX idx_primary (primary_ride_id),
    INDEX idx_secondary (secondary_ride_id),
    INDEX idx_rider (rider_id),
    INDEX idx_status (match_status)
);

-- =============================================
-- 14. RIDER REJECTIONS LOG (Unchanged)
-- =============================================
CREATE TABLE rider_rejections (
    rejection_id INT PRIMARY KEY AUTO_INCREMENT,
    order_id INT,
    ride_id INT,
    rider_id INT NOT NULL,
    reason TEXT,
    rejected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    FOREIGN KEY (ride_id) REFERENCES ride_bookings(ride_id) ON DELETE CASCADE,
    FOREIGN KEY (rider_id) REFERENCES riders(rider_id) ON DELETE CASCADE,
    INDEX idx_order (order_id),
    INDEX idx_ride (ride_id),
    INDEX idx_rider (rider_id)
);

-- =============================================
-- 15. USER ADDRESSES TABLE (Updated)
-- =============================================
CREATE TABLE user_addresses (
    address_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    address_label VARCHAR(50) DEFAULT 'Home',
    address_line1 VARCHAR(255) NOT NULL,
    address_line2 VARCHAR(255),
    city VARCHAR(50),
    state VARCHAR(50),
    country VARCHAR(50),
    postal_code VARCHAR(20),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    phone_number VARCHAR(20),
    is_default BOOLEAN DEFAULT FALSE,
    address_type ENUM('home', 'work', 'other') DEFAULT 'home',
    delivery_instructions TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_user (user_id),
    INDEX idx_default (is_default),
    INDEX idx_type (address_type)
);

-- =============================================
-- 16. PAYMENTS TABLE (Updated)
-- =============================================
CREATE TABLE payments (
    payment_id INT PRIMARY KEY AUTO_INCREMENT,
    order_id INT,
    ride_id INT,
    user_id INT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    payment_method ENUM('cash', 'card', 'wallet', 'bank_transfer') NOT NULL,
    payment_type ENUM('order', 'ride', 'wallet_topup', 'withdrawal') NOT NULL,
    payment_status ENUM('pending', 'completed', 'failed', 'refunded') DEFAULT 'pending',
    transaction_reference VARCHAR(100) UNIQUE,
    payment_gateway VARCHAR(50),
    gateway_response TEXT,
    paid_at TIMESTAMP,
    refunded_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    FOREIGN KEY (ride_id) REFERENCES ride_bookings(ride_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_order (order_id),
    INDEX idx_ride (ride_id),
    INDEX idx_user (user_id),
    INDEX idx_transaction (transaction_reference),
    INDEX idx_type (payment_type)
);

-- =============================================
-- 17. WALLET TABLE (Unchanged)
-- =============================================
CREATE TABLE wallets (
    wallet_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT UNIQUE NOT NULL,
    balance DECIMAL(10, 2) DEFAULT 0.00,
    total_deposits DECIMAL(10, 2) DEFAULT 0.00,
    total_withdrawals DECIMAL(10, 2) DEFAULT 0.00,
    last_transaction_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_user (user_id)
);

-- =============================================
-- 18. WALLET TRANSACTIONS (Updated)
-- =============================================
CREATE TABLE wallet_transactions (
    transaction_id INT PRIMARY KEY AUTO_INCREMENT,
    wallet_id INT NOT NULL,
    user_id INT NOT NULL,
    transaction_type ENUM('deposit', 'withdrawal', 'payment', 'refund', 'bonus', 'ride_payment') NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    balance_after DECIMAL(10, 2) NOT NULL,
    description TEXT,
    reference VARCHAR(100) UNIQUE,
    order_id INT,
    ride_id INT,
    status ENUM('pending', 'completed', 'failed') DEFAULT 'completed',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_id) REFERENCES wallets(wallet_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE SET NULL,
    FOREIGN KEY (ride_id) REFERENCES ride_bookings(ride_id) ON DELETE SET NULL,
    INDEX idx_wallet (wallet_id),
    INDEX idx_user (user_id),
    INDEX idx_reference (reference),
    INDEX idx_order (order_id),
    INDEX idx_ride (ride_id)
);

-- =============================================
-- 19. NOTIFICATIONS TABLE (Updated with ride)
-- =============================================
CREATE TABLE notifications (
    notification_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    title VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    type ENUM('order', 'payment', 'delivery', 'ride', 'system', 'promotion') DEFAULT 'system',
    is_read BOOLEAN DEFAULT FALSE,
    is_clicked BOOLEAN DEFAULT FALSE,
    reference_id INT,
    reference_type VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_user (user_id),
    INDEX idx_read (is_read),
    INDEX idx_type (type),
    INDEX idx_reference (reference_id, reference_type)
);

-- =============================================
-- 20. USER SETTINGS TABLE (Unchanged)
-- =============================================
CREATE TABLE user_settings (
    setting_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT UNIQUE NOT NULL,
    theme ENUM('light', 'dark', 'system') DEFAULT 'system',
    language VARCHAR(10) DEFAULT 'en',
    notification_enabled BOOLEAN DEFAULT TRUE,
    email_notifications BOOLEAN DEFAULT TRUE,
    sms_notifications BOOLEAN DEFAULT FALSE,
    push_notifications BOOLEAN DEFAULT TRUE,
    location_permission BOOLEAN DEFAULT FALSE,
    save_payment_methods BOOLEAN DEFAULT TRUE,
    show_online_status BOOLEAN DEFAULT TRUE,
    preferred_distance_unit ENUM('km', 'miles') DEFAULT 'km',
    preferred_currency VARCHAR(10) DEFAULT 'USD',
    two_factor_auth BOOLEAN DEFAULT FALSE,
    default_ride_type ENUM('standard', 'premium', 'shared', 'luxury') DEFAULT 'standard',
    saved_places JSON, -- Store frequently visited places
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- =============================================
-- 21. RIDER LOCATION TRACKING (Unchanged)
-- =============================================
CREATE TABLE rider_locations (
    location_id INT PRIMARY KEY AUTO_INCREMENT,
    rider_id INT NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    accuracy DECIMAL(10, 2),
    speed DECIMAL(10, 2),
    heading DECIMAL(10, 2),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rider_id) REFERENCES riders(rider_id) ON DELETE CASCADE,
    INDEX idx_rider (rider_id),
    INDEX idx_date (created_at)
);

-- =============================================
-- 22. RIDER EARNINGS (Updated)
-- =============================================
CREATE TABLE rider_earnings (
    earning_id INT PRIMARY KEY AUTO_INCREMENT,
    rider_id INT NOT NULL,
    order_id INT,
    ride_id INT,
    delivery_fee DECIMAL(10, 2) DEFAULT 0.00,
    ride_fare DECIMAL(10, 2) DEFAULT 0.00,
    tip_amount DECIMAL(10, 2) DEFAULT 0.00,
    bonus_amount DECIMAL(10, 2) DEFAULT 0.00,
    total_earned DECIMAL(10, 2) NOT NULL,
    earning_type ENUM('delivery', 'ride', 'bonus') DEFAULT 'delivery',
    status ENUM('pending', 'paid', 'failed') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    paid_at TIMESTAMP,
    FOREIGN KEY (rider_id) REFERENCES riders(rider_id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    FOREIGN KEY (ride_id) REFERENCES ride_bookings(ride_id) ON DELETE CASCADE,
    INDEX idx_rider (rider_id),
    INDEX idx_order (order_id),
    INDEX idx_ride (ride_id),
    INDEX idx_status (status),
    INDEX idx_type (earning_type)
);

-- =============================================
-- 23. AUDIT LOGS (Unchanged)
-- =============================================
CREATE TABLE audit_logs (
    log_id INT PRIMARY KEY AUTO_INCREMENT,
    admin_id INT,
    action_type VARCHAR(50) NOT NULL,
    action_description TEXT,
    target_table VARCHAR(50),
    target_id INT,
    old_values JSON,
    new_values JSON,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_id) REFERENCES users(user_id) ON DELETE SET NULL,
    INDEX idx_admin (admin_id),
    INDEX idx_action (action_type),
    INDEX idx_date (created_at)
);

-- =============================================
-- 24. SUPPORT TICKETS (Updated)
-- =============================================
CREATE TABLE support_tickets (
    ticket_id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    subject VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    category ENUM('order', 'payment', 'delivery', 'ride', 'account', 'other') DEFAULT 'other',
    priority ENUM('low', 'medium', 'high', 'urgent') DEFAULT 'medium',
    status ENUM('open', 'in_progress', 'resolved', 'closed') DEFAULT 'open',
    assigned_to INT,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_to) REFERENCES users(user_id) ON DELETE SET NULL,
    INDEX idx_user (user_id),
    INDEX idx_status (status),
    INDEX idx_assigned (assigned_to),
    INDEX idx_category (category)
);

-- =============================================
-- 25. PROMOTIONS (Unchanged)
-- =============================================
CREATE TABLE promotions (
    promotion_id INT PRIMARY KEY AUTO_INCREMENT,
    shop_id INT,
    promo_code VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(100) NOT NULL,
    description TEXT,
    discount_type ENUM('percentage', 'fixed') NOT NULL,
    discount_value DECIMAL(10, 2) NOT NULL,
    minimum_order_amount DECIMAL(10, 2),
    maximum_discount DECIMAL(10, 2),
    applicable_to ENUM('delivery', 'ride', 'both') DEFAULT 'both',
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    usage_limit INT,
    used_count INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shop_id) REFERENCES shops(shop_id) ON DELETE CASCADE,
    INDEX idx_code (promo_code),
    INDEX idx_active (is_active),
    INDEX idx_date (start_date, end_date)
);

-- =============================================
-- 26. USED PROMOTIONS (Updated)
-- =============================================
CREATE TABLE used_promotions (
    used_promo_id INT PRIMARY KEY AUTO_INCREMENT,
    promotion_id INT NOT NULL,
    user_id INT NOT NULL,
    order_id INT,
    ride_id INT,
    discount_amount DECIMAL(10, 2) NOT NULL,
    used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (promotion_id) REFERENCES promotions(promotion_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    FOREIGN KEY (ride_id) REFERENCES ride_bookings(ride_id) ON DELETE CASCADE,
    INDEX idx_promo (promotion_id),
    INDEX idx_user (user_id),
    INDEX idx_order (order_id),
    INDEX idx_ride (ride_id)
);

-- =============================================
-- 27. SYSTEM CONFIG (Unchanged)
-- =============================================
CREATE TABLE system_config (
    config_id INT PRIMARY KEY AUTO_INCREMENT,
    config_key VARCHAR(50) UNIQUE NOT NULL,
    config_value TEXT,
    config_group VARCHAR(50),
    description TEXT,
    is_editable BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_key (config_key),
    INDEX idx_group (config_group)
);

-- =============================================
-- INSERT SYSTEM CONFIGURATIONS
-- =============================================
INSERT INTO system_config (config_key, config_value, config_group, description) VALUES
('delivery_base_fee', '5.00', 'delivery', 'Base delivery fee for all orders'),
('delivery_per_km', '2.00', 'delivery', 'Additional delivery fee per kilometer'),
('free_delivery_threshold', '50.00', 'delivery', 'Minimum order amount for free delivery'),
('service_charge_percentage', '2.50', 'payment', 'Service charge percentage on total order'),
('max_order_distance', '15', 'delivery', 'Maximum delivery distance in kilometers'),
('rider_commission_rate', '80.00', 'delivery', 'Percentage of delivery fee that goes to rider'),
('wallet_min_balance', '0.00', 'wallet', 'Minimum balance required in wallet'),
('support_email', 'support@northride.com', 'contact', 'Support email address'),
('support_phone', '+1234567890', 'contact', 'Support phone number'),
('maintenance_mode', 'false', 'system', 'Enable maintenance mode for the app'),
('ride_booking_timeout', '60', 'ride', 'Ride booking timeout in seconds'),
('max_ride_distance', '100', 'ride', 'Maximum ride distance in kilometers'),
('ride_cancellation_timeout', '300', 'ride', 'Time in seconds before ride cancellation'),
('surge_enabled', 'true', 'ride', 'Enable surge pricing'),
('surge_check_interval', '300', 'ride', 'Surge pricing check interval in seconds'),
('ride_share_enabled', 'true', 'ride', 'Enable ride sharing feature');

-- =============================================
-- CREATE VIEWS FOR RIDE BOOKING
-- =============================================

-- View for available riders near a location
CREATE VIEW available_riders_view AS
SELECT 
    r.rider_id,
    u.full_name,
    u.phone_number,
    r.vehicle_type,
    r.vehicle_model,
    r.vehicle_color,
    r.rating,
    r.current_latitude,
    r.current_longitude,
    r.is_available,
    r.has_air_conditioning,
    r.has_wifi,
    r.max_passengers,
    (6371 * acos(cos(radians(:user_lat)) * cos(radians(r.current_latitude)) 
    * cos(radians(r.current_longitude) - radians(:user_lng)) + sin(radians(:user_lat)) 
    * sin(radians(r.current_latitude)))) AS distance
FROM riders r
JOIN users u ON r.user_id = u.user_id
WHERE r.is_available = TRUE 
    AND r.is_approved = TRUE
    AND r.current_latitude IS NOT NULL
    AND r.current_longitude IS NOT NULL;

-- View for active rides
CREATE VIEW active_rides_view AS
SELECT 
    rb.ride_id,
    rb.ride_reference,
    u.full_name AS passenger_name,
    u.phone_number AS passenger_phone,
    rb.pickup_address,
    rb.dropoff_address,
    rb.status,
    rb.estimated_price,
    rb.booked_at,
    rb.ride_type,
    r.vehicle_type,
    r2.full_name AS rider_name,
    r2.phone_number AS rider_phone
FROM ride_bookings rb
JOIN users u ON rb.user_id = u.user_id
LEFT JOIN riders r ON rb.rider_id = r.rider_id
LEFT JOIN users r2 ON r.user_id = r2.user_id
WHERE rb.status NOT IN ('completed', 'cancelled')
ORDER BY rb.booked_at DESC;

-- View for rider performance including rides
CREATE VIEW rider_performance_full_view AS
SELECT 
    r.rider_id,
    u.full_name,
    r.vehicle_type,
    r.rating,
    r.total_deliveries,
    r.total_rides,
    r.earning_balance,
    COUNT(DISTINCT o.order_id) AS current_deliveries,
    COUNT(DISTINCT rb.ride_id) AS current_rides,
    (r.total_deliveries + r.total_rides) AS total_jobs,
    AVG(CASE WHEN o.customer_rating IS NOT NULL THEN o.customer_rating END) AS avg_delivery_rating,
    AVG(CASE WHEN rb.passenger_rating IS NOT NULL THEN rb.passenger_rating END) AS avg_ride_rating
FROM riders r
JOIN users u ON r.user_id = u.user_id
LEFT JOIN orders o ON r.rider_id = o.rider_id AND o.status NOT IN ('delivered', 'cancelled', 'rejected')
LEFT JOIN ride_bookings rb ON r.rider_id = rb.rider_id AND rb.status NOT IN ('completed', 'cancelled')
GROUP BY r.rider_id, u.full_name, r.vehicle_type, r.rating, r.total_deliveries, r.total_rides, r.earning_balance;

-- =============================================
-- TRIGGERS FOR RIDE BOOKING
-- =============================================

-- Trigger to automatically assign a rider when ride is booked
DELIMITER //
CREATE TRIGGER auto_assign_rider
BEFORE INSERT ON ride_bookings
FOR EACH ROW
BEGIN
    DECLARE nearest_rider INT;
    DECLARE rider_distance DECIMAL(10,2);
    
    -- Find nearest available rider
    SELECT rider_id INTO nearest_rider
    FROM riders
    WHERE is_available = TRUE 
        AND is_approved = TRUE
        AND vehicle_type IN (SELECT vehicle_type FROM ride_pricing WHERE ride_type = NEW.ride_type)
    ORDER BY (6371 * acos(cos(radians(NEW.pickup_latitude)) * cos(radians(current_latitude)) 
        * cos(radians(current_longitude) - radians(NEW.pickup_longitude)) + sin(radians(NEW.pickup_latitude)) 
        * sin(radians(current_latitude)))) ASC
    LIMIT 1;
    
    SET NEW.rider_id = nearest_rider;
    
    -- Set status based on rider assignment
    IF nearest_rider IS NOT NULL THEN
        SET NEW.status = 'confirmed';
    ELSE
        SET NEW.status = 'searching';
    END IF;
    
    -- Generate ride reference if not provided
    IF NEW.ride_reference IS NULL THEN
        SET NEW.ride_reference = CONCAT('RD', UUID());
    END IF;
END//
DELIMITER ;

-- Trigger to update rider availability after ride completion
DELIMITER //
CREATE TRIGGER update_rider_after_ride
AFTER UPDATE ON ride_bookings
FOR EACH ROW
BEGIN
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        UPDATE riders SET 
            is_available = TRUE,
            total_rides = total_rides + 1,
            earning_balance = earning_balance + NEW.actual_price
        WHERE rider_id = NEW.rider_id;
        
        -- Insert into rider earnings
        INSERT INTO rider_earnings (rider_id, ride_id, ride_fare, tip_amount, total_earned, earning_type, status)
        VALUES (NEW.rider_id, NEW.ride_id, NEW.actual_price, 0, NEW.actual_price, 'ride', 'pending');
    END IF;
    
    IF NEW.status IN ('cancelled', 'rejected') AND OLD.status NOT IN ('cancelled', 'rejected') 
        AND NEW.rider_id IS NOT NULL THEN
        UPDATE riders SET is_available = TRUE WHERE rider_id = NEW.rider_id;
    END IF;
    
    -- Update rider availability when assigned
    IF NEW.status = 'confirmed' AND OLD.status = 'pending' AND NEW.rider_id IS NOT NULL THEN
        UPDATE riders SET is_available = FALSE WHERE rider_id = NEW.rider_id;
    END IF;
END//
DELIMITER ;

-- Trigger to calculate ride fare
DELIMITER //
CREATE TRIGGER calculate_ride_fare
BEFORE INSERT ON ride_bookings
FOR EACH ROW
BEGIN
    DECLARE price_per_km DECIMAL(10,2);
    DECLARE price_per_min DECIMAL(10,2);
    DECLARE base_fare DECIMAL(10,2);
    DECLARE min_fare DECIMAL(10,2);
    DECLARE distance_km DECIMAL(10,2);
    DECLARE duration_min INT;
    DECLARE calculated_fare DECIMAL(10,2);
    
    -- Get pricing for ride type
    SELECT p.price_per_km, p.price_per_minute, p.base_fare, p.minimum_fare
    INTO price_per_km, price_per_min, base_fare, min_fare
    FROM ride_pricing p
    WHERE p.ride_type = NEW.ride_type AND p.is_active = TRUE
    ORDER BY p.effective_from DESC
    LIMIT 1;
    
    -- Calculate distance between pickup and dropoff using Haversine formula
    SET distance_km = 6371 * acos(cos(radians(NEW.pickup_latitude)) * cos(radians(NEW.dropoff_latitude)) 
        * cos(radians(NEW.dropoff_longitude) - radians(NEW.pickup_longitude)) + sin(radians(NEW.pickup_latitude)) 
        * sin(radians(NEW.dropoff_latitude)));
    
    -- Estimate duration (average speed 30km/h)
    SET duration_min = (distance_km / 30) * 60;
    
    -- Calculate fare
    SET calculated_fare = base_fare + (distance_km * price_per_km) + (duration_min * price_per_min);
    SET calculated_fare = GREATEST(calculated_fare, min_fare);
    SET calculated_fare = calculated_fare * NEW.surge_multiplier;
    
    -- Add toll charges if applicable
    SET calculated_fare = calculated_fare + NEW.toll_charges;
    
    -- Update the ride record
    SET NEW.estimated_distance = distance_km;
    SET NEW.estimated_duration = duration_min;
    SET NEW.estimated_price = ROUND(calculated_fare, 2);
END//
DELIMITER ;

-- =============================================
-- STORED PROCEDURES FOR COMMON OPERATIONS
-- =============================================

-- Procedure to find nearby riders
DELIMITER //
CREATE PROCEDURE find_nearby_riders(
    IN p_lat DECIMAL(10,8),
    IN p_lng DECIMAL(11,8),
    IN p_radius_km DECIMAL(5,2),
    IN p_ride_type VARCHAR(20)
)
BEGIN
    SELECT 
        r.rider_id,
        u.full_name,
        u.phone_number,
        r.vehicle_type,
        r.vehicle_model,
        r.rating,
        r.current_latitude,
        r.current_longitude,
        (6371 * acos(cos(radians(p_lat)) * cos(radians(r.current_latitude)) 
        * cos(radians(r.current_longitude) - radians(p_lng)) + sin(radians(p_lat)) 
        * sin(radians(r.current_latitude)))) AS distance
    FROM riders r
    JOIN users u ON r.user_id = u.user_id
    JOIN ride_pricing rp ON r.vehicle_type = rp.vehicle_type
    WHERE r.is_available = TRUE 
        AND r.is_approved = TRUE
        AND r.current_latitude IS NOT NULL
        AND r.current_longitude IS NOT NULL
        AND rp.ride_type = p_ride_type
        AND rp.is_active = TRUE
    HAVING distance <= p_radius_km
    ORDER BY distance ASC;
END//
DELIMITER ;

-- Procedure to cancel a ride
DELIMITER //
CREATE PROCEDURE cancel_ride(
    IN p_ride_id INT,
    IN p_cancelled_by VARCHAR(20),
    IN p_reason TEXT
)
BEGIN
    DECLARE v_rider_id INT;
    DECLARE v_status VARCHAR(20);
    DECLARE v_cancellation_fee DECIMAL(10,2);
    
    -- Get ride details
    SELECT rider_id, status INTO v_rider_id, v_status
    FROM ride_bookings
    WHERE ride_id = p_ride_id;
    
    -- Update ride status
    UPDATE ride_bookings
    SET 
        status = 'cancelled',
        cancelled_by = p_cancelled_by,
        cancellation_reason = p_reason,
        cancelled_at = NOW()
    WHERE ride_id = p_ride_id;
    
    -- If rider was assigned, make them available again
    IF v_rider_id IS NOT NULL AND v_status NOT IN ('completed', 'cancelled') THEN
        UPDATE riders SET is_available = TRUE WHERE rider_id = v_rider_id;
        
        -- Calculate cancellation fee if applicable
        SELECT cancellation_fee INTO v_cancellation_fee
        FROM ride_pricing 
        WHERE ride_type = (SELECT ride_type FROM ride_bookings WHERE ride_id = p_ride_id)
        LIMIT 1;
        
        -- Add to rider earnings as compensation
        IF v_cancellation_fee > 0 AND p_cancelled_by = 'user' THEN
            INSERT INTO rider_earnings (rider_id, ride_id, ride_fare, tip_amount, bonus_amount, total_earned, earning_type, status)
            VALUES (v_rider_id, p_ride_id, 0, 0, v_cancellation_fee, v_cancellation_fee, 'bonus', 'pending');
        END IF;
    END IF;
END//
DELIMITER ;

-- =============================================
-- SAMPLE DATA FOR TESTING
-- =============================================

-- Insert sample admin
INSERT INTO users (full_name, email, phone_number, password_hash, user_type, is_verified, is_active) 
VALUES ('System Admin', 'admin@northride.com', '+1234567890', 'hashed_password_here', 'admin', TRUE, TRUE);

-- Insert sample rider
INSERT INTO users (full_name, email, phone_number, password_hash, user_type, is_verified, is_active) 
VALUES ('John Rider', 'john@example.com', '+1234567891', 'hashed_password_here', 'rider', TRUE, TRUE);

INSERT INTO riders (user_id, vehicle_type, vehicle_plate_number, vehicle_model, is_available, is_approved, current_latitude, current_longitude, max_passengers, has_air_conditioning) 
VALUES (2, 'car', 'ABC-1234', 'Toyota Camry', TRUE, TRUE, 40.7128, -74.0060, 4, TRUE);

-- Insert sample customer
INSERT INTO users (full_name, email, phone_number, password_hash, user_type, is_verified, is_active) 
VALUES ('Jane Customer', 'jane@example.com', '+1234567892', 'hashed_password_here', 'customer', TRUE, TRUE);

-- Insert sample address
INSERT INTO user_addresses (user_id, address_label, address_line1, city, state, country, latitude, longitude, is_default, address_type) 
VALUES (3, 'Home', '123 Main Street', 'New York', 'NY', 'USA', 40.7128, -74.0060, TRUE, 'home');

-- Insert sample ride booking
INSERT INTO ride_bookings (
    user_id, 
    ride_reference, 
    ride_type, 
    booking_type,
    pickup_address,
    pickup_latitude,
    pickup_longitude,
    dropoff_address,
    dropoff_latitude,
    dropoff_longitude,
    number_of_passengers,
    payment_method,
    status
) VALUES (
    3,
    'RIDE-2024-001',
    'standard',
    'now',
    '123 Main Street, New York',
    40.7128,
    -74.0060,
    '456 Park Avenue, New York',
    40.7580,
    -73.9855,
    1,
    'wallet',
    'pending'
);

-- =============================================
-- ADDITIONAL INDEXES FOR PERFORMANCE
-- =============================================

CREATE INDEX idx_ride_bookings_status_date ON ride_bookings(status, booked_at);
CREATE INDEX idx_ride_bookings_user_status ON ride_bookings(user_id, status);
CREATE INDEX idx_ride_bookings_rider_status ON ride_bookings(rider_id, status);
CREATE INDEX idx_ride_bookings_location ON ride_bookings(pickup_latitude, pickup_longitude);
CREATE INDEX idx_ride_pricing_type_active ON ride_pricing(ride_type, is_active);
CREATE INDEX idx_rider_location ON riders(current_latitude, current_longitude, is_available);
CREATE INDEX idx_ride_waypoints_ride ON ride_booking_waypoints(ride_id, stop_order);