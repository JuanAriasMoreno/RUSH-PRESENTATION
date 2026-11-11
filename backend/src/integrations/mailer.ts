import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/** Messages "sent" while no SMTP server is configured (also inspected by the tests). */
export const outbox: Mail[] = [];

let transporter: Transporter | null = null;
function getTransporter(): Transporter | null {
  if (!env.SMTP_HOST) return null;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  });
  return transporter;
}

/**
 * Sends an email without blocking or failing the request that triggered it.
 * Without SMTP configuration nothing leaves the machine: the mail is printed to the console.
 */
export function sendMail(mail: Mail): void {
  const t = getTransporter();
  if (!t) {
    outbox.push(mail);
    if (outbox.length > 200) outbox.shift();
    if (!env.isTest) console.log(`[mail:console] to=${mail.to} subject="${mail.subject}"\n${mail.text}\n`);
    return;
  }
  t.sendMail({ from: env.MAIL_FROM, ...mail }).catch((err: unknown) => {
    console.error(`[mail] failed to send "${mail.subject}" to ${mail.to}:`, err instanceof Error ? err.message : err);
  });
}

const link = (path: string) => `${env.APP_URL.replace(/\/$/, '')}${path}`;

export const emails = {
  roomInvitation(to: string, inviter: string, roomName: string, url: string, expiresAt: Date) {
    sendMail({
      to,
      subject: `${inviter} invited you to the RUSH! room "${roomName}"`,
      text: `${inviter} invited you to join the private room "${roomName}" on RUSH!.\n\nOpen this link to join (valid until ${expiresAt.toUTCString()}):\n${url}\n`,
    });
  },
  memberRemoved(to: string, roomName: string) {
    sendMail({
      to,
      subject: `You were removed from the RUSH! room "${roomName}"`,
      text: `You are no longer a member of the room "${roomName}" on RUSH!.\n`,
    });
  },
  quizAdded(to: string, roomName: string, quizTitle: string, roomId: number) {
    sendMail({
      to,
      subject: `New quiz in "${roomName}": ${quizTitle}`,
      text: `The quiz "${quizTitle}" was added to the room "${roomName}".\n\n${link(`/rooms/${roomId}`)}\n`,
    });
  },
  sessionStarting(to: string, roomName: string, quizTitle: string, sessionId: number) {
    sendMail({
      to,
      subject: `"${quizTitle}" is starting in "${roomName}"`,
      text: `The quiz session "${quizTitle}" in "${roomName}" has started.\n\n${link(`/play/${sessionId}`)}\n`,
    });
  },
};

/*
=========================================================
EXPLICACIÓN DEL ARCHIVO
=========================================================

Propósito: Envía los correos de notificación mediante SMTP (Nodemailer) o, si no hay servidor
configurado, los imprime en la consola.

Responsabilidades principales:
- Crear el transporte SMTP solo si SMTP_HOST tiene valor.
- sendMail: enviar sin bloquear la petición que lo originó; los fallos solo se registran.
- Guardar los mensajes no enviados en outbox (usado por las pruebas).
- Plantillas emails.roomInvitation, memberRemoved, quizAdded y sessionStarting.

Elementos importantes:
- interface Mail
- outbox
- sendMail(mail)
- emails

Dependencias:
- nodemailer
- config/env.ts

Flujo de datos:
Recibe destinatario, asunto y texto desde los servicios; envía el correo o lo imprime.

Aspectos técnicos importantes:
- Sin SMTP configurado no sale ningún correo del equipo.
- Los enlaces de los correos usan APP_URL.

Lugar en la arquitectura:
Capa de integraciones externas; la usan los servicios de salas, invitaciones, cuestionarios y el
motor de juego. Implementa los cuatro avisos por correo exigidos por los requisitos.
*/
