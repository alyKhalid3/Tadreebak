import { escapeHtml, escapeList, escapeUrl } from "./escapeHtml";

export const template = ({ code, name, subject }: { code: string; name: string; subject: string }) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(subject)}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 0;
      background-color: #f4f7f6;
    }
    .email-container {
      max-width: 600px;
      margin: 20px auto;
      background-color: #ffffff;
      border: 1px solid #e0e0e0;
      border-radius: 10px;
      overflow: hidden;
    }
    .email-header {
      background: linear-gradient(90deg, #34c759, #28a745);
      color: #ffffff;
      text-align: center;
      padding: 20px;
    }
    .email-header h1 {
      margin: 0;
      font-size: 24px;
      letter-spacing: 1px;
    }
    .email-body {
      padding: 25px;
      color: #333333;
      line-height: 1.6;
    }
    .email-body h2 {
      margin-top: 0;
      color: #28a745;
    }
    .code-box {
      display: inline-block;
      background: #e9f9ee;
      color: #28a745;
      font-weight: bold;
      font-size: 22px;
      padding: 12px 25px;
      border-radius: 8px;
      margin: 20px 0;
      letter-spacing: 3px;
    }
    .email-footer {
      text-align: center;
      padding: 15px;
      background-color: #f4f7f6;
      font-size: 13px;
      color: #888;
    }
    .email-footer a {
      color: #28a745;
      text-decoration: none;
    }
    .skills-list {
      background: #e9f9ee;
      border-radius: 8px;
      padding: 15px 20px 15px 40px;
      margin: 15px 0;
    }
    .skills-list li {
      margin-bottom: 6px;
      color: #28a745;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      <h1>Tadreebak</h1>
    </div>
    <div class="email-body">
      <h2>Hello ${escapeHtml(name)},</h2>
      <p>Welcome to <strong>Tadreebak</strong> 🎓</p>
      <p>To complete your registration, please use the following verification code:</p>

      <div class="code-box">${escapeHtml(code)}</div>

      <p>This code will help you activate your account and start applying for internships Easily.</p>

      <p>If you did not request this, you can safely ignore this email.</p>

      <p>Best regards,<br>Tadreebak Team</p>
    </div>
    <div class="email-footer">
      <p>&copy; 2026 Tadreebak. All rights reserved.</p>
      <p><a href="#">Support</a></p>
    </div>
  </div>
</body>
</html>`;

// Dedicated password-reset email — visually consistent with the registration
// template but with reset-specific wording so it can't be mistaken for a
// signup code.
export const passwordResetTemplate = ({ code, name, subject }: { code: string; name: string; subject: string }) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(subject)}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 0;
      background-color: #f4f7f6;
    }
    .email-container {
      max-width: 600px;
      margin: 20px auto;
      background-color: #ffffff;
      border: 1px solid #e0e0e0;
      border-radius: 10px;
      overflow: hidden;
    }
    .email-header {
      background: linear-gradient(90deg, #34c759, #28a745);
      color: #ffffff;
      text-align: center;
      padding: 20px;
    }
    .email-header h1 {
      margin: 0;
      font-size: 24px;
      letter-spacing: 1px;
    }
    .email-body {
      padding: 25px;
      color: #333333;
      line-height: 1.6;
    }
    .email-body h2 {
      margin-top: 0;
      color: #28a745;
    }
    .code-box {
      display: inline-block;
      background: #e9f9ee;
      color: #28a745;
      font-weight: bold;
      font-size: 22px;
      padding: 12px 25px;
      border-radius: 8px;
      margin: 20px 0;
      letter-spacing: 3px;
    }
    .expiry-note {
      font-size: 13px;
      color: #888;
    }
    .email-footer {
      text-align: center;
      padding: 15px;
      background-color: #f4f7f6;
      font-size: 13px;
      color: #888;
    }
    .email-footer a {
      color: #28a745;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      <h1>Tadreebak</h1>
    </div>
    <div class="email-body">
      <h2>Hello ${escapeHtml(name)},</h2>
      <h2>Password Reset Request 🔑</h2>
      <p>We received a request to reset the password for your <strong>Tadreebak</strong> account. Use the verification code below to continue:</p>

      <div class="code-box">${escapeHtml(code)}</div>

      <p class="expiry-note">This code expires in <strong>5 minutes</strong>.</p>

      <p>If you didn't request a password reset, you can safely ignore this email — your password will remain unchanged.</p>

      <p>Best regards,<br>Tadreebak Team</p>
    </div>
    <div class="email-footer">
      <p>&copy; 2026 Tadreebak. All rights reserved.</p>
      <p><a href="#">Support</a></p>
    </div>
  </div>
</body>
</html>`;

export const acceptanceTemplate = ({ studentName, internshipTitle, companyName, preKnowledge, message, subject }: { studentName: string; internshipTitle: string; companyName: string; preKnowledge: string[]; message?: string; subject: string }) => {
  // Optional personal note from the company. Rendered only when provided —
  // without it the email looks exactly as before.
  const trimmedMessage = message?.trim();
  const companyMessageBlock = trimmedMessage
    ? `
      <div class="company-message">
        <p class="company-message-label">A message from ${escapeHtml(companyName)}:</p>
        <p class="company-message-text">${escapeHtml(trimmedMessage).replace(/\n/g, "<br />")}</p>
      </div>`
    : "";
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(subject)}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 0;
      background-color: #f4f7f6;
    }
    .email-container {
      max-width: 600px;
      margin: 20px auto;
      background-color: #ffffff;
      border: 1px solid #e0e0e0;
      border-radius: 10px;
      overflow: hidden;
    }
    .email-header {
      background: linear-gradient(90deg, #34c759, #28a745);
      color: #ffffff;
      text-align: center;
      padding: 20px;
    }
    .email-header h1 {
      margin: 0;
      font-size: 24px;
      letter-spacing: 1px;
    }
    .email-body {
      padding: 25px;
      color: #333333;
      line-height: 1.6;
    }
    .email-body h2 {
      margin-top: 0;
      color: #28a745;
    }
    .skills-list {
      background: #e9f9ee;
      border-radius: 8px;
      padding: 15px 20px 15px 40px;
      margin: 15px 0;
    }
    .skills-list li {
      margin-bottom: 6px;
      color: #28a745;
      font-weight: 500;
    }
    .company-message {
      background: #f0faf3;
      border-left: 4px solid #28a745;
      border-radius: 6px;
      padding: 14px 18px;
      margin: 18px 0;
    }
    .company-message-label {
      margin: 0 0 6px 0;
      font-size: 13px;
      color: #28a745;
      font-weight: bold;
    }
    .company-message-text {
      margin: 0;
      color: #333333;
      white-space: normal;
    }
    .email-footer {
      text-align: center;
      padding: 15px;
      background-color: #f4f7f6;
      font-size: 13px;
      color: #888;
    }
    .email-footer a {
      color: #28a745;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      <h1>Tadreebak</h1>
    </div>
    <div class="email-body">
      <h2>Congratulations, ${escapeHtml(studentName)}! 🎉</h2>
      <p>We are thrilled to inform you that your application for the <strong>${escapeHtml(internshipTitle)}</strong> internship at <strong>${escapeHtml(companyName)}</strong> has been <strong>accepted</strong>.</p>
      ${companyMessageBlock}
      <p>To help you prepare, here is some pre-knowledge that will be useful for this internship:</p>
      <ul class="skills-list">
        ${preKnowledge.map(skill => `<li>${escapeHtml(skill)}</li>`).join("\n        ")}
      </ul>
      <p>Get ready to learn, grow, and make the most of this opportunity.</p>
      <p>Best regards,<br>Tadreebak Team</p>
    </div>
    <div class="email-footer">
      <p>&copy; 2026 Tadreebak. All rights reserved.</p>
      <p><a href="#">Support</a></p>
    </div>
  </div>
</body>
</html>`;
};

export const internshipNotificationTemplate = ({ studentName, internshipTitle, universityName, companyName, track, location, link, subject }: { studentName: string; internshipTitle: string; universityName?: string; companyName?: string; track?: string; location?: string; link?: string; subject?: string }) => {
  const spotlightName = universityName?.trim() || companyName?.trim();
  const detailLine = spotlightName
    ? `<p><strong>${escapeHtml(internshipTitle)}</strong> for <strong>${escapeHtml(spotlightName)}</strong> students</p>`
    : `<p><strong>${escapeHtml(internshipTitle)}</strong></p>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(subject ?? "New internship match")}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f7f6; }
    .email-container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 10px; overflow: hidden; }
    .email-header { background: linear-gradient(90deg, #34c759, #28a745); color: #ffffff; text-align: center; padding: 20px; }
    .email-body { padding: 25px; color: #333333; line-height: 1.6; }
    .cta { display:inline-block; background:#28a745; color:#fff; padding:10px 18px; border-radius:6px; text-decoration:none; }
    .meta { background:#e9f9ee; padding:12px; border-radius:8px; margin:12px 0; }
    .email-footer { text-align:center; padding:15px; background-color:#f4f7f6; font-size:13px; color:#888; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header"><h1>Tadreebak</h1></div>
    <div class="email-body">
      <h2>Hello ${escapeHtml(studentName)},</h2>
      <p>We thought you'd be interested in a new internship that matches your selected track${track ? `: <strong>${escapeHtml(track)}</strong>` : ""}.</p>
      ${detailLine}
      ${location ? `<p>Location: ${escapeHtml(location)}</p>` : ""}
      ${track || location ? `<div class="meta">${track ? `Track: ${escapeHtml(track)}` : ""}${track && location ? " · " : ""}${location ? `Location: ${escapeHtml(location)}` : ""}</div>` : ""}
      ${link ? `<p><a class="cta" href="${escapeUrl(link)}">View internship</a></p>` : ""}
      <p>If this isn't relevant, you can ignore this email.</p>
      <p>Best regards,<br/>Tadreebak Team</p>
    </div>
    <div class="email-footer">
      <p>&copy; 2026 Tadreebak. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
};

// Re-export the helpers so callers that import the escape utilities from
// this module still work if they were doing so before the audit.
export { escapeHtml, escapeList, escapeUrl };

// Phase 18B / First email in the two-step flow. The recipient
// clicks this to confirm they're the person being invited; the
// system then sends the second email (the setup link). This
// is the security model from `docs/EMAIL_INVITE_SECURITY.md`:
// an attacker with access to the recipient's email still has
// to see BOTH emails to act.
export const instructorConfirmTemplate = ({
    name,
    companyName,
    inviterName,
    roleName,
    confirmUrl,
    subject,
}: {
    name: string
    companyName: string
    inviterName: string
    roleName: string
    confirmUrl: string
    subject: string
}) => `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(subject)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f7fa; }
    .email-container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 10px; overflow: hidden; }
    .email-header { background: linear-gradient(90deg, #2563eb, #1e40af); color: #ffffff; text-align: center; padding: 22px; }
    .email-header h1 { margin: 0; font-size: 24px; letter-spacing: 1px; }
    .email-body { padding: 25px; color: #1f2937; line-height: 1.6; }
    .email-body h2 { margin-top: 0; color: #1e40af; }
    .cta { display:inline-block; background:#1e40af; color:#fff !important; padding:12px 22px; border-radius:8px; text-decoration:none; font-weight:600; margin:18px 0; }
    .meta { background:#eff6ff; padding:14px; border-radius:8px; margin:14px 0; color:#1e3a8a; }
    .expiry-note { font-size: 13px; color: #6b7280; }
    .email-footer { text-align: center; padding: 15px; background-color: #f4f7fa; font-size: 13px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header"><h1>Tadreebak</h1></div>
    <div class="email-body">
      <h2>Hello ${escapeHtml(name)},</h2>
      <p><strong>${escapeHtml(inviterName)}</strong> has invited you to join <strong>${escapeHtml(companyName)}</strong> on Tadreebak as a <strong>${escapeHtml(roleName)}</strong>.</p>
      <div class="meta">
        Confirming takes one click. After you confirm, we'll send you a second email with the link to set your password.
      </div>
      <p>To get started, confirm your invitation:</p>
      <p><a class="cta" href="${escapeUrl(confirmUrl)}">Confirm invitation</a></p>
      <p class="expiry-note">This confirm link expires in <strong>7 days</strong>. If you don't confirm in time, ask ${escapeHtml(inviterName)} to resend the invite.</p>
      <p>If you weren't expecting this email, you can safely ignore it.</p>
      <p>Best regards,<br>Tadreebak Team</p>
    </div>
    <div class="email-footer">
      <p>&copy; 2026 Tadreebak. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`

// Phase 18B / Instructor invite template (setup-email step).
//
// Sent to the invited staff member's email after they click the
// "Confirm" link. Contains:
//   - a short note (when provided)
//   - the company name they're being invited to
//   - a CTA link that drops them on the password-setup page with
//     the setup-token as a query param.
//
// The setup-token is the one-time password-setup credential — the
// staff clicks the CTA, sets a real password, and lands on the
// instructor dashboard. After acceptance the token is nullified on
// the row so it can't be reused.
export const instructorInviteTemplate = ({
    name,
    companyName,
    inviterName,
    note,
    setupUrl,
    subject,
}: {
    name: string
    companyName: string
    inviterName: string
    note?: string
    setupUrl: string
    subject: string
}) => {
    const trimmedNote = note?.trim()
    const noteBlock = trimmedNote
        ? `
      <div class="note-block">
        <p class="note-label">A note from ${escapeHtml(inviterName)}:</p>
        <p class="note-text">${escapeHtml(trimmedNote).replace(/\n/g, "<br />")}</p>
      </div>`
        : ""

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(subject)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f7fa; }
    .email-container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 10px; overflow: hidden; }
    .email-header { background: linear-gradient(90deg, #2563eb, #1e40af); color: #ffffff; text-align: center; padding: 22px; }
    .email-header h1 { margin: 0; font-size: 24px; letter-spacing: 1px; }
    .email-body { padding: 25px; color: #1f2937; line-height: 1.6; }
    .email-body h2 { margin-top: 0; color: #1e40af; }
    .cta { display:inline-block; background:#1e40af; color:#fff !important; padding:12px 22px; border-radius:8px; text-decoration:none; font-weight:600; margin:18px 0; }
    .meta { background:#eff6ff; padding:14px; border-radius:8px; margin:14px 0; color:#1e3a8a; }
    .note-block { background:#f0f9ff; border-left:4px solid #2563eb; border-radius:6px; padding:14px 18px; margin:18px 0; }
    .note-label { margin: 0 0 6px 0; font-size: 13px; color: #1e40af; font-weight: bold; }
    .note-text { margin: 0; color: #1f2937; }
    .expiry-note { font-size: 13px; color: #6b7280; }
    .email-footer { text-align: center; padding: 15px; background-color: #f4f7fa; font-size: 13px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header"><h1>Tadreebak</h1></div>
    <div class="email-body">
      <h2>Hello ${escapeHtml(name)},</h2>
      <p><strong>${escapeHtml(inviterName)}</strong> has invited you to join <strong>${escapeHtml(companyName)}</strong> as an instructor on Tadreebak.</p>
      <div class="meta">
        As an instructor, you'll be able to manage students at ${escapeHtml(companyName)} — create tasks, mark attendance, share evaluations, and review applications. You won't have access to billing or company profile settings.
      </div>
      ${noteBlock}
      <p>To get started, set your password and sign in:</p>
      <p><a class="cta" href="${escapeUrl(setupUrl)}">Set your password</a></p>
      <p class="expiry-note">This invite expires in <strong>7 days</strong>. If you don't accept it in time, ask ${escapeHtml(inviterName)} to resend.</p>
      <p>If you weren't expecting this email, you can safely ignore it.</p>
      <p>Best regards,<br>Tadreebak Team</p>
    </div>
    <div class="email-footer">
      <p>&copy; 2026 Tadreebak. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`
};
