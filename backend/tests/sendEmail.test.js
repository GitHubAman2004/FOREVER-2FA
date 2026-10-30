import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { sendEmail } from '../utils/sendEmail.js'

const EMAIL_VARS = ['BREVO_API_KEY', 'EMAIL_FROM', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']

const mail = { to: 'user@example.com', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' }

// fake fetch that answers like Brevo does
const mockFetch = (status, body) => {
    const fetchMock = vi.fn(async () => ({
        ok: status >= 200 && status < 300,
        status,
        statusText: 'status text',
        json: async () => body
    }))
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
}

beforeEach(() => {
    EMAIL_VARS.forEach((key) => delete process.env[key])
})

afterEach(() => {
    vi.unstubAllGlobals()
    EMAIL_VARS.forEach((key) => delete process.env[key])
})

describe('sendEmail with Brevo', () => {
    it('posts the mail to the Brevo API', async () => {
        process.env.BREVO_API_KEY = 'xkeysib-test'
        process.env.EMAIL_FROM = 'Forever Shop <shop@example.com>'
        const fetchMock = mockFetch(201, { messageId: 'abc' })

        await sendEmail(mail)

        const [url, options] = fetchMock.mock.calls[0]
        expect(url).toBe('https://api.brevo.com/v3/smtp/email')
        expect(options.headers['api-key']).toBe('xkeysib-test')
        expect(JSON.parse(options.body)).toEqual({
            sender: { name: 'Forever Shop', email: 'shop@example.com' },
            to: [{ email: 'user@example.com' }],
            subject: 'Hi',
            htmlContent: '<p>Hi</p>',
            textContent: 'Hi'
        })
    })

    it('accepts a plain sender address', async () => {
        process.env.BREVO_API_KEY = 'xkeysib-test'
        process.env.EMAIL_FROM = 'shop@example.com'
        const fetchMock = mockFetch(201, {})

        await sendEmail(mail)

        expect(JSON.parse(fetchMock.mock.calls[0][1].body).sender).toEqual({ name: 'Forever', email: 'shop@example.com' })
    })

    it('reports Brevo errors', async () => {
        process.env.BREVO_API_KEY = 'xkeysib-test'
        process.env.EMAIL_FROM = 'shop@example.com'
        mockFetch(400, { message: 'sender not valid' })

        await expect(sendEmail(mail)).rejects.toThrow('Brevo 400: sender not valid')
    })

    it('needs a sender address', async () => {
        process.env.BREVO_API_KEY = 'xkeysib-test'
        const fetchMock = mockFetch(201, {})

        await expect(sendEmail(mail)).rejects.toThrow('EMAIL_FROM')
        expect(fetchMock).not.toHaveBeenCalled()
    })
})

describe('sendEmail without settings', () => {
    it('explains what to configure', async () => {
        await expect(sendEmail(mail)).rejects.toThrow('Email service is not configured')
    })
})
