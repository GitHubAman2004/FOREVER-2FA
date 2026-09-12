import nodemailer from 'nodemailer'

let transporter = null

const getTransporter = () => {

    if (transporter) {
        return transporter
    }

    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
        throw new Error('Email service is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS in your .env file')
    }

    const port = Number(SMTP_PORT) || 587

    transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port,
        // port 465 uses implicit TLS, everything else upgrades with STARTTLS
        secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS
        }
    })

    return transporter
}

const sendEmail = async ({ to, subject, html, text }) => {
    const from = process.env.SMTP_FROM || `Forever <${process.env.SMTP_USER}>`
    return await getTransporter().sendMail({ from, to, subject, html, text })
}

// 2FA code mail sent on every login attempt
const sendOtpEmail = async ({ to, name, otp, expiryMinutes }) => {

    const subject = `${otp} is your Forever verification code`

    const text = `Hi ${name || 'there'},\n\nYour Forever verification code is ${otp}.\nIt expires in ${expiryMinutes} minutes.\n\nIf you did not try to sign in, please change your password.`

    const html = `
    <div style="background-color:#f4f4f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
      <div style="max-width:480px;margin:0 auto;background-color:#ffffff;border:1px solid #e4e4e7;padding:32px;">
        <h1 style="margin:0 0 24px;font-size:20px;font-weight:600;color:#18181b;letter-spacing:1px;">FOREVER</h1>
        <p style="margin:0 0 8px;font-size:15px;color:#3f3f46;">Hi ${name || 'there'},</p>
        <p style="margin:0 0 24px;font-size:15px;color:#3f3f46;">Use the verification code below to finish signing in to your account.</p>
        <div style="margin:0 0 24px;padding:16px;background-color:#18181b;text-align:center;">
          <span style="font-size:32px;letter-spacing:10px;color:#ffffff;font-weight:700;">${otp}</span>
        </div>
        <p style="margin:0 0 8px;font-size:13px;color:#71717a;">This code expires in ${expiryMinutes} minutes and can only be used once.</p>
        <p style="margin:0;font-size:13px;color:#71717a;">If you didn't try to sign in, someone may know your password &mdash; please change it right away.</p>
      </div>
    </div>`

    return await sendEmail({ to, subject, html, text })
}

export { sendEmail, sendOtpEmail }
