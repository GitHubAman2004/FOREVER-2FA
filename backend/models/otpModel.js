import mongoose from "mongoose";

const otpSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'user', required: true },
    otpHash: { type: String, required: true },
    purpose: { type: String, default: 'login' },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true }
}, { timestamps: true })

// mongo removes the document automatically once expiresAt is in the past
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

const otpModel = mongoose.models.otp || mongoose.model('otp', otpSchema);

export default otpModel
