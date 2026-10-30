// checks the SMTP settings in .env by logging in to the mail server
// run with: npm run check-email
// add an address to also send a test mail: npm run check-email -- you@example.com

import 'dotenv/config'
import { getTransporter, sendEmail } from "../utils/sendEmail.js"

const run = async () => {

    // throws a clear message first if any SMTP_* value is missing
    const transporter = getTransporter()

    console.log(`Connecting to ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587} as ${process.env.SMTP_USER} ...`)
    await transporter.verify()
    console.log("SMTP login OK")

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
