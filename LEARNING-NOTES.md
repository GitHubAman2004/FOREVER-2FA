# Learning Notes: Getting 2FA Login Working

A diary of every problem we hit while getting two-factor login working on the live site (October 2026): what each problem meant, how we found it, how we fixed it, and the lesson. Technical words are explained the first time they show up, and there's a [glossary](#glossary) at the end.

---

## Contents

1. [The big picture: how the project is set up](#1-the-big-picture-how-the-project-is-set-up)
2. [How 2FA login works in this project](#2-how-2fa-login-works-in-this-project)
3. [The problems, one by one](#3-the-problems-one-by-one)
   - [Problem 1: "E11000 duplicate key error"](#problem-1-e11000-duplicate-key-error)
   - [Problem 2: "Email service is not configured"](#problem-2-email-service-is-not-configured)
   - [Problem 3: Settings added to the wrong host](#problem-3-settings-added-to-the-wrong-host)
   - [Problem 4: Render's free plan blocks email (SMTP)](#problem-4-renders-free-plan-blocks-email-smtp)
   - [Problem 5: Setting up Brevo safely](#problem-5-setting-up-brevo-safely)
   - [Problem 6: The code screen never appeared](#problem-6-the-code-screen-never-appeared)
   - [Problem 7: Email accepted but never delivered](#problem-7-email-accepted-but-never-delivered)
4. [Debugging checklist for next time](#4-debugging-checklist-for-next-time)
5. [Where every setting lives](#5-where-every-setting-lives)
6. [Things that could still be improved](#6-things-that-could-still-be-improved)
7. [Glossary](#glossary)

---

## 1. The big picture: how the project is set up

The project has three parts, each running on a different service:

```
   Customer's browser
          │
          ▼
┌─────────────────────┐   API calls    ┌──────────────────────┐   save/read   ┌────────────────┐
│ Frontend (website)  │ ─────────────▶ │ Backend (API server) │ ────────────▶ │ MongoDB Atlas  │
│ React, on VERCEL    │                │ Express, on RENDER   │               │ (database)     │
│ folder: frontend/   │                │ folder: backend/     │               └────────────────┘
└─────────────────────┘                └──────────────────────┘
                                                  │ "please send this email"
                                                  ▼
                                        ┌──────────────────────┐   delivers   ┌──────────────┐
                                        │ BREVO (email service)│ ───────────▶ │ User's Gmail │
                                        └──────────────────────┘              └──────────────┘
```

- **Frontend** = the website people see. It runs in the browser and lives in the `frontend/` folder. It's hosted on **Vercel**.
- **Backend** = the server that checks passwords, talks to the database and sends emails. It lives in the `backend/` folder and is hosted on **Render** (service name `forever-full-stack`).
- **Database** = MongoDB Atlas. This is where users, products, orders and login codes are stored.
- **Email service** = Brevo. The backend asks Brevo to deliver the login code to the user's inbox.

> 💡 **Lesson:** Before fixing anything, know *where each part runs*. Many of our problems came from changing the wrong place.

---

## 2. How 2FA login works in this project

**2FA (two-factor authentication)** means you need two things to log in: something you *know* (your password) and something you *have* (access to your email inbox).

Step by step:

1. The user types email and password and clicks **Sign In**.
   The frontend sends them to `POST /api/user/login`.
2. The backend checks the password (`backend/controllers/userController.js` → `loginUser`).
3. If it's correct, the backend:
   - makes a random 6-digit code (the **OTP**, one-time password),
   - saves only a **hash** of it in the database (`backend/models/otpModel.js`). A hash is a scrambled version that can be checked but not reversed, so even someone reading the database can't see the real code,
   - emails the real code to the user (`backend/utils/sendEmail.js`),
   - replies with `twoFactorRequired: true` and a short-lived **otpToken**, a ticket that says "this person is halfway through logging in".
4. The frontend sees `twoFactorRequired` and shows the **Verify** screen with 6 boxes (`frontend/src/pages/Login.jsx`).
5. The user types the code. The frontend sends it to `POST /api/user/verify-otp`.
6. If the code matches, the backend replies with the real login **token**. A token is like a wristband that proves you're logged in. The frontend saves it in the browser.

Safety rules built in:

| Rule | Value |
|---|---|
| Code expires after | 10 minutes |
| Wrong tries allowed | 5, then you must log in again |
| Wait before "Resend code" | 60 seconds |
| Code can be used | only once |

---

## 3. The problems, one by one

### Problem 1: "E11000 duplicate key error"

**What we saw:** Red pop-ups on the home page saying
`E11000 duplicate key error collection: e-commerce.users index: email_1 dup key: { email: "..." }`

**What it means:**
- `E11000` is MongoDB's error code for "this value must be unique, and it already exists".
- The `users` collection has a **unique index** on `email`. An index is like a book's index that makes searching fast; *unique* means no two users can have the same email.
- So something tried to create a second account with an email that was already registered.

**Why it happened:** Sign-up did two separate steps:
1. "Does a user with this email exist?" → no
2. "Save the new user"

If several sign-up requests arrive at the same moment (for example a double click), they can *all* pass step 1 before any of them reaches step 2. This is called a **race condition**: two things race and the result depends on who finishes first. The database then correctly blocked the extra saves, but the site showed the raw technical error.

**The fix** ([PR #2](https://github.com/GitHubAman2004/FOREVER-2FA/pull/2)):
- If the database says "duplicate" (error code `11000`), show a friendly **"User already exists"** instead.
- Emails are cleaned up on sign-up (spaces removed, lowercased), and searched without caring about capital letters. So `Name@Gmail.com` and `name@gmail.com` are the same account.

> 💡 **Lesson:** Never show raw database errors to users. Catch the ones you expect and turn them into clear messages. And remember the database's unique index is your real safety net, because checks in code can be raced past.

---

### Problem 2: "Email service is not configured"

**What we saw:** On login:
`Email service is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS in your .env file`

**What it means:** The backend needs login details for an email account to send the code, and it had none.

These details are **environment variables**: settings that live *outside* the code, such as passwords and API keys. Locally they go in `backend/.env`. That file is never uploaded to GitHub, which keeps secrets out of the code. On a host like Render you type them into the dashboard instead.

**The fix** ([PR #2](https://github.com/GitHubAman2004/FOREVER-2FA/pull/2)):
- Added `backend/.env.example`, a template listing every variable the backend needs, with no real values.
- Added `npm run check-email`, a small script that tests your email settings.
- Wrote setup steps in the README.

> 💡 **Lesson:** Your laptop's `.env` file does **not** travel to the server. Every secret has to be added separately on each host.

---

### Problem 3: Settings added to the wrong host

**What happened:** The first instructions said to add the email settings on **Vercel**. But the backend actually runs on **Render**; only the frontend is on Vercel. There's a `backend/vercel.json` file in the repo, which made it look like the backend was on Vercel too.

**How we found it:** The Render dashboard screenshot showed a service called `forever-full-stack` connected to this repo and deploying the backend.

> 💡 **Lesson:** Files in the repo can be leftovers. The dashboards (Vercel, Render) show the truth about what is deployed where.

---

### Problem 4: Render's free plan blocks email (SMTP)

**What happened:** Even with Gmail settings on Render, login still couldn't send the code.

**What it means:**
- **SMTP** is the traditional way programs send email. It uses special network "doors" called **ports**: 25, 465 and 587.
- [Render's free plan blocks those ports](https://render.com/changelog/free-web-services-will-no-longer-allow-outbound-traffic-to-smtp-ports) to stop spammers. So the backend knocked on Gmail's door and nobody answered. The request just hung until it timed out.

**The fix** ([PR #3](https://github.com/GitHubAman2004/FOREVER-2FA/pull/3)):
- Send email through **Brevo's API** instead. An **API** is a way for one program to ask another to do something, here over normal **HTTPS**, the same kind of traffic a web page uses (port 443), which Render does not block.
- `backend/utils/sendEmail.js` now uses Brevo when `BREVO_API_KEY` is set, and falls back to SMTP otherwise.
- SMTP now gives up after 15 seconds with a clear message, instead of hanging for minutes.

> 💡 **Lesson:** Free hosting plans have hidden limits. When something works on your laptop but not on the server, check the host's limits (ports, timeouts, sleeping).

---

### Problem 5: Setting up Brevo safely

Choices made while creating the Brevo **API key** (a long secret password that lets our backend use Brevo):

| Setting | Choice | Why |
|---|---|---|
| Access | **Restricted** | The key can only do what we allow, so a leaked key can't do much damage |
| Transactional email | **All** | "Transactional" = one-to-one emails like login codes. "All" includes *sending* |
| Everything else | **None** | Not needed |
| Expiry | No expiration | It only expires after 90 days of no use. Logins keep it active |
| Authorised IPs (Security page) | **Deactivated for API keys** | Brevo was only accepting the key from approved **IP addresses** (a computer's internet address). Render's free servers don't have one fixed address, so Brevo would have blocked them |

> 💡 **Lesson:** Give keys the *smallest* permissions they need, and never paste them in screenshots, chats or code.

---

### Problem 6: The code screen never appeared

**What we saw:** Login "worked" without asking for a code, and the buttons showed no loading indicator.

**How we found the cause:**
1. We downloaded the live website's JavaScript file and searched it for `verify-otp` and `twoFactorRequired`. **They weren't there.** So the live site was running *old* code.
2. The Vercel dashboard showed the live site was built from commit `7bf4a19`, and that commit doesn't exist in this repo.
   → **Vercel was connected to a different (older) GitHub repo.**

**Why login "worked" anyway:** The old site expected a token in every successful login reply. The new backend replies with "code needed" and *no* token, so the old site saved the word `"undefined"` as the token. After a refresh, the site saw *something* saved and acted logged in, but it was fake, so cart and orders would have failed.

**The fix:**
- In Vercel → **Settings → Git**: disconnected the old repo and connected `GitHubAman2004/FOREVER-2FA`.
- Checked **Root Directory** = `frontend` (the folder the website lives in).
- **Deployments → ⋯ → Create Deployment → `main` → Deploy to Production.** "Redeploy" on an old row would have rebuilt the *old* repo's code.
- [PR #4](https://github.com/GitHubAman2004/FOREVER-2FA/pull/4):
  - The buttons show a spinning circle with "Signing in…", "Creating account…", "Verifying…" or "Sending…".
  - A leftover `"undefined"` token is deleted instead of treated as a login.

> 💡 **Lesson:** "My fix isn't showing" often means "my fix isn't deployed". Check the **commit ID** on the live deployment and compare it with GitHub.

---

### Problem 7: Email accepted but never delivered

**What we saw:** The Verify screen appeared (so the backend sent the email without errors), but the code never reached the inbox.

**How we found the cause:** Brevo → **Transactional → Email → Logs**. Each email showed *Sent* and then *Error*:

> *Sending has been rejected because the sender you used … is not valid. Validate your sender or authenticate your domain.*

**What it means:**
- There are two addresses: the **sender** (`EMAIL_FROM`, who the email is *from*) and the **recipient** (the user logging in, who it goes *to*).
- Brevo only sends from addresses you've proven you own (**verified senders**). `EMAIL_FROM` on Render was set to a Gmail address that wasn't verified in Brevo. The verified one was a *different* Gmail address.
- Brevo first says "OK, received" (so our backend saw no error), and *then* rejects it. That's why only Brevo's logs showed the problem.

**The fix:** On Render → **Environment**, set `EMAIL_FROM` to the sender listed as **Verified** in Brevo → Settings → **Senders, domains, IPs**, in the form `Forever <verified.address@gmail.com>`.

**Side note:** Brevo warns *"Freemail domain is not recommended"*. Sending from a free address like @gmail.com through another service looks suspicious to inbox providers, so codes may land in **Spam**. Mark them "Not spam". A real shop would send from its own domain (e.g. `noreply@yourshop.com`).

> 💡 **Lesson:** "No error in my app" doesn't mean "email delivered". The email service's **logs** show what really happened to each message.

---

## 4. Debugging checklist for next time

When login or email breaks, look in this order:

| # | Where | What it tells you |
|---|---|---|
| 1 | **The red pop-up on the site** | The error message from the backend. Read it word by word |
| 2 | **Vercel → Deployments** | Is the newest commit live? Does the commit ID match GitHub's `main`? |
| 3 | **Render → forever-full-stack → Logs** | Errors printed by the backend, with full details |
| 4 | **Render → Environment** | Are all the variables there and spelled exactly right? |
| 5 | **Brevo → Transactional → Email → Logs** | Was each email Delivered, Deferred, Blocked or Error, and why |
| 6 | **The recipient's Spam / Promotions folders** | New senders often land there |

Also remember: Render's free server **sleeps** when nobody uses it. The first request after a while can take ~50 seconds, which is why the buttons show a spinner.

---

## 5. Where every setting lives

| Setting | Where | Example / note |
|---|---|---|
| `BREVO_API_KEY` | Render → Environment | starts with `xkeysib-`. **Secret** |
| `EMAIL_FROM` | Render → Environment | `Forever <verified.sender@gmail.com>`. Must be **Verified** in Brevo |
| `MONGODB_URI`, `JWT_SECRET`, etc. | Render → Environment | full list in `backend/.env.example` |
| `VITE_BACKEND_URL` | Vercel → Environment Variables | the Render backend's URL |
| `VITE_RAZORPAY_KEY_ID` | Vercel → Environment Variables | Razorpay public key |
| Root Directory = `frontend` | Vercel → Settings → Build and Deployment | tells Vercel where the website code is |
| Connected repo | Vercel → Settings → Git | must be `GitHubAman2004/FOREVER-2FA` |
| Verified senders | Brevo → Settings → Senders, domains, IPs | |
| API key permissions | Brevo → Settings → SMTP & API → API Keys | Transactional email = All |
| Authorised IPs | Brevo → Settings → Security | deactivated for API keys |

Locally, all backend variables go in `backend/.env` (copy `backend/.env.example`). You can test the email setup with:

```bash
cd backend
npm run check-email -- your.address@gmail.com
```

---

## 6. Things that could still be improved

- **Sign-up skips the email check.** Creating an account logs you in straight away without proving you own the email address. Someone could sign up with another person's email. A fix would be to send a code on sign-up too.
- **Own email domain.** Sending from a custom domain (instead of @gmail.com) would keep codes out of Spam.
- **Automated tests.** The backend tests (`npm test` in `backend/`) need to be run on a computer that can download the test database. The cloud sandbox used while making these fixes couldn't run them.
- **Brevo key expiry.** If nobody logs in for 90 days, the Brevo key stops working and a new one is needed.

---

## Glossary

| Word | Simple meaning |
|---|---|
| **2FA** | Two-factor authentication: password + a code sent to you |
| **OTP** | One-time password: the 6-digit code, usable once |
| **Frontend** | The website part that runs in the browser |
| **Backend** | The server part that handles data, passwords and emails |
| **API** | A way for one program to ask another program to do something |
| **Endpoint** | One specific API address, e.g. `/api/user/login` |
| **Token** | A digital wristband proving you're logged in |
| **Hash** | A one-way scrambled version of a secret. Can be checked, can't be reversed |
| **Environment variable** | A setting (often a secret) kept outside the code |
| **`.env` file** | The local file holding environment variables. Never uploaded |
| **Deploy** | Putting the latest code live on the internet |
| **Commit** | One saved change in Git, with an ID like `08303b5` |
| **Pull request (PR)** | A proposed change on GitHub that you review and then **merge** into `main` |
| **Repository (repo)** | The project's folder of code on GitHub |
| **SMTP** | The traditional way programs send email |
| **Port** | A numbered "door" on a computer for a type of network traffic |
| **HTTPS** | Secure web traffic, the kind every website uses |
| **IP address** | A computer's address on the internet |
| **Race condition** | A bug where two things happen at the same time and the result depends on which finishes first |
| **Unique index** | A database rule that a value (like email) can't appear twice |
| **Transactional email** | One-to-one automatic emails (codes, receipts), not newsletters |
| **Verified sender** | An email address you've proven you own to the email service |
| **Root Directory** | The folder inside the repo that a host should build from |
| **Cold start** | A free server waking up from sleep, which makes the first request slow |
