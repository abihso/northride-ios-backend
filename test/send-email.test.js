import assert from "node:assert/strict";
import test from "node:test";
import { createVerificationEmailSender } from "../src/utils/sendEmail.js";

test("verification email is submitted through Brevo's HTTPS API", async () => {
  let request;
  const sendEmail = createVerificationEmailSender({
    env: {
      BREVO_API_KEY: "test-api-key",
      BREVO_FROM_EMAIL: "verified@example.test",
    },
    fetchEmail: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        status: 201,
        json: async () => ({ messageId: "brevo-message-123" }),
      };
    },
  });

  const result = await sendEmail("123456", "rider@example.test");
  const payload = JSON.parse(request.options.body);
  const { htmlContent, ...payloadWithoutHtml } = payload;

  assert.equal(request.url, "https://api.brevo.com/v3/smtp/email");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers["api-key"], "test-api-key");
  assert.deepEqual(payloadWithoutHtml, {
    sender: { name: "NorthRide", email: "verified@example.test" },
    to: [{ email: "rider@example.test" }],
    subject: "Your NorthRide verification code",
    textContent:
      "Your NorthRide verification code is 123456. It expires in 10 minutes. If you did not request this, you can ignore this email.",
  });
  assert.match(htmlContent, /123456/);
  assert.deepEqual(result, {
    success: true,
    messageId: "brevo-message-123",
  });
});

test("verification email supports a configured sender name", async () => {
  let sender;
  const sendEmail = createVerificationEmailSender({
    env: {
      BREVO_API_KEY: "test-api-key",
      BREVO_FROM_EMAIL: "verified@example.test",
      BREVO_FROM_NAME: "NorthRide Support",
    },
    fetchEmail: async (_url, options) => {
      sender = JSON.parse(options.body).sender;
      return { ok: true, status: 201, json: async () => ({ messageId: "id" }) };
    },
  });

  await sendEmail("123456", "rider@example.test");
  assert.deepEqual(sender, {
    name: "NorthRide Support",
    email: "verified@example.test",
  });
});

test("verification email reports missing Brevo configuration", async () => {
  const sendEmail = createVerificationEmailSender({
    env: {},
    fetchEmail: async () => {
      assert.fail("The API must not be called without credentials.");
    },
  });

  await assert.rejects(
    sendEmail("123456", "rider@example.test"),
    /Set BREVO_API_KEY and BREVO_FROM_EMAIL/,
  );
});

test("verification email rejects a failed Brevo API response", async () => {
  const sendEmail = createVerificationEmailSender({
    env: {
      BREVO_API_KEY: "test-api-key",
      BREVO_FROM_EMAIL: "verified@example.test",
    },
    fetchEmail: async () => ({ ok: false, status: 401 }),
  });

  await assert.rejects(
    sendEmail("123456", "rider@example.test"),
    /Brevo email API returned HTTP 401/,
  );
});
