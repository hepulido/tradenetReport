// Email service for sending invoices and notifications
// Supports multiple providers: SendGrid, Resend, or basic SMTP

interface EmailConfig {
  provider: "sendgrid" | "resend" | "smtp" | "console";
  apiKey?: string;
  fromEmail: string;
  fromName: string;
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }>;
}

interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

class EmailService {
  private config: EmailConfig;

  constructor() {
    this.config = {
      provider: (process.env.EMAIL_PROVIDER as EmailConfig["provider"]) || "console",
      apiKey: process.env.EMAIL_API_KEY || process.env.SENDGRID_API_KEY || process.env.RESEND_API_KEY,
      fromEmail: process.env.EMAIL_FROM || "noreply@jobcostai.com",
      fromName: process.env.EMAIL_FROM_NAME || "JobCost AI",
    };
  }

  async send(options: EmailOptions): Promise<SendResult> {
    try {
      switch (this.config.provider) {
        case "sendgrid":
          return this.sendWithSendGrid(options);
        case "resend":
          return this.sendWithResend(options);
        case "console":
        default:
          return this.sendToConsole(options);
      }
    } catch (error: any) {
      console.error("[email] Send error:", error);
      return { success: false, error: error.message };
    }
  }

  private async sendWithSendGrid(options: EmailOptions): Promise<SendResult> {
    if (!this.config.apiKey) {
      throw new Error("SendGrid API key not configured");
    }

    const payload: any = {
      personalizations: [{ to: [{ email: options.to }] }],
      from: { email: this.config.fromEmail, name: this.config.fromName },
      subject: options.subject,
      content: [
        { type: "text/plain", value: options.text || options.html.replace(/<[^>]*>/g, "") },
        { type: "text/html", value: options.html },
      ],
    };

    if (options.attachments?.length) {
      payload.attachments = options.attachments.map((a) => ({
        content: a.content.toString("base64"),
        filename: a.filename,
        type: a.contentType,
        disposition: "attachment",
      }));
    }

    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SendGrid error: ${response.status} - ${errorText}`);
    }

    return {
      success: true,
      messageId: response.headers.get("x-message-id") || undefined,
    };
  }

  private async sendWithResend(options: EmailOptions): Promise<SendResult> {
    if (!this.config.apiKey) {
      throw new Error("Resend API key not configured");
    }

    const payload: any = {
      from: `${this.config.fromName} <${this.config.fromEmail}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    };

    if (options.attachments?.length) {
      payload.attachments = options.attachments.map((a) => ({
        filename: a.filename,
        content: a.content.toString("base64"),
      }));
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Resend error: ${errorData.message || response.status}`);
    }

    const data = await response.json();
    return { success: true, messageId: data.id };
  }

  private async sendToConsole(options: EmailOptions): Promise<SendResult> {
    console.log("=".repeat(60));
    console.log("[EMAIL - CONSOLE MODE]");
    console.log(`To: ${options.to}`);
    console.log(`From: ${this.config.fromName} <${this.config.fromEmail}>`);
    console.log(`Subject: ${options.subject}`);
    console.log("-".repeat(60));
    console.log(options.text || options.html.replace(/<[^>]*>/g, "").slice(0, 500) + "...");
    if (options.attachments?.length) {
      console.log(`Attachments: ${options.attachments.map((a) => a.filename).join(", ")}`);
    }
    console.log("=".repeat(60));
    return { success: true, messageId: `console-${Date.now()}` };
  }

  isConfigured(): boolean {
    return this.config.provider !== "console" && !!this.config.apiKey;
  }

  getProvider(): string {
    return this.config.provider;
  }
}

export const emailService = new EmailService();

// Email templates
export function getInvoiceEmailTemplate(data: {
  companyName: string;
  invoiceNumber: string;
  amount: string;
  dueDate?: string;
  projectName: string;
  recipientName?: string;
}): { subject: string; html: string; text: string } {
  const subject = `Invoice #${data.invoiceNumber} from ${data.companyName}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; padding: 30px; border-radius: 8px;">
    <h1 style="color: #1a1a1a; margin-bottom: 20px;">Invoice #${data.invoiceNumber}</h1>

    <p>Dear ${data.recipientName || "Valued Client"},</p>

    <p>Please find attached the invoice for the following project:</p>

    <div style="background: white; padding: 20px; border-radius: 4px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee;"><strong>Project:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee;">${data.projectName}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee;"><strong>Invoice #:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee;">${data.invoiceNumber}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee;"><strong>Amount Due:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; font-size: 18px; font-weight: bold; color: #2563eb;">${data.amount}</td>
        </tr>
        ${data.dueDate ? `
        <tr>
          <td style="padding: 10px 0;"><strong>Due Date:</strong></td>
          <td style="padding: 10px 0;">${data.dueDate}</td>
        </tr>
        ` : ""}
      </table>
    </div>

    <p>Please review the attached invoice and process payment at your earliest convenience.</p>

    <p>If you have any questions, please don't hesitate to contact us.</p>

    <p>Thank you for your business!</p>

    <p style="margin-top: 30px; color: #666;">
      Best regards,<br>
      <strong>${data.companyName}</strong>
    </p>
  </div>

  <p style="margin-top: 20px; font-size: 12px; color: #999; text-align: center;">
    This email was sent from JobCost AI
  </p>
</body>
</html>
`;

  const text = `
Invoice #${data.invoiceNumber} from ${data.companyName}

Dear ${data.recipientName || "Valued Client"},

Please find attached the invoice for the following project:

Project: ${data.projectName}
Invoice #: ${data.invoiceNumber}
Amount Due: ${data.amount}
${data.dueDate ? `Due Date: ${data.dueDate}` : ""}

Please review the attached invoice and process payment at your earliest convenience.

If you have any questions, please don't hesitate to contact us.

Thank you for your business!

Best regards,
${data.companyName}
`;

  return { subject, html, text };
}

export function getEstimateEmailTemplate(data: {
  companyName: string;
  estimateNumber: string;
  amount: string;
  validUntil?: string;
  projectName: string;
  recipientName?: string;
}): { subject: string; html: string; text: string } {
  const subject = `Estimate #${data.estimateNumber} from ${data.companyName}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; padding: 30px; border-radius: 8px;">
    <h1 style="color: #1a1a1a; margin-bottom: 20px;">Estimate #${data.estimateNumber}</h1>

    <p>Dear ${data.recipientName || "Valued Client"},</p>

    <p>Thank you for your interest. Please find attached our estimate for the following project:</p>

    <div style="background: white; padding: 20px; border-radius: 4px; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee;"><strong>Project:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee;">${data.projectName}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee;"><strong>Estimate #:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee;">${data.estimateNumber}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee;"><strong>Total:</strong></td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; font-size: 18px; font-weight: bold; color: #2563eb;">${data.amount}</td>
        </tr>
        ${data.validUntil ? `
        <tr>
          <td style="padding: 10px 0;"><strong>Valid Until:</strong></td>
          <td style="padding: 10px 0;">${data.validUntil}</td>
        </tr>
        ` : ""}
      </table>
    </div>

    <p>Please review the attached estimate. If you have any questions or would like to proceed, please let us know.</p>

    <p>We look forward to working with you!</p>

    <p style="margin-top: 30px; color: #666;">
      Best regards,<br>
      <strong>${data.companyName}</strong>
    </p>
  </div>

  <p style="margin-top: 20px; font-size: 12px; color: #999; text-align: center;">
    This email was sent from JobCost AI
  </p>
</body>
</html>
`;

  const text = `
Estimate #${data.estimateNumber} from ${data.companyName}

Dear ${data.recipientName || "Valued Client"},

Thank you for your interest. Please find attached our estimate for the following project:

Project: ${data.projectName}
Estimate #: ${data.estimateNumber}
Total: ${data.amount}
${data.validUntil ? `Valid Until: ${data.validUntil}` : ""}

Please review the attached estimate. If you have any questions or would like to proceed, please let us know.

We look forward to working with you!

Best regards,
${data.companyName}
`;

  return { subject, html, text };
}
