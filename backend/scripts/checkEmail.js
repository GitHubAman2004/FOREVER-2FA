// checks the email settings in .env (Brevo API key, or SMTP login)
// run with: npm run check-email
// add an address to also send a test mail: npm run check-email -- you@example.com

import 'dotenv/config'
import { getTransporter, sendEmail } from "../utils/sendEmail.js"

const checkBrevo = async () => {

    console.log("Checking the Brevo API key ...")

    const response = await fetch('https://api.brevo.com/v3/account', {
        headers: { 'api-key': process.env.BREVO_API_KEY, accept: 'application/json' }
    })
    const body = await response.json().catch(() => ({}))

    if (!response.ok) {
        throw new Error(`Brevo rejected the API key (${response.status}: ${body.message || response.statusText})`)
    }

    console.log(`Brevo API key OK (account: ${body.email})`)

    if (!process.env.EMAIL_FROM) {
        throw new Error("EMAIL_FROM is not set. Use the sender address you verified in Brevo")
    }
}

const checkSmtp = async () => {

    // throws a clear message first if any SMTP_* value is missing
    const transporter = getTransporter()

    console.log(`Connecting to ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587} as ${process.env.SMTP_USER} ...`)
    await transporter.verify()
    console.log("SMTP login OK")
}

const run = async () => {

    if (process.env.BREVO_API_KEY) {
        await checkBrevo()
    } else {
        await checkSmtp()
    }

    const to = process.argv[2]
    if (to) {
        await sendEmail({
            to,
            subject: "Forever test email",
            text: "If you can read this, the Forever backend can send verification codes.",
            html: "<p>If you can read this, the Forever backend can send verification codes.</p>"
        })
        console.log(`Test email sent to ${to}`)
    }
}

run().catch((error) => {
    console.error(`Email check failed: ${error.message}`)
    // gmail answers 535 when the normal account password is used instead of an app password
    if (String(error.message).includes('535')) {
        console.error("Gmail needs an App Password here, not your normal password (see README)")
    }
    process.exit(1)
})
