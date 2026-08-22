import { Router } from "express";
import "../strategies/index.js";
import passport from "passport";
import { validateLogin } from "../validation/index.js";
const authRoute = Router();

authRoute.post("/login",validateLogin, (req, res, next) => {

  passport.authenticate("local", (err, user, info) => {
    if (err) {
      return res.status(401).json({ message: err.message || "Authentication error" });
    }
     
    if (!user) {
      return res.status(401).json({ 
        message: info?.message || "Invalid credentials" 
      });
    }
    
    // Log the user in
    req.logIn(user, (loginErr) => {
      if (loginErr) {
        return res.status(500).json({ message: loginErr.message });
      }
      user.passwordHash = ""
      
    
      return res.status(200).json({ 
        success: true, 
        user,
        message: "Login successful"
      });
    });
  })(req, res, next);
});

export default authRoute;