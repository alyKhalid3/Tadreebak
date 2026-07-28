export const template = ({code, name, subject}:{code:string,name:string,subject:string}) => `<!DOCTYPE html>
<html>
<head>
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
      <h2>Hello ${name},</h2>
      <p>Welcome to <strong>Tadreebak</strong> 🎓</p>
      <p>To complete your registration, please use the following verification code:</p>

      <div class="code-box">${code}</div>

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

export const acceptanceTemplate = ({ studentName, internshipTitle, companyName, preKnowledge, subject }: { studentName: string, internshipTitle: string, companyName: string, preKnowledge: string[], subject: string }) => `<!DOCTYPE html>
<html>
<head>
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
      <h2>Congratulations, ${studentName}! 🎉</h2>
      <p>We are thrilled to inform you that your application for the <strong>${internshipTitle}</strong> internship at <strong>${companyName}</strong> has been <strong>accepted</strong>.</p>
      <p>To help you prepare, here is some pre-knowledge that will be useful for this internship:</p>
      <ul class="skills-list">
        ${preKnowledge.map(skill => `<li>${skill}</li>`).join('\n        ')}
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

export const internshipNotificationTemplate = ({ studentName, internshipTitle, companyName, track, location, link, subject }:{ studentName:string, internshipTitle:string, companyName:string, track?: string | undefined, location?: string | undefined, link?: string | undefined, subject?: string | undefined }) => `<!DOCTYPE html>
<html>
<head>
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
      <h2>Hello ${studentName},</h2>
      <p>We thought you'd be interested in a new internship that matches your selected track${track ? `: <strong>${track}</strong>` : ''}.</p>
      <p><strong>${internshipTitle}</strong> at <strong>${companyName}</strong></p>
      ${location ? `<p>Location: ${location}</p>` : ''}
      ${track || location ? `<div class="meta">${track ? `Track: ${track}` : ''}${track && location ? ' · ' : ''}${location ? `Location: ${location}` : ''}</div>` : ''}
      ${link ? `<p><a class="cta" href="${link}">View internship</a></p>` : ''}
      <p>If this isn't relevant, you can ignore this email.</p>
      <p>Best regards,<br/>Tadreebak Team</p>
    </div>
    <div class="email-footer">
      <p>&copy; 2026 Tadreebak. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;