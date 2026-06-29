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

// Crude HTML → plain-text conversion so every message ships with a text
// alternative (spam filters down-rank HTML-only mail). Good enough for the
// OTP templates we send; not a general-purpose converter.
const toPlainText = (html: string): string => {
    return html
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')   // drop <style> blocks
        .replace(/<[^>]+>/g, ' ')                           // strip tags
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/[ \t]+/g, ' ')                            // collapse runs of spaces
        .replace(/\s*\n\s*/g, '\n')                         // tidy newlines
        .trim()
}

// Returns the sendMail promise so callers can await it and react to failure
// (previously the promise was fire-and-forget with a console-only catch, so
// the API always reported success even when the email never went out).
export const sendEmail = async ({ to, subject, html }: { to: string, subject: string, html: string }) => {
    const info = await getTransporter().sendMail({
        from: `Tadreebak<${process.env.EMAIL}>`,
        to,
        subject,
        html,
        // Plain-text alternative — improves deliverability (spam filters
        // penalize HTML-only messages).
        text: toPlainText(html),
        // Common headers that help legitimate transactional mail look less
        // like spam. Auto-Submitted tells filters this isn't a manual reply.
        headers: {
            'X-Mailer': 'Tadreebak',
            'Auto-Submitted': 'auto-generated',
        },
        // Prefer the same address for replies so bounces/out-of-office don't
        // disappear into a void.
        replyTo: process.env.EMAIL,
    })
    return info
}
