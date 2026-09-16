import "server-only";
import nodemailer from "nodemailer";

export function passwordResetMailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASSWORD && process.env.MAIL_FROM && process.env.APP_URL);
}

export async function sendPasswordResetMail(input: { email: string; name: string | null; token: string }) {
  if (!passwordResetMailConfigured()) throw new Error("O envio de e-mail não está configurado. Configure SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, MAIL_FROM e APP_URL.");
  const transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT), secure: process.env.SMTP_SECURE === "true", auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } });
  const resetUrl = new URL("/redefinir-senha", process.env.APP_URL); resetUrl.searchParams.set("token", input.token);
  await transporter.sendMail({ from: process.env.MAIL_FROM, to: input.email, subject: "Redefinição de senha — Gestão Administrativa", text: `Olá${input.name ? `, ${input.name}` : ""}. Use este link para definir uma nova senha: ${resetUrl}\n\nO link expira em 1 hora.`, html: `<p>Olá${input.name ? `, ${input.name}` : ""}.</p><p>Use o link abaixo para definir uma nova senha:</p><p><a href="${resetUrl}">Redefinir senha</a></p><p>O link expira em 1 hora.</p>` });
}
