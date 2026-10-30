import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import request from 'supertest'
import app from '../app.js'
import { sendOtpEmail } from '../utils/sendEmail.js'
import { connect, clear, close } from './db.js'

// fake email sender: nothing is mailed, and we can read the plain OTP from its arguments
vi.mock('../utils/sendEmail.js', () => ({
    sendEmail: vi.fn(),
    sendOtpEmail: vi.fn()
}))

const user = { name: 'Test User', email: 'test@example.com', password: 'password123' }

// the OTP from the most recent "email"
const lastOtp = () => vi.mocked(sendOtpEmail).mock.calls.at(-1)[0].otp

// a 6 digit code guaranteed to differ from the real one
const wrongOtp = (otp) => String((Number(otp) + 1) % 1000000).padStart(6, '0')

const register = (body = user) => request(app).post('/api/user/register').send(body)
const login = (body = user) => request(app).post('/api/user/login').send(body)
const verify = (otpToken, otp) => request(app).post('/api/user/verify-otp').send({ otpToken, otp })

beforeAll(connect)
afterEach(async () => {
    await clear()
    vi.clearAllMocks()
})
afterAll(close)

// note: the API answers 200 even for errors, so we check body.success instead of the status code

describe('register', () => {
    it('creates a user and returns a token', async () => {
        const res = await register()
        expect(res.body.success).toBe(true)
        expect(res.body.token).toBeTruthy()
    })

    it('rejects an invalid email', async () => {
        const res = await register({ ...user, email: 'not-an-email' })
        expect(res.body.success).toBe(false)
        expect(res.body.message).toBe('Please enter a valid email')
    })

    it('rejects a weak password', async () => {
        const res = await register({ ...user, password: 'short' })
        expect(res.body.success).toBe(false)
        expect(res.body.message).toBe('Please enter a strong password')
    })

    it('rejects a duplicate user', async () => {
        await register()
        const res = await register()
        expect(res.body.success).toBe(false)
        expect(res.body.message).toBe('User already exists')
    })

    it('treats the same email in different case as a duplicate', async () => {
        await register()
        const res = await register({ ...user, email: ' Test@Example.com ' })
        expect(res.body.success).toBe(false)
        expect(res.body.message).toBe('User already exists')
    })

    it('answers "User already exists" when two sign ups race', async () => {
        const results = await Promise.all([register(), register(), register()])
        const failed = results.filter(r => !r.body.success)
        expect(results.filter(r => r.body.success)).toHaveLength(1)
        failed.forEach(r => expect(r.body.message).toBe('User already exists'))
    })
})

describe('login', () => {
    it('rejects a wrong password', async () => {
        await register()
        const res = await login({ ...user, password: 'wrong-password' })
        expect(res.body.success).toBe(false)
        expect(res.body.message).toBe('Invalid credentials')
        expect(sendOtpEmail).not.toHaveBeenCalled()
    })

    it('finds the account whatever the email case', async () => {
        await register()
        const res = await login({ ...user, email: 'TEST@example.com' })
        expect(res.body.success).toBe(true)
        expect(res.body.twoFactorRequired).toBe(true)
    })

    it('rejects an unknown user', async () => {
        const res = await login()
        expect(res.body.success).toBe(false)
    })
})

describe('2FA', () => {
    it('login -> OTP email -> verify gives a token', async () => {
        await register()

        const loginRes = await login()
        expect(loginRes.body.success).toBe(true)
        expect(loginRes.body.twoFactorRequired).toBe(true)
        expect(loginRes.body.token).toBeUndefined()
        expect(sendOtpEmail).toHaveBeenCalledTimes(1)

        const res = await verify(loginRes.body.otpToken, lastOtp())
        expect(res.body.success).toBe(true)
        expect(res.body.token).toBeTruthy()
    })

    it('a code only works once', async () => {
        await register()
        const { body } = await login()
        const otp = lastOtp()

        await verify(body.otpToken, otp)
        const res = await verify(body.otpToken, otp)
        expect(res.body.success).toBe(false)
    })

    it('a wrong code shows attempts left', async () => {
        await register()
        const { body } = await login()

        const res = await verify(body.otpToken, wrongOtp(lastOtp()))
        expect(res.body.success).toBe(false)
        expect(res.body.message).toBe('Incorrect code. 4 attempts left')
    })

    it('too many wrong codes locks the session', async () => {
        await register()
        const { body } = await login()
        const otp = lastOtp()

        for (let i = 0; i < 4; i++) {
            await verify(body.otpToken, wrongOtp(otp))
        }

        const fifth = await verify(body.otpToken, wrongOtp(otp))
        expect(fifth.body.success).toBe(false)
        expect(fifth.body.sessionExpired).toBe(true)
        expect(fifth.body.message).toMatch(/Too many wrong attempts/)

        // even the right code is refused now
        const res = await verify(body.otpToken, otp)
        expect(res.body.success).toBe(false)
        expect(res.body.token).toBeUndefined()
    })

    it('resending straight away asks you to wait', async () => {
        await register()
        const { body } = await login()

        const res = await request(app).post('/api/user/resend-otp').send({ otpToken: body.otpToken })
        expect(res.body.success).toBe(false)
        expect(res.body.message).toMatch(/Please wait/)
        expect(sendOtpEmail).toHaveBeenCalledTimes(1)
    })
})
