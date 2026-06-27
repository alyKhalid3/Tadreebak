import nodemailer, { Transporter } from 'nodemailer';

// Bug 12: create the SMTP transporter once and reuse it for every email,
// instead of opening/closing a new connection per send.
let transporter: Transporter | null = null

const getTransporter = (): Transporter => {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: process.env.HOST,
            port: Number(process.env.EMAIL_PORT),
            secure: false,
            auth: {
                user: process.env.EMAIL,
                pass: process.env.PASSWORD
            }
        })
    }
    return transporter
}

// Returns the sendMail promise so callers can await it and react to failure
// (previously the promise was fire-and-forget with a console-only catch, so
// the API always reported success even when the email never went out).
export const sendEmail = async ({ to, subject, html }: { to: string, subject: string, html: string }) => {
    const info = await getTransporter().sendMail({
        from: `Tadreebak <${process.env.EMAIL}>`,
        to,
        subject,
        html
    })
    return info
}
