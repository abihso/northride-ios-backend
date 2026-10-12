import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateShopOrderTotals,
  parseShopOrderItems,
} from "../src/routes/orderRoute.js";

test("shop order items require unique product IDs and bounded whole quantities", () => {
  assert.deepEqual(
    parseShopOrderItems([
      { productId: "12", quantity: "2" },
      { productId: 13, quantity: 1 },
    ]).value,
    [
      { productId: 12, quantity: 2 },
      { productId: 13, quantity: 1 },
    ],
  );
  assert.match(parseShopOrderItems([]).error, /between 1 and 50/);
  assert.match(
    parseShopOrderItems([
      { productId: 12, quantity: 1 },
      { productId: 12, quantity: 2 },
    ]).error,
    /only appear once/,
  );
  assert.match(
    parseShopOrderItems([{ productId: 12, quantity: 1.5 }]).error,
    /between 1 and 99/,
  );
});

test("shop order totals use exact cents and include the server-priced delivery fee", () => {
  assert.deepEqual(
    calculateShopOrderTotals(
      [
        { unitPrice: "2.35", quantity: 3 },
        { unitPrice: "1.10", quantity: 2 },
      ],
      "4.25",
    ),
    {
      subtotalCents: 925,
      deliveryFeeCents: 425,
      totalCents: 1350,
    },
  );
  assert.throws(
    () => calculateShopOrderTotals([{ unitPrice: "-1", quantity: 1 }], "0"),
    /invalid price/,
  );
  assert.throws(
    () => calculateShopOrderTotals([{ unitPrice: "1.00", quantity: 0 }], "0"),
    /positive whole numbers/,
  );
});
