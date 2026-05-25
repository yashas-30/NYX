# Authentication

NYX uses Bearer token authentication exclusively.

## Session Token

Include in all API requests:
```http
Authorization: Bearer <session_token>
```

Tokens are generated via `/api/auth/session` or `/api/vault/token` and expire after 5 minutes. No other authentication methods are supported.
