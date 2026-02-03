# Authentication System

The HearNow backend now includes a complete authentication system with email verification using Mailgun.

## Features

- **User Signup**: Create new accounts with email and password
- **User Signin**: Authenticate with email and password
- **Email Verification**: Verify email addresses using Mailgun
- **Password Reset**: Request and reset forgotten passwords
- **JWT Tokens**: Secure token-based authentication
- **Protected Routes**: API endpoints and WebSocket connections require authentication

## Setup

### 1. Install Dependencies

```bash
cd server
npm install
```

This will install:
- `jsonwebtoken` - JWT token generation and verification
- `bcrypt` - Password hashing
- `mailgun.js` - Mailgun email service integration
- `better-sqlite3` - SQLite database for user storage

### 2. Configure Environment Variables

Create a `.env` file in the `server` directory (copy from `.env.example`):

```bash
cp .env.example .env
```

Required environment variables:

```env
# Server Configuration
PORT=3000
BASE_URL=http://localhost:3000

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# Mailgun Configuration
MAILGUN_API_KEY=your_mailgun_api_key_here
MAILGUN_DOMAIN=your_mailgun_domain_here
MAILGUN_FROM_EMAIL=noreply@your_mailgun_domain_here
```

### 3. Get Mailgun Credentials

1. Sign up at [Mailgun](https://www.mailgun.com/)
2. Verify your domain or use the sandbox domain for testing
3. Get your API key from the Mailgun dashboard
4. Add the credentials to your `.env` file

## API Endpoints

### Authentication Endpoints

All authentication endpoints are prefixed with `/api/auth`.

#### POST `/api/auth/signup`

Create a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (201):**
```json
{
  "message": "User created successfully. Please check your email to verify your account.",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "email_verified": false
  }
}
```

**Errors:**
- `400` - Invalid email format or password too short (min 8 characters)
- `409` - Email already registered

#### POST `/api/auth/signin`

Sign in with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "message": "Sign in successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "email_verified": true
  }
}
```

**Errors:**
- `400` - Missing email or password
- `401` - Invalid email or password
- `403` - Email not verified

#### GET `/api/auth/verify-email?token=<verification_token>`

Verify email address using the token sent via email.

**Response (200):**
```json
{
  "message": "Email verified successfully",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "email_verified": true
  }
}
```

**Errors:**
- `400` - Invalid or expired verification token

#### POST `/api/auth/resend-verification`

Resend verification email.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "message": "Verification email sent. Please check your inbox."
}
```

#### POST `/api/auth/forgot-password`

Request password reset email.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "message": "If the email exists, a password reset link has been sent."
}
```

#### POST `/api/auth/reset-password`

Reset password using token from email.

**Request Body:**
```json
{
  "token": "reset_token_from_email",
  "password": "newpassword123"
}
```

**Response (200):**
```json
{
  "message": "Password reset successfully"
}
```

**Errors:**
- `400` - Invalid or expired reset token, or password too short

#### GET `/api/auth/me`

Get current authenticated user (requires authentication).

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response (200):**
```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "email_verified": true,
    "created_at": 1234567890
  }
}
```

**Errors:**
- `401` - No token provided or invalid token
- `404` - User not found

## Protected Endpoints

The following endpoints now require authentication:

- `POST /ai/respond` - AI response generation
- `WebSocket /listen` - Speech-to-text transcription
- `WebSocket /ai` - AI streaming responses

### Using Authentication in HTTP Requests

Include the JWT token in the Authorization header:

```javascript
fetch('http://localhost:3000/ai/respond', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <jwt_token>',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ ... })
});
```

### Using Authentication in WebSocket Connections

Include the token as a query parameter or in the Authorization header:

```javascript
// Option 1: Query parameter
const ws = new WebSocket('ws://localhost:3000/listen?token=<jwt_token>');

// Option 2: Authorization header (if supported by your WebSocket library)
const ws = new WebSocket('ws://localhost:3000/listen', {
  headers: {
    'Authorization': 'Bearer <jwt_token>'
  }
});
```

## Database

The authentication system uses SQLite (stored in `server/data/hearnow.db`). The database is automatically created on first run.

### User Schema

```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email_verified BOOLEAN DEFAULT 0,
  verification_token TEXT,
  verification_token_expires INTEGER,
  reset_token TEXT,
  reset_token_expires INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

## Security Features

- **Password Hashing**: Passwords are hashed using bcrypt (10 salt rounds)
- **JWT Tokens**: Secure token-based authentication with configurable expiration
- **Email Verification**: Users must verify their email before signing in
- **Token Expiration**: Verification and reset tokens expire after set time periods
- **SQL Injection Protection**: Using parameterized queries

## Testing

### Manual Testing with curl

```bash
# Signup
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Signin
curl -X POST http://localhost:3000/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# Get current user (replace TOKEN with actual JWT token)
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer TOKEN"
```

## Notes

- Email verification is required before users can sign in
- Verification tokens expire after 24 hours
- Password reset tokens expire after 1 hour
- JWT tokens expire after 7 days (configurable via `JWT_EXPIRES_IN`)
- If Mailgun is not configured, the server will still run but email sending will be skipped
