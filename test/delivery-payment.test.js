import assert from "node:assert/strict";
import test from "node:test";
import {
  isDeliveryPaymentConfirmed,
  shouldMarkCashPaymentPaid,
} from "../src/utils/deliveryPayment.js";

test("online-paid deliveries can be completed without cash confirmation", () => {
  const delivery = { paymentMethod: "paystack", paymentStatus: "paid" };

  assert.equal(isDeliveryPaymentConfirmed(delivery, false), true);
  assert.equal(shouldMarkCashPaymentPaid(delivery, false), false);
});

test("cash delivery cannot complete before a payment request", () => {
  const delivery = { paymentMethod: "cash", paymentStatus: "pending" };

  assert.equal(isDeliveryPaymentConfirmed(delivery, true), false);
  assert.equal(shouldMarkCashPaymentPaid(delivery, true), false);
});

test("cash delivery completes only after a request and rider receipt confirmation", () => {
  const delivery = { paymentMethod: "cash", paymentStatus: "paidandwaiting" };

  assert.equal(isDeliveryPaymentConfirmed(delivery, false), false);
  assert.equal(isDeliveryPaymentConfirmed(delivery, true), true);
  assert.equal(shouldMarkCashPaymentPaid(delivery, true), true);
});
