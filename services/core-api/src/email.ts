import nodemailer from 'nodemailer';
import type { RuntimeConfig } from './config.js';

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export async function sendEmail(config: RuntimeConfig, message: EmailMessage): Promise<void> {
  if (config.emailProvider === 'fake') return;
  if (!config.smtpHost || !config.emailFrom) {
    throw new Error('SMTP_HOST e SMTP_FROM são obrigatórios para envio de e-mail');
  }
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth:
      config.smtpUser && config.smtpPassword
        ? { user: config.smtpUser, pass: config.smtpPassword }
        : undefined,
  });
  await transporter.sendMail({
    from: config.emailFrom,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}
