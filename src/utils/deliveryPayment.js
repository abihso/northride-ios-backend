export function isDeliveryPaymentConfirmed(delivery, paymentReceived) {
  return (
    delivery.paymentStatus === "paid" ||
    (delivery.paymentMethod === "cash" &&
      delivery.paymentStatus === "paidandwaiting" &&
      paymentReceived === true)
  );
}

export function shouldMarkCashPaymentPaid(delivery, paymentReceived) {
  return (
    delivery.paymentMethod === "cash" &&
    delivery.paymentStatus === "paidandwaiting" &&
    paymentReceived === true
  );
}
