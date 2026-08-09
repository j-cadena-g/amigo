export type SendEmailBinding = {
  send(message: {
    to: string;
    from: string | { email: string; name?: string };
    subject: string;
    html?: string;
    text?: string;
  }): Promise<{ messageId: string }>;
};

const INVITE_FROM = {
  email: "invites@mail.mi-amigo.com",
  name: "Amigo",
} as const;

export async function sendTransactionalEmail(
  email: SendEmailBinding,
  message: { to: string; subject: string; text: string; html: string }
): Promise<{ messageId: string }> {
  return email.send({
    to: message.to,
    from: INVITE_FROM,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}
