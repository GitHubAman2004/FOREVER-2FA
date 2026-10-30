# FOREVER-2FA

Forever e-commerce store (customer site, admin panel and Node/Express backend) with two-factor login: after the password is checked, a 6 digit code is emailed to the user and must be entered to finish signing in.

## Project layout

- `frontend` - customer website (React + Vite)
- `admin` - admin panel (React + Vite)
- `backend` - API server (Express + MongoDB)

## Running locally

1. Backend
   ```bash
   cd backend
   npm install
   cp .env.example .env   # then fill in the values
   npm run server
   ```
2. Frontend and admin: in each folder create a `.env` with `VITE_BACKEND_URL=http://localhost:4000` (the frontend also needs `VITE_RAZORPAY_KEY_ID`), then run `npm install` and `npm run dev`.

## Email setup (required for login)

Every login sends a verification code by email, so the backend needs an SMTP account. Without it, login shows *"Email service is not configured"*.

Using Gmail:

1. Turn on 2-Step Verification for the Gmail account that will send the codes.
2. Open Google Account -> Security -> **App passwords** and create one. Copy the 16 character password.
3. Put these in `backend/.env`:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your.address@gmail.com
   SMTP_PASS=the 16 character app password
   ```
4. Check that it works (the address at the end is optional and receives a test mail):
   ```bash
   cd backend
   npm run check-email -- your.address@gmail.com
   ```

### On Vercel

Add the same four `SMTP_*` variables to the **backend** project under Settings -> Environment Variables, then redeploy it. Vercel only picks up new variables on a new deployment.

## Tests

```bash
cd backend
npm test
```

The tests start a throwaway in-memory MongoDB (downloaded on the first run) and never touch your real database or send real email.
