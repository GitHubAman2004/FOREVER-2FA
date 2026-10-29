// fake values so the app can load without a real .env
// (orderController builds Stripe/Razorpay clients on import and Razorpay throws without a key)
process.env.JWT_SECRET = 'test-secret'
process.env.ADMIN_EMAIL = 'admin@test.com'
process.env.ADMIN_PASSWORD = 'admin-password'
process.env.STRIPE_SECRET_KEY = 'sk_test_dummy'
process.env.RAZORPAY_KEY_ID = 'rzp_test_dummy'
process.env.RAZORPAY_KEY_SECRET = 'rzp_test_dummy'
