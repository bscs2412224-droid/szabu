import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import "../config.js"; // loads backend/.env

export interface DevEmail {
  id: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  code?: string;
  timestamp: Date;
}

// In-memory dev inbox store for rapid verification & UI preview
class EmailService {
  private inMemoryInbox: DevEmail[] = [];
  private transporter: Transporter | null = null;

  constructor() {
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    }
  }

  async sendVerificationCode(to: string, code: string, purpose: "SIGNUP" | "PASSWORD_RESET"): Promise<void> {
    const isSignup = purpose === "SIGNUP";
    const subject = isSignup
      ? "SZABIST Szab U - Sign Up Verification Code"
      : "SZABIST Szab U - Password Reset Code";

    const text = isSignup
      ? `Your SZABIST Szab U sign-up verification code is: ${code}. This code is valid for 10 minutes and can only be used once.`
      : `Your SZABIST Szab U password reset verification code is: ${code}. This code is valid for 10 minutes and can only be used once.`;

    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #0f172a; margin: 0; font-size: 24px;">SZABIST Szab U</h2>
          <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Official Academic Portal Authentication</p>
        </div>
        <div style="padding: 20px; background: #f8fafc; border-radius: 8px; border-left: 4px solid #2563eb; margin-bottom: 20px;">
          <p style="margin: 0; color: #334155; font-size: 15px;">
            ${isSignup ? "You have initiated account creation with your SZABIST email." : "A password reset request was received for your SZABIST account."}
          </p>
          <div style="margin: 20px 0; text-align: center;">
            <span style="display: inline-block; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #1e40af; background: #dbeafe; padding: 12px 28px; border-radius: 8px; border: 1px dashed #3b82f6;">
              ${code}
            </span>
          </div>
          <p style="margin: 0; font-size: 13px; color: #64748b; text-align: center;">
            This one-time code expires in <strong>10 minutes</strong> and will be cancelled after 5 incorrect attempts.
          </p>
        </div>
        <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
          If you did not make this request, please contact the SZABIST System Administrator immediately.
        </p>
      </div>
    `;

    const emailRecord: DevEmail = {
      id: Math.random().toString(36).substring(2, 9),
      to,
      subject,
      text,
      html,
      code,
      timestamp: new Date(),
    };

    // Without SMTP (development) the code is printed and kept in the admin-only dev inbox so sign-up can be
    // tried without sending email. With real email on, codes never appear in the logs or in memory.
    if (!this.transporter) {
      this.inMemoryInbox.unshift(emailRecord);
      if (this.inMemoryInbox.length > 50) this.inMemoryInbox.pop();

      console.log(`\n========================================`);
      console.log(`[DEV: NO SMTP CONFIGURED] Email to ${to}`);
      console.log(`[SUBJECT] ${subject}`);
      console.log(`[VERIFICATION CODE] >>> ${code} <<<`);
      console.log(`========================================\n`);
    }

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: `"SZABIST Szab U" <${process.env.SMTP_FROM || "no-reply@szabist.edu.pk"}>`,
          to,
          subject,
          text,
          html,
        });
      } catch (err) {
        console.error("Failed to send real SMTP email, fallback to dev inbox:", err);
      }
    }
  }

  async sendPasswordChangedNotice(to: string, szabistId: string): Promise<void> {
    const subject = "SZABIST Szab U - Security Notice: Password Changed";
    const text = `The password for your SZABIST account (${szabistId}) was successfully changed. If you did not perform this action, contact IT immediately.`;
    const html = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
        <h2 style="color: #0f172a; margin-top: 0;">Password Changed Successfully</h2>
        <p style="color: #334155; font-size: 15px;">
          The password for your SZABIST account <strong>${szabistId}</strong> was recently updated. All older active sessions have been terminated.
        </p>
        <p style="font-size: 13px; color: #64748b;">
          Time of change: ${new Date().toLocaleString()}
        </p>
        <div style="padding: 12px; background: #fef2f2; border-radius: 6px; border-left: 4px solid #ef4444; margin-top: 16px;">
          <p style="margin: 0; color: #991b1b; font-size: 13px;">
            If you did not authorize this change, please report it to the System Administrator right away.
          </p>
        </div>
      </div>
    `;

    const emailRecord: DevEmail = {
      id: Math.random().toString(36).substring(2, 9),
      to,
      subject,
      text,
      html,
      timestamp: new Date(),
    };

    this.inMemoryInbox.unshift(emailRecord);

    console.log(`\n========================================`);
    console.log(`[SECURITY EMAIL NOTICE] To: ${to} (User: ${szabistId})`);
    console.log(`[STATUS] Password Changed Notice Sent`);
    console.log(`========================================\n`);

    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: `"SZABIST Szab U" <${process.env.SMTP_FROM || "no-reply@szabist.edu.pk"}>`,
          to,
          subject,
          text,
          html,
        });
      } catch (err) {
        console.error("Failed to send notice via SMTP:", err);
      }
    }
  }

  getInbox(): DevEmail[] {
    return this.inMemoryInbox;
  }

  clearInbox(): void {
    this.inMemoryInbox = [];
  }
}

export const emailService = new EmailService();
export default emailService;
