# CodeAlpha SocialMedia
A mini social network with user accounts, profiles, posts, comments, likes and follow relationships.

## Requirements
- Node.js 18+
- npm

## Run locally
```bash
cp .env.example .env
npm install
npm run dev
```
Open http://localhost:3000

## Notes
- This is a complete educational MVP intended for internship demonstration.
- Change `JWT_SECRET` before deployment.
- Use HTTPS in production. Add rate limiting, input validation, email verification,
  password reset, backups, and deployment-specific security controls before real users.
- SQLite database is created automatically on first start.
