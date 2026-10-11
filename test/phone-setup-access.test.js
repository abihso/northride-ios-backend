import assert from "node:assert/strict";
import test from "node:test";
import { requiresPhoneSetup } from "../src/utils/phoneSetupAccess.js";

const request = (method, originalUrl, user) => ({
  method,
  originalUrl,
  user,
});

test("accounts without a phone number can only restore, sign out, or set the number", () => {
  const user = { userType: "customer", phoneNumber: null };

  assert.equal(requiresPhoneSetup(request("GET", "/api/auth/me", user)), false);
  assert.equal(
    requiresPhoneSetup(request("POST", "/api/auth/logout", user)),
    false,
  );
  assert.equal(
    requiresPhoneSetup(
      request("PATCH", "/api/users/me/phone-number", user),
    ),
    false,
  );
  assert.equal(
    requiresPhoneSetup(request("GET", "/api/users?limit=10", user)),
    true,
  );
});

test("accounts with a phone number and administrators are not blocked", () => {
  assert.equal(
    requiresPhoneSetup(
      request("GET", "/api/users?limit=10", {
        userType: "rider",
        phoneNumber: "+233501234567",
      }),
    ),
    false,
  );
  assert.equal(
    requiresPhoneSetup(
      request("GET", "/api/users?limit=10", {
        userType: "admin",
        phoneNumber: null,
      }),
    ),
    false,
  );
});
