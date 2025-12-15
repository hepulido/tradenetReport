import type { CompanySettings } from "@shared/schema";

interface NotificationPayload {
  subject: string;
  message: string;
  html?: string;
}

interface NotificationResult {
  success: boolean;
  provider: string;
  error?: string;
}

export async function sendEmail(
  recipients: string[],
  payload: NotificationPayload
): Promise<NotificationResult> {
  if (recipients.length === 0) {
    return { success: false, provider: "email", error: "No recipients provided" };
  }

  const hasEmailConfig = process.env.EMAIL_HOST && 
                         process.env.EMAIL_USER && 
                         process.env.EMAIL_PASS;

  if (!hasEmailConfig) {
    console.log(`[Email Stub] Would send to: ${recipients.join(", ")}`);
    console.log(`[Email Stub] Subject: ${payload.subject}`);
    console.log(`[Email Stub] Message: ${payload.message.substring(0, 100)}...`);
    return { 
      success: true, 
      provider: "email", 
      error: "EMAIL_HOST/EMAIL_USER/EMAIL_PASS not configured - stub mode" 
    };
  }

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || "587"),
      secure: process.env.EMAIL_SECURE === "true",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to: recipients.join(", "),
      subject: payload.subject,
      text: payload.message,
      html: payload.html,
    });

    return { success: true, provider: "email" };
  } catch (error) {
    console.error("[Email Error]", error);
    return { 
      success: false, 
      provider: "email", 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

export async function sendSms(
  phoneNumbers: string[],
  message: string
): Promise<NotificationResult> {
  if (phoneNumbers.length === 0) {
    return { success: false, provider: "sms", error: "No phone numbers provided" };
  }

  const hasTwilioConfig = process.env.TWILIO_ACCOUNT_SID && 
                          process.env.TWILIO_AUTH_TOKEN && 
                          process.env.TWILIO_PHONE_NUMBER;

  if (!hasTwilioConfig) {
    console.log(`[SMS Stub] Would send to: ${phoneNumbers.join(", ")}`);
    console.log(`[SMS Stub] Message: ${message.substring(0, 100)}...`);
    return { 
      success: true, 
      provider: "sms", 
      error: "TWILIO_* env vars not configured - stub mode" 
    };
  }

  try {
    const twilio = await import("twilio");
    const client = twilio.default(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    for (const phone of phoneNumbers) {
      await client.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phone,
      });
    }

    return { success: true, provider: "sms" };
  } catch (error) {
    console.error("[SMS Error]", error);
    return { 
      success: false, 
      provider: "sms", 
      error: error instanceof Error ? error.message : "Unknown error" 
    };
  }
}

export async function sendWhatsApp(
  phoneNumbers: string[],
  message: string
): Promise<NotificationResult> {
  if (phoneNumbers.length === 0) {
    return { success: false, provider: "whatsapp", error: "No phone numbers provided" };
  }

  console.log(`[WhatsApp Stub] Would send to: ${phoneNumbers.join(", ")}`);
  console.log(`[WhatsApp Stub] Message: ${message.substring(0, 100)}...`);
  
  return { 
    success: true, 
    provider: "whatsapp", 
    error: "WhatsApp integration not implemented - stub mode" 
  };
}

export async function sendReportNotifications(
  settings: CompanySettings,
  reportData: {
    weekStart: string;
    weekEnd: string;
    totalCost: number;
    totalRevenue: number;
    grossMargin: number;
    alerts: string[];
  }
): Promise<NotificationResult[]> {
  const results: NotificationResult[] = [];
  
  const subject = `Weekly Job Cost Report: ${reportData.weekStart} - ${reportData.weekEnd}`;
  const message = formatReportMessage(reportData);
  const html = formatReportHtml(reportData);

  if (settings.emailNotifications && settings.emailList && settings.emailList.length > 0) {
    const emailResult = await sendEmail(settings.emailList, { subject, message, html });
    results.push(emailResult);
  }

  if (settings.smsNotifications && settings.phoneList && settings.phoneList.length > 0) {
    const smsMessage = `JobCost AI: Week of ${reportData.weekStart}\nCost: $${reportData.totalCost.toLocaleString()}\nRevenue: $${reportData.totalRevenue.toLocaleString()}\nMargin: ${reportData.grossMargin.toFixed(1)}%\nAlerts: ${reportData.alerts.length}`;
    const smsResult = await sendSms(settings.phoneList, smsMessage);
    results.push(smsResult);
  }

  if (settings.whatsappNotifications && settings.phoneList && settings.phoneList.length > 0) {
    const waMessage = `JobCost AI Weekly Report\n${reportData.weekStart} - ${reportData.weekEnd}\n\nCost: $${reportData.totalCost.toLocaleString()}\nRevenue: $${reportData.totalRevenue.toLocaleString()}\nGross Margin: ${reportData.grossMargin.toFixed(1)}%\n\n${reportData.alerts.length > 0 ? `Alerts:\n${reportData.alerts.map(a => `- ${a}`).join('\n')}` : 'No alerts this week.'}`;
    const waResult = await sendWhatsApp(settings.phoneList, waMessage);
    results.push(waResult);
  }

  return results;
}

function formatReportMessage(data: {
  weekStart: string;
  weekEnd: string;
  totalCost: number;
  totalRevenue: number;
  grossMargin: number;
  alerts: string[];
}): string {
  let msg = `Weekly Job Cost Report: ${data.weekStart} - ${data.weekEnd}\n\n`;
  msg += `Total Cost: $${data.totalCost.toLocaleString()}\n`;
  msg += `Total Revenue: $${data.totalRevenue.toLocaleString()}\n`;
  msg += `Gross Margin: ${data.grossMargin.toFixed(1)}%\n\n`;
  
  if (data.alerts.length > 0) {
    msg += `Alerts:\n`;
    for (const alert of data.alerts) {
      msg += `- ${alert}\n`;
    }
  } else {
    msg += `No alerts this week.\n`;
  }
  
  return msg;
}

function formatReportHtml(data: {
  weekStart: string;
  weekEnd: string;
  totalCost: number;
  totalRevenue: number;
  grossMargin: number;
  alerts: string[];
}): string {
  const alertsHtml = data.alerts.length > 0
    ? `<h3>Alerts</h3><ul>${data.alerts.map(a => `<li>${a}</li>`).join('')}</ul>`
    : `<p>No alerts this week.</p>`;

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #333;">Weekly Job Cost Report</h1>
      <p style="color: #666;">${data.weekStart} - ${data.weekEnd}</p>
      
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd;"><strong>Total Cost</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd;">$${data.totalCost.toLocaleString()}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd;"><strong>Total Revenue</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd;">$${data.totalRevenue.toLocaleString()}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd;"><strong>Gross Margin</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd;">${data.grossMargin.toFixed(1)}%</td>
        </tr>
      </table>
      
      ${alertsHtml}
      
      <p style="color: #999; font-size: 12px; margin-top: 30px;">
        This report was generated by JobCost AI
      </p>
    </div>
  `;
}
