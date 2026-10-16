const authError = (message, status = 401) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const fetchJson = async (url, provider) => {
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch {
    throw authError(
      `Could not verify your ${provider} account. Please try again.`,
      503,
    );
  }
  if (!response.ok) {
    throw authError(`The ${provider} sign-in token is invalid.`);
  }
  try {
    return await response.json();
  } catch {
    throw authError(`Could not verify your ${provider} account.`, 502);
  }
};

export const verifyGoogleIdentity = async (
  idToken,
  {
    fetchJsonFn = fetchJson,
    clientIds = process.env.GOOGLE_OAUTH_CLIENT_IDS ?? "",
    now = Date.now,
  } = {},
) => {
  const allowedClientIds = clientIds
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!allowedClientIds.length) {
    throw authError("Google sign-in is not configured on the server.", 503);
  }

  const claims = await fetchJsonFn(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    "Google",
  );
  const expiry = Number(claims.exp) * 1000;
  const verifiedEmail =
    claims.email_verified === true || claims.email_verified === "true";
  if (
    typeof claims.sub !== "string" ||
    !claims.sub ||
    typeof claims.email !== "string" ||
    !verifiedEmail ||
    !allowedClientIds.includes(claims.aud) ||
    !["accounts.google.com", "https://accounts.google.com"].includes(
      claims.iss,
    ) ||
    !Number.isFinite(expiry) ||
    expiry <= now()
  ) {
    throw authError("The Google sign-in token is invalid.");
  }
  return {
    subject: claims.sub,
    email: claims.email,
    fullName: typeof claims.name === "string" ? claims.name : null,
  };
};

export const verifyFacebookIdentity = async (
  accessToken,
  {
    fetchJsonFn = fetchJson,
    appId = process.env.FACEBOOK_APP_ID,
    appSecret = process.env.FACEBOOK_APP_SECRET,
  } = {},
) => {
  if (!appId || !appSecret) {
    throw authError("Facebook sign-in is not configured on the server.", 503);
  }
  const appAccessToken = `${appId}|${appSecret}`;
  const debugUrl = new URL("https://graph.facebook.com/debug_token");
  debugUrl.searchParams.set("input_token", accessToken);
  debugUrl.searchParams.set("access_token", appAccessToken);
  const debug = await fetchJsonFn(debugUrl.toString(), "Facebook");
  const expiresAt = Number(debug.data?.expires_at);
  if (
    debug.data?.is_valid !== true ||
    String(debug.data.app_id) !== String(appId) ||
    typeof debug.data.user_id !== "string" ||
    (debug.data.expires_at !== undefined &&
      (!Number.isFinite(expiresAt) || expiresAt * 1000 <= Date.now()))
  ) {
    throw authError("The Facebook sign-in token is invalid.");
  }

  const profileUrl = new URL("https://graph.facebook.com/me");
  profileUrl.searchParams.set("fields", "id,name,email");
  profileUrl.searchParams.set("access_token", accessToken);
  const profile = await fetchJsonFn(profileUrl.toString(), "Facebook");
  if (
    profile.id !== debug.data.user_id ||
    typeof profile.email !== "string" ||
    !profile.email.trim()
  ) {
    throw authError(
      "Facebook did not provide a verified email address. Use another sign-in method.",
    );
  }
  return {
    subject: profile.id,
    email: profile.email,
    fullName: typeof profile.name === "string" ? profile.name : null,
  };
};
