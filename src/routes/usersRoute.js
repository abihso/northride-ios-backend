import { Router } from "express";
import { eq, and, or, like, between, desc, asc, sql } from "drizzle-orm";
import * as schema from "../db/schema.js";
import hashpassword from "../utils/hashpassword.js";
import sendVerificationEmail from "../utils/sendEmail.js";
import generateSixDigitCode from "../utils/sixdigits.js";
import db from "../db/index.js";
import { users } from "../db/schema.js";
import sendSms from "../utils/sms.js";
const userRoute = Router()
import checkEmailOrPhone from "../utils/checkEmailorNumber.js";

userRoute.get("/users", async (req, res) => {
  try {
    const { limit = 100, offset = 0, userType } = query;
    let query = db.select().from(schema.users);
    
    if (userType) {
      query = query.where(eq(schema.users.userType, userType));
    }
    
    const users = await query.limit(parseInt(limit)).offset(parseInt(offset));
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

userRoute.get("/users/:id", async (req, res) => {
  try {
    const [user] = await db.select()
      .from(schema.users)
      .where(eq(schema.users.userId, parseInt(params.id)));
    
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

userRoute.post("/users", async (req, res) => {
  try {
    const { email, passwordHash, userType } = req.body;
    const emailOrPhone = checkEmailOrPhone(email);

    const existingUser = await db.select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    
    if (existingUser.length > 0) {
      return res.status(409).json({ 
        success: false, 
        message: "User with this email already exists" 
      });
    }
    // Insert new user
    const [user] = await db.insert(users).values({
      email :  emailOrPhone == "Phone" ? email : email.toLowerCase(),
      phoneNumber : emailOrPhone == "Phone" ? email : "not set yet",
      passwordHash : hashpassword(passwordHash),
      userType: userType || "customer",
      isVerified: false,
      isActive: true,
    }).returning();
    // Generate verification code
    const verificationCode = generateSixDigitCode();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes
    
    // Store verification data in session (not in-memory map)
    req.session.verification = {
      email: email,
      code: verificationCode,
      expiresAt: expiresAt,
      attempts: 0,
      userId: user.userId
    };
    
    // Save session before sending email
    req.session.save(async (err) => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).json({
          success: false,
          message: "Failed to store verification data"
        });
      }
      
       emailOrPhone == "Phone" ? await sendSms( {to:email,text:verificationCode}) :  await sendVerificationEmail(verificationCode, email);

      
      // Remove password from response
      const { passwordHash: _, ...userWithoutPassword } = user;
      
      res.status(201).json({
        success: true,
        message: "User created successfully. Please check your email for verification code.",
        data: userWithoutPassword,
        requiresVerification: true
      });
    });
    
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});
userRoute.post("/verify-email", async (req, res) => {
  try {
    let { email, code } = req.body;
   console.log(email,code)
    if (!email || !code) {
      return res.status(400).json({
        success: false,
        message: "Email and verification code are required"
      });
    }
  if (Array.isArray(code)) {
      code = code.join('');
    }
    // Check if user exists
    const existingUser = await db.select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const user = existingUser[0];

    // Check if user is already verified
    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "Email already verified"
      });
    }

    const verificationData = req.session.verification;
    if (!verificationData) {
      return res.status(400).json({
        success: false,
        message: "No verification code found. Please request a new one."
      });
    }

    // Check if the email matches
    if (verificationData.email !== email) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification request"
      });
    }

    // Check if code has expired (10 minutes)
    if (Date.now() > verificationData.expiresAt) {
      // Clear session data
      delete req.session.verification;
      await req.session.save();
      
      return res.status(400).json({
        success: false,
        message: "Verification code has expired. Please request a new one."
      });
    }

    // Track verification attempts (max 5 attempts)
    if (verificationData.attempts >= 5) {
      delete req.session.verification;
      await req.session.save();
      
      return res.status(400).json({
        success: false,
        message: "Too many failed attempts. Please request a new verification code."
      });
    }

    // Verify the code
    if (verificationData.code !== Number(code)) {
      verificationData.attempts += 1;
      req.session.verification = verificationData;
      await req.session.save();

      return res.status(400).json({
        success: false,
        message: `Invalid verification code. ${5 - verificationData.attempts} attempts remaining.`
      });
    }

    // Update user as verified
    const [updatedUser] = await db.update(users)
      .set({
        isVerified: true,
        updatedAt: new Date()
      })
      .where(eq(users.email, email))
      .returning();

    // Clear verification data from session
    delete req.session.verification;
    await req.session.save();

    const { passwordHash: _, ...userWithoutPassword } = updatedUser;

    res.status(200).json({
      success: true,
      message: "Email verified successfully!",
      data: userWithoutPassword
    });

  } catch (error) {
    console.error("Error verifying email:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});

userRoute.post("/resend-verification", async (req, res) => {
  try {
    const { email } = req.body;
const emailOrPhone = checkEmailOrPhone(email);
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }

    // Check if user exists
    const existingUser = await db.select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUser.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const user = existingUser[0];

    // Check if user is already verified
    if (user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "Email already verified"
      });
    }

    // Generate new verification code
    const newCode = generateSixDigitCode();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store new verification data in session
    req.session.verification = {
      email: email,
      code: newCode,
      expiresAt: expiresAt,
      attempts: 0,
      userId: user.id
    };

    await req.session.save();

    emailOrPhone == "Phone" ? await sendSms( {to:email,text:newCode}) :   await sendVerificationEmail(newCode, email);

    res.status(200).json({
      success: true,
      message: `New verification code sent to your ${emailOrPhone.toLowerCase()}. Please check your ${emailOrPhone.toLowerCase()}.`
    });

  } catch (error) {
    console.error("Error resending verification code:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
});
userRoute.put("/users/:id", async (req, res) => {
  try {
    const { fullName, email, phoneNumber, profilePicture, userType, isActive } = body;
    
    const [user] = await db.update(schema.users)
      .set({
        fullName,
        email,
        phoneNumber,
        profilePicture,
        userType,
        isActive,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.userId, parseInt(params.id)))
      .returning();
    
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

userRoute.delete("/users/:id", async (req, res) => {
  try {
    const [user] = await db.delete(schema.users)
      .where(eq(schema.users.userId, parseInt(params.id)))
      .returning();
    
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

userRoute.post("/users/login/:id", async (req, res) => {
  try {
    const [user] = await db.update(schema.users)
      .set({ lastLogin: new Date() })
      .where(eq(schema.users.userId, parseInt(params.id)))
      .returning();
    
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});




export default userRoute