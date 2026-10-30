import nodemailer from 'nodemailer'

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email'

// give up quickly instead of leaving the login request hanging
const EMAIL_TIMEOUT_MS = 15000

let transporter = null

const getTransporter = () => {

    if (transporter) {
        return transporter
    }

    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
        throw new Error('Email service is not configured. Set BREVO_API_KEY and EMAIL_FROM (or SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS) in your environment variables')
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
        },
        connectionTimeout: EMAIL_TIMEOUT_MS,
        greetingTimeout: EMAIL_TIMEOUT_MS,
        socketTimeout: EMAIL_TIMEOUT_MS
    })

    return transporter
}

// "Forever <shop@x.com>" -> { name: 'Forever', email: 'shop@x.com' }
const parseAddress = (value) => {
    const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(value)
    return match ? { name: match[1] || 'Forever', email: match[2].trim() } : { name: 'Forever', email: value.trim() }
}

// Brevo's API goes over normal HTTPS, so it works on hosts that block SMTP ports (like Render's free plan)
const sendWithBrevo = async ({ from, to, subject, html, text }) => {

    if (!from) {
        throw new Error('Email service is not configured. Set EMAIL_FROM to the sender address you verified in Brevo')
    }

    const response = await fetch(BREVO_URL, {
        method: 'POST',
        headers: {
            'api-key': process.env.BREVO_API_KEY,
            'content-type': 'application/json',
            accept: 'application/json'
        },
        body: JSON.stringify({
            sender: parseAddress(from),
            to: [{ email: to }],
            subject,
            htmlContent: html,
            textContent: text
        }),
        signal: AbortSignal.timeout(EMAIL_TIMEOUT_MS)
    })

    if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(`Could not send the email (Brevo ${response.status}: ${body.message || response.statusText})`)
    }

    return await response.json()
}

const sendWithSmtp = async ({ from, to, subject, html, text }) => {
    try {
        return await getTransporter().sendMail({ from, to, subject, html, text })
    } catch (error) {
        if (['ETIMEDOUT', 'ECONNECTION', 'ESOCKET'].includes(error.code)) {
            throw new Error('Could not reach the email server. Hosts like Render\'s free plan block SMTP, use BREVO_API_KEY instead')
        }
        throw error
    }
}

const sendEmail = async ({ to, subject, html, text }) => {

    const { EMAIL_FROM, SMTP_FROM, SMTP_USER } = process.env
    const from = EMAIL_FROM || SMTP_FROM || (SMTP_USER && `Forever <${SMTP_USER}>`)

    if (process.env.BREVO_API_KEY) {
        return await sendWithBrevo({ from, to, subject, html, text })
    }
    return await sendWithSmtp({ from, to, subject, html, text })
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

export { getTransporter, sendEmail, sendOtpEmail }
