const phoneSetupAllowedRoutes = new Set([
  "GET /auth/me",
  "POST /auth/logout",
  "PATCH /users/me/phone-number",
]);

export const requiresPhoneSetup = (request) =>
  ["customer", "rider"].includes(request.user?.userType) &&
  !request.user?.phoneNumber?.trim() &&
  !phoneSetupAllowedRoutes.has(
    `${request.method} ${request.originalUrl.split("?")[0].replace(/^\/api/, "")}`,
  );
