// Notification Service - sends email/SMS alerts
import { storage } from "./storage";
import { emailService } from "./emailService";
import type { Notification, NotificationPreferences, User } from "@shared/schema";

// Twilio for SMS (optional)
let twilioClient: any = null;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  try {
    const twilio = require("twilio");
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    console.log("[notifications] Twilio SMS enabled");
  } catch {
    console.log("[notifications] Twilio not available, SMS disabled");
  }
}

interface CreateNotificationParams {
  userId: string;
  companyId?: string;
  type: string;
  title: string;
  message: string;
  relatedType?: string;
  relatedId?: string;
}

export class NotificationService {
  // Create a notification and optionally send email/SMS
  async createAndSend(params: CreateNotificationParams): Promise<Notification> {
    // Create the notification in the database
    const notification = await storage.createNotification({
      userId: params.userId,
      companyId: params.companyId || null,
      type: params.type,
      title: params.title,
      message: params.message,
      relatedType: params.relatedType || null,
      relatedId: params.relatedId || null,
    });

    // Get user's notification preferences
    const prefs = await storage.getNotificationPreferences(params.userId);
    const user = await this.getUserById(params.userId);

    if (!user) return notification;

    // Check if we should send email
    const shouldSendEmail = this.shouldSendEmail(params.type, prefs);
    if (shouldSendEmail && user.email) {
      await this.sendEmailNotification(user.email, params.title, params.message, notification.id);
    }

    // Check if we should send SMS
    const shouldSendSms = this.shouldSendSms(params.type, prefs);
    if (shouldSendSms && prefs?.smsPhoneNumber) {
      await this.sendSmsNotification(prefs.smsPhoneNumber, params.title, notification.id);
    }

    return notification;
  }

  private async getUserById(userId: string): Promise<User | undefined> {
    // We need to get user by ID, but storage only has getUserByFirebaseUid
    // For now, let's add a simple query
    const { db } = await import("./db");
    const { users } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    const result = await db.select().from(users).where(eq(users.id, userId));
    return result[0];
  }

  private shouldSendEmail(type: string, prefs: NotificationPreferences | undefined): boolean {
    if (!prefs) return true; // Default to sending emails

    switch (type) {
      case "payment_received":
        return prefs.emailPaymentReceived ?? true;
      case "invoice_due":
        return prefs.emailInvoiceDue ?? true;
      case "invoice_overdue":
        return prefs.emailInvoiceOverdue ?? true;
      case "estimate_viewed":
      case "estimate_accepted":
        return prefs.emailEstimateViewed ?? true;
      case "daily_log_reminder":
        return prefs.emailDailyLogReminder ?? false;
      default:
        return true;
    }
  }

  private shouldSendSms(type: string, prefs: NotificationPreferences | undefined): boolean {
    if (!prefs?.smsEnabled) return false;

    switch (type) {
      case "payment_received":
        return prefs.smsPaymentReceived ?? false;
      case "invoice_overdue":
        return prefs.smsInvoiceOverdue ?? false;
      default:
        return false;
    }
  }

  private async sendEmailNotification(
    to: string,
    title: string,
    message: string,
    notificationId: string
  ): Promise<void> {
    try {
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #f8f9fa; padding: 30px; border-radius: 8px;">
            <h2 style="color: #1a1a1a; margin-bottom: 16px;">${title}</h2>
            <p style="color: #666;">${message}</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
            <p style="font-size: 12px; color: #999;">
              This notification was sent from JobCost AI.
              <a href="${process.env.APP_URL || "http://localhost:5050"}/settings/notifications">Manage your notification preferences</a>
            </p>
          </div>
        </body>
        </html>
      `;

      const result = await emailService.send({
        to,
        subject: `JobCost AI: ${title}`,
        html,
        text: `${title}\n\n${message}`,
      });

      if (result.success) {
        // Update notification to mark email sent
        const { db } = await import("./db");
        const { notifications } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        await db.update(notifications)
          .set({ emailSent: true, emailSentAt: new Date() })
          .where(eq(notifications.id, notificationId));
      }
    } catch (error) {
      console.error("[notifications] Email send error:", error);
    }
  }

  private async sendSmsNotification(
    phoneNumber: string,
    title: string,
    notificationId: string
  ): Promise<void> {
    if (!twilioClient) return;

    try {
      await twilioClient.messages.create({
        body: `JobCost AI: ${title}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phoneNumber,
      });

      // Update notification to mark SMS sent
      const { db } = await import("./db");
      const { notifications } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      await db.update(notifications)
        .set({ smsSent: true, smsSentAt: new Date() })
        .where(eq(notifications.id, notificationId));
    } catch (error) {
      console.error("[notifications] SMS send error:", error);
    }
  }

  // Helper methods for common notification types
  async notifyPaymentReceived(params: {
    userId: string;
    companyId: string;
    projectName: string;
    amount: string;
    paymentId: string;
  }): Promise<Notification> {
    return this.createAndSend({
      userId: params.userId,
      companyId: params.companyId,
      type: "payment_received",
      title: "Payment Received",
      message: `You received a payment of $${params.amount} for ${params.projectName}`,
      relatedType: "payment",
      relatedId: params.paymentId,
    });
  }

  async notifyInvoiceDue(params: {
    userId: string;
    companyId: string;
    projectName: string;
    invoiceNumber: string;
    amount: string;
    dueDate: string;
    invoiceId: string;
  }): Promise<Notification> {
    return this.createAndSend({
      userId: params.userId,
      companyId: params.companyId,
      type: "invoice_due",
      title: "Invoice Due Soon",
      message: `Invoice #${params.invoiceNumber} for ${params.projectName} ($${params.amount}) is due on ${params.dueDate}`,
      relatedType: "invoice",
      relatedId: params.invoiceId,
    });
  }

  async notifyInvoiceOverdue(params: {
    userId: string;
    companyId: string;
    projectName: string;
    invoiceNumber: string;
    amount: string;
    daysOverdue: number;
    invoiceId: string;
  }): Promise<Notification> {
    return this.createAndSend({
      userId: params.userId,
      companyId: params.companyId,
      type: "invoice_overdue",
      title: "Invoice Overdue",
      message: `Invoice #${params.invoiceNumber} for ${params.projectName} ($${params.amount}) is ${params.daysOverdue} days overdue`,
      relatedType: "invoice",
      relatedId: params.invoiceId,
    });
  }

  async notifyEstimateViewed(params: {
    userId: string;
    companyId: string;
    estimateNumber: string;
    clientName: string;
    estimateId: string;
  }): Promise<Notification> {
    return this.createAndSend({
      userId: params.userId,
      companyId: params.companyId,
      type: "estimate_viewed",
      title: "Estimate Viewed",
      message: `${params.clientName} viewed your Estimate #${params.estimateNumber}`,
      relatedType: "estimate",
      relatedId: params.estimateId,
    });
  }

  async notifyDailyLogReminder(params: {
    userId: string;
    companyId: string;
    projectName: string;
    projectId: string;
  }): Promise<Notification> {
    return this.createAndSend({
      userId: params.userId,
      companyId: params.companyId,
      type: "daily_log_reminder",
      title: "Daily Log Reminder",
      message: `Don't forget to fill out today's daily log for ${params.projectName}`,
      relatedType: "project",
      relatedId: params.projectId,
    });
  }
}

export const notificationService = new NotificationService();
