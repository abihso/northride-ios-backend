export const toSafeUser = (user) => {
  const { passwordHash, ...safeUser } = user;
  return {
    ...safeUser,
    riderOnboardingCompleted: user.riderOnboardingCompleted === true,
  };
};

export const registrationRole = (value = "customer") => {
  if (value !== "customer" && value !== "rider") {
    const error = new Error("Choose a client or rider account.");
    error.status = 400;
    throw error;
  }
  return value;
};

export const normalizeIdentifier = (value) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const saveSession = (req) =>
  new Promise((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });

export const establishSession = async (req, user) => {
  await new Promise((resolve, reject) => {
    req.logIn(user, (error) => (error ? reject(error) : resolve()));
  });
  await saveSession(req);
};
