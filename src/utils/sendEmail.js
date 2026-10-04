const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

export const createVerificationEmailSender = ({
  env = process.env,
  fetchEmail = globalThis.fetch,
} = {}) =>
  async function sendVerificationEmail(verificationCode, recipientEmail) {
    const { BREVO_API_KEY, BREVO_FROM_EMAIL } = env;
    if (!BREVO_API_KEY || !BREVO_FROM_EMAIL) {
      throw new Error(
        "Email delivery is not configured. Set BREVO_API_KEY and BREVO_FROM_EMAIL.",
      );
    }

    try {
      const response = await fetchEmail(BREVO_API_URL, {
        method: "POST",
        headers: {
          "api-key": BREVO_API_KEY,
          accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: {
            name: env.BREVO_FROM_NAME || "NorthRide",
            email: BREVO_FROM_EMAIL,
          },
          to: [{ email: recipientEmail }],
          subject: "Your NorthRide verification code",
          textContent: `Your NorthRide verification code is ${verificationCode}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
          htmlContent: `
            <h1>Your NorthRide Verification Code</h1>
            <p>Please use this 6-digit code to verify your account:</p>
            <h2 style="font-size: 32px; color: #4CAF50; letter-spacing: 5px; padding: 10px; background: #f0f0f0; display: inline-block;">
              ${verificationCode}
            </h2>
            <p>This code will expire in 10 minutes.</p>
            <p>If you didn't request this, please ignore this email.</p>
          `,
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!response.ok) {
        throw new Error(`Brevo email API returned HTTP ${response.status}.`);
      }

      const result = await response.json();
      console.log("Verification email accepted:", result.messageId);
      return { success: true, messageId: result.messageId };
    } catch (error) {
      console.error("Error sending verification email:", error.message);
      throw error;
    }
  };

export default createVerificationEmailSender();
