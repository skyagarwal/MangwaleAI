import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import * as Handlebars from 'handlebars';

const OTP_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6f9; margin: 0; padding: 0; }
    .container { max-width: 480px; margin: 40px auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); overflow: hidden; }
    .header { background: #2563eb; padding: 24px; text-align: center; }
    .header h1 { color: #fff; margin: 0; font-size: 22px; }
    .body { padding: 32px 24px; }
    .otp-box { background: #f0f5ff; border: 2px dashed #2563eb; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0; }
    .otp-code { font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #1e40af; }
    .footer { padding: 16px 24px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
    p { color: #475569; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Mangwale Admin</h1>
    </div>
    <div class="body">
      <p>Hi {{name}},</p>
      <p>You requested a password reset for your admin account. Use the OTP below to verify your identity:</p>
      <div class="otp-box">
        <div class="otp-code">{{otp}}</div>
      </div>
      <p>This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
      <p>If you did not request this, you can safely ignore this email.</p>
    </div>
    <div class="footer">
      <p>Mangwale Technologies Pvt. Ltd.</p>
    </div>
  </div>
</body>
</html>
`;

@Injectable()
export class AdminEmailService {
  private readonly logger = new Logger(AdminEmailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private readonly otpTemplate: HandlebarsTemplateDelegate;
  private readonly fromAddress: string;

  constructor(private readonly configService: ConfigService) {
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    const smtpPort = parseInt(this.configService.get<string>('SMTP_PORT') || '465', 10);
    const smtpUser = this.configService.get<string>('SMTP_USER');
    const smtpPass = this.configService.get<string>('SMTP_PASS');
    this.fromAddress = this.configService.get<string>('SMTP_FROM') || 'noreply@mangwale.ai';

    if (smtpHost && smtpUser && smtpPass) {
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass },
      });
      this.logger.log(`SMTP configured: ${smtpHost}:${smtpPort}`);
    } else {
      this.logger.warn('SMTP not configured — OTP codes will be logged to console only');
    }

    this.otpTemplate = Handlebars.compile(OTP_EMAIL_TEMPLATE);
  }

  async sendOtp(email: string, name: string, otp: string): Promise<boolean> {
    const html = this.otpTemplate({ name: name || 'Admin', otp });

    if (!this.transporter) {
      this.logger.warn(`[DEV] OTP for ${email}: ${otp}`);
      return true;
    }

    try {
      await this.transporter.sendMail({
        from: `"Mangwale Admin" <${this.fromAddress}>`,
        to: email,
        subject: 'Password Reset OTP - Mangwale Admin',
        html,
      });
      this.logger.log(`OTP email sent to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send OTP email to ${email}: ${error.message}`);
      return false;
    }
  }
}
