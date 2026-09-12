import validator from "validator";
import bcrypt from "bcrypt"
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import userModel from "../models/userModel.js";
import otpModel from "../models/otpModel.js";
import { sendOtpEmail } from "../utils/sendEmail.js";

const OTP_EXPIRY_MINUTES = 10      // how long a code stays valid
const OTP_MAX_ATTEMPTS = 5         // wrong codes allowed before the challenge dies
const OTP_RESEND_COOLDOWN_MS = 60 * 1000

const createToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET)
}

// short lived token that only identifies a pending 2FA challenge, never used as a session token
const createOtpToken = (otpId, userId) => {
    return jwt.sign({ otpId, userId, purpose: 'login_2fa' }, process.env.JWT_SECRET, { expiresIn: '30m' })
}

// a@bc.com -> a***@bc.com, so the UI can hint where the code went without leaking the address
const maskEmail = (email) => {
    const [name, domain] = email.split('@')
    if (!domain) {
        return email
    }
    const visible = name.slice(0, name.length > 2 ? 2 : 1)
    return `${visible}${'*'.repeat(Math.max(name.length - visible.length, 1))}@${domain}`
}

// creates (or replaces) the login challenge for a user and mails them the code
const issueLoginOtp = async (user) => {

    const otp = crypto.randomInt(0, 1000000).toString().padStart(6, '0')
    const otpHash = await bcrypt.hash(otp, 10)

    await otpModel.deleteMany({ userId: user._id, purpose: 'login' })

    const otpDoc = await otpModel.create({
        userId: user._id,
        otpHash,
        purpose: 'login',
        lastSentAt: new Date(),
        expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000)
    })

    try {
        await sendOtpEmail({ to: user.email, name: user.name, otp, expiryMinutes: OTP_EXPIRY_MINUTES })
    } catch (error) {
        // don't leave a challenge behind that the user can never receive
        await otpModel.findByIdAndDelete(otpDoc._id)
        throw error
    }

    return otpDoc
}

// reads the pending challenge out of the otpToken sent by the client
const resolveOtpChallenge = async (otpToken) => {

    if (!otpToken) {
        return { error: "Verification session missing. Please login again" }
    }

    let payload
    try {
        payload = jwt.verify(otpToken, process.env.JWT_SECRET)
    } catch (error) {
        return { error: "Verification session expired. Please login again" }
    }

    if (payload.purpose !== 'login_2fa') {
        return { error: "Invalid verification session" }
    }

    const otpDoc = await otpModel.findById(payload.otpId)

    // the TTL index may not have swept it yet, so check the date as well
    if (!otpDoc || otpDoc.expiresAt.getTime() < Date.now()) {
        return { error: "Your code has expired. Please login again" }
    }

    const user = await userModel.findById(otpDoc.userId)
    if (!user) {
        return { error: "User doesn't exists" }
    }

    return { otpDoc, user }
}

// Route for user login - step 1, password check then email the OTP
const loginUser = async (req, res) => {
    try {

        const { email, password } = req.body;

        const user = await userModel.findOne({ email });

        if (!user) {
            return res.json({ success: false, message: "User doesn't exists" })
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.json({ success: false, message: 'Invalid credentials' })
        }

        if (!user.twoFactorEnabled) {
            const token = createToken(user._id)
            return res.json({ success: true, token })
        }

        const otpDoc = await issueLoginOtp(user)

        res.json({
            success: true,
            twoFactorRequired: true,
            otpToken: createOtpToken(otpDoc._id, user._id),
            email: maskEmail(user.email),
            message: `We sent a 6 digit code to ${maskEmail(user.email)}`
        })

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message })
    }
}

// Route for user login - step 2, verify the emailed OTP and hand out the real token
const verifyLoginOtp = async (req, res) => {
    try {

        const { otpToken, otp } = req.body;

        if (!otp || !/^\d{6}$/.test(String(otp).trim())) {
            return res.json({ success: false, message: "Please enter the 6 digit code" })
        }

        const { error, otpDoc, user } = await resolveOtpChallenge(otpToken)
        if (error) {
            return res.json({ success: false, message: error, sessionExpired: true })
        }

        if (otpDoc.attempts >= OTP_MAX_ATTEMPTS) {
            await otpModel.findByIdAndDelete(otpDoc._id)
            return res.json({ success: false, message: "Too many wrong attempts. Please login again", sessionExpired: true })
        }

        const isMatch = await bcrypt.compare(String(otp).trim(), otpDoc.otpHash)

        if (!isMatch) {
            otpDoc.attempts += 1
            await otpDoc.save()

            const attemptsLeft = OTP_MAX_ATTEMPTS - otpDoc.attempts

            if (attemptsLeft <= 0) {
                await otpModel.findByIdAndDelete(otpDoc._id)
                return res.json({ success: false, message: "Too many wrong attempts. Please login again", sessionExpired: true })
            }

            return res.json({ success: false, message: `Incorrect code. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left` })
        }

        // single use code
        await otpModel.findByIdAndDelete(otpDoc._id)

        const token = createToken(user._id)
        res.json({ success: true, token })

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message })
    }
}

// Route to mail a fresh OTP for an in progress login
const resendLoginOtp = async (req, res) => {
    try {

        const { otpToken } = req.body;

        const { error, otpDoc, user } = await resolveOtpChallenge(otpToken)
        if (error) {
            return res.json({ success: false, message: error, sessionExpired: true })
        }

        const waitMs = OTP_RESEND_COOLDOWN_MS - (Date.now() - otpDoc.lastSentAt.getTime())
        if (waitMs > 0) {
            return res.json({ success: false, message: `Please wait ${Math.ceil(waitMs / 1000)}s before requesting another code` })
        }

        const newDoc = await issueLoginOtp(user)

        res.json({
            success: true,
            otpToken: createOtpToken(newDoc._id, user._id),
            message: `A new code was sent to ${maskEmail(user.email)}`
        })

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message })
    }
}

// Route for user register
const registerUser = async (req, res) => {
    try {

        const { name, email, password } = req.body;

        // checking user already exists or not
        const exists = await userModel.findOne({ email });
        if (exists) {
            return res.json({ success: false, message: "User already exists" })
        }

        // validating email format & strong password
        if (!validator.isEmail(email)) {
            return res.json({ success: false, message: "Please enter a valid email" })
        }
        if (password.length < 8) {
            return res.json({ success: false, message: "Please enter a strong password" })
        }

        // hashing user password
        const salt = await bcrypt.genSalt(10)
        const hashedPassword = await bcrypt.hash(password, salt)

        const newUser = new userModel({
            name,
            email,
            password: hashedPassword
        })

        const user = await newUser.save()

        const token = createToken(user._id)

        res.json({ success: true, token })

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message })
    }
}

// Route for admin login
const adminLogin = async (req, res) => {
    try {

        const {email,password} = req.body

        if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
            const token = jwt.sign(email+password,process.env.JWT_SECRET);
            res.json({success:true,token})
        } else {
            res.json({success:false,message:"Invalid credentials"})
        }

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message })
    }
}


export { loginUser, verifyLoginOtp, resendLoginOtp, registerUser, adminLogin }
