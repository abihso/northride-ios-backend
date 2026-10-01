import { eq, or } from "drizzle-orm";
import passport from "passport";
import { Strategy } from "passport-local";
import db from "../db/index.js";
import { users } from "../db/schema.js";
import verifyPassword from "../utils/verifypassword.js";

passport.serializeUser((user, done) => {
  const id = user.userId;
  done(null, id);
});
passport.deserializeUser(async (id, done) => {
  try {
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.userId, id))
      .limit(1);
    if (existingUser.length === 0) {
      throw new Error("user not found");
    }
    done(null, existingUser[0]);
  } catch (error) {
    done(error, null);
  }
});
export default passport.use(
  new Strategy({ usernameField: "email" }, async (username, password, done) => {
    try {
      const existingUser = await db
        .select()
        .from(users)
        .where(
          or(
            eq(users.email, username.toLowerCase()),
            eq(users.phoneNumber, username),
          ),
        )
        .limit(1);
      if (existingUser.length === 0) {
        throw new Error("user not found");
      }
      if (!existingUser[0].isActive || !existingUser[0].isVerified) {
        throw new Error("Account is inactive or not verified");
      }
      if (!verifyPassword(existingUser[0].passwordHash, password)) {
        throw new Error("Wrong credentials");
      }
      const user = existingUser[0];
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  }),
);
