import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateFare,
  getPerKmRates,
  parsePerKmRate,
} from "../src/utils/pricing.js";

test("per-kilometer rates accept bounded decimal values only", () => {
  assert.equal(parsePerKmRate("0"), 0);
  assert.equal(parsePerKmRate("2.50"), 2.5);
  assert.equal(parsePerKmRate(9999.99), 9999.99);
  assert.equal(parsePerKmRate("-1"), null);
  assert.equal(parsePerKmRate("1.001"), null);
  assert.equal(parsePerKmRate("10000"), null);
  assert.equal(parsePerKmRate("2ghs"), null);
});

test("fare calculation uses the configured rate and the base fare", () => {
  assert.deepEqual(calculateFare(3.6, "2.25"), {
    baseFare: "5.00",
    perKmRate: "2.25",
    totalAmount: "13.10",
  });
});

test("missing per-kilometer settings use the established quote defaults", async () => {
  const database = {
    select() {
      return {
        from() {
          return {
            where() {
              return Promise.resolve([]);
            },
          };
        },
      };
    },
  };

  assert.deepEqual(await getPerKmRates(database), {
    delivery: "2.50",
    ride: "2.50",
  });
});

test("stored delivery and ride rates are read independently", async () => {
  const database = {
    select() {
      return {
        from() {
          return {
            where() {
              return Promise.resolve([
                { configKey: "delivery_per_km", configValue: "2.00" },
                { configKey: "ride_per_km", configValue: "3.75" },
              ]);
            },
          };
        },
      };
    },
  };

  assert.deepEqual(await getPerKmRates(database), {
    delivery: "2.00",
    ride: "3.75",
  });
});

test("an invalid stored pricing value fails rather than returning a false quote", async () => {
  const database = {
    select() {
      return {
        from() {
          return {
            where() {
              return Promise.resolve([
                { configKey: "delivery_per_km", configValue: "not-a-rate" },
              ]);
            },
          };
        },
      };
    },
  };

  await assert.rejects(
    getPerKmRates(database),
    /configured delivery per-kilometer rate is invalid/,
  );
});
