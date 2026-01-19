# Auth Service

A centralized OAuth2 authentication service (Google, Discord) built with NestJS (Backend) and Next.js (Frontend).

## Project Structure

- `backend`: NestJS application handling OAuth logic and JWT generation.
- `frontend`: Next.js application providing the login UI.
- `test-app`: A consumer application example.

## Getting Started with Docker Compose

1.  **Environment Setup**
    Create a `.env` file in the root directory based on `.env.example`:
    ```bash
    cp .env.example .env
    ```
    Fill in your OAuth credentials (Google, Discord) and JWT secret.

2.  **Run with Docker Compose**
    ```bash
    docker-compose up --build
    ```

    - **Frontend**: http://localhost:3000
    - **Backend**: http://localhost:4000
    - **MongoDB**: http://localhost:27017

## Manual Setup

See [INTEGRATION.md](./INTEGRATION.md) for detailed integration and manual running instructions.

## CI/CD

The project is configured with GitHub Actions in `.github/workflows/ci.yml`. This workflow will:

- Lint and Test the code.
- Build Docker images for Backend and Frontend.
- Push images to GitHub Container Registry (GHCR) when pushing to the `main` branch.
