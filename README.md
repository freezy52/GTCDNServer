<div align="center">
  <h1>GTCDN Server</h1>
  <p>Self-hosted CDN dashboard for Growtopia private server cache files.</p>
</div>

## Overview

GTCDN Server is a Next.js admin panel for managing cache files on your own CDN stack.
It provides a simple web interface for authentication, file browsing, uploads, folder
management, file moves, and deletes.

## Features

- Admin-only authentication
- File and folder management UI
- Upload, move, and delete actions
- Cloudflare R2 storage support through the S3 API
- Better Auth session handling
- Drizzle ORM with PostgreSQL

## How to Use

### 1. Install dependencies

```bash
bun install
```

### 2. Set up your environment

Copy the `.env.example` file to `.env` and fill in the required values.

### 3. Set up the database

Apply the schema with Drizzle:

```bash
bun run db:generate
bun run db:push
```

### 4. Start the application

Run the app with your preferred local workflow after the environment is ready.
```bash
# development mode
bun run dev

# production mode
bun run build
bun run start
```

On localhost, the project can create a default admin account automatically.

Admin account default password is `admin123`.

You will be asked to change the password after the first login.

## Contribution

Contributions are welcome through issues and pull requests.

Before submitting changes:

- keep the existing code style
- use `bun run fmt` for formatting
- use `bun run lint` for lint checks
- keep changes focused and easy to review

## License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.
