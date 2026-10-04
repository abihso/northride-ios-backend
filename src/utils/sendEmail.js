import nodemailer from "nodemailer";
// Create transporter outside the function for reuse
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Function that receives verification code
async function sendVerificationEmail(verificationCode, recipientEmail) {
  try {
    const info = await transporter.sendMail({
      to: recipientEmail,
      subject: "Your Verification Code",
      html: `
        <h1>Your Verification Code</h1>
        <p>Please use the following 6-digit code to verify your account:</p>
        <h2 style="font-size: 32px; color: #4CAF50; letter-spacing: 5px; padding: 10px; background: #f0f0f0; display: inline-block;">
          ${verificationCode}
        </h2>
        <p>This code will expire in 10 minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
      `
    });
    
    console.log("Email sent successfully:", info.messageId);
    return { success: true, messageId: info.messageId };
    
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
}

export default sendVerificationEmail

// Usage
// const verificationCode = "482716"; // Your 6-digit code
// sendVerificationEmail(verificationCode, "pwatiosolomon@gmail.com");