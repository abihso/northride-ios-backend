import { inArray } from "drizzle-orm";
import db from "../db/index.js";
import * as schema from "../db/schema.js";

export const BASE_FARE = 5;
export const DEFAULT_PER_KM_RATES = {
  delivery: "2.50",
  ride: "2.50",
};

const CONFIG_KEYS = {
  delivery: "delivery_per_km",
  ride: "ride_per_km",
};

export function parsePerKmRate(value) {
  const normalized = typeof value === "number" ? String(value) : value;
  if (
    typeof normalized !== "string" ||
    !/^(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?$/.test(normalized)
  ) {
    return null;
  }
  const rate = Number(normalized);
  return Number.isFinite(rate) && rate <= 9999.99 ? rate : null;
}

export async function getPerKmRates(database = db) {
  const configs = await database
    .select({
      configKey: schema.systemConfig.configKey,
      configValue: schema.systemConfig.configValue,
    })
    .from(schema.systemConfig)
    .where(inArray(schema.systemConfig.configKey, Object.values(CONFIG_KEYS)));
  const values = new Map(configs.map((config) => [config.configKey, config.configValue]));

  return Object.fromEntries(
    Object.entries(CONFIG_KEYS).map(([service, key]) => {
      const storedValue = values.get(key);
      if (storedValue === null || storedValue === undefined || storedValue === "") {
        return [service, DEFAULT_PER_KM_RATES[service]];
      }
      const parsedValue = parsePerKmRate(storedValue);
      if (parsedValue === null) {
        throw new Error(`The configured ${service} per-kilometer rate is invalid.`);
      }
      return [service, parsedValue.toFixed(2)];
    }),
  );
}

export async function getPerKmRate(service, database = db) {
  if (!Object.hasOwn(CONFIG_KEYS, service)) {
    throw new Error("Unsupported pricing service.");
  }
  const rates = await getPerKmRates(database);
  return rates[service];
}

export function calculateFare(distanceKm, perKmRate) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) {
    throw new Error("A valid trip distance is required.");
  }
  const rate = parsePerKmRate(perKmRate);
  if (rate === null) {
    throw new Error("A valid per-kilometer rate is required.");
  }
  return {
    baseFare: BASE_FARE.toFixed(2),
    perKmRate: rate.toFixed(2),
    totalAmount: (BASE_FARE + distanceKm * rate).toFixed(2),
  };
}

export function pricingConfigKey(service) {
  return CONFIG_KEYS[service];
}

export function isPricingService(service) {
  return Object.hasOwn(CONFIG_KEYS, service);
}
