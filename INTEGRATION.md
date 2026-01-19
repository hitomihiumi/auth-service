# Authorization Service Integration Guide

This service provides a centralized OAuth2 authentication (Google, Discord) for your applications.

## Architecture

- **Backend (NestJS)**: Handles OAuth interaction with providers (Google, Discord) and mints JWTs.
- **Frontend (Next.js + Once UI)**: Provides the user interface for selecting an authentication method.

## Getting Started

### Prerequisites

1.  **Backend Configuration**: Ensure `backend/.env` has the following:
    ```env
    GOOGLE_CLIENT_ID=...
    GOOGLE_CLIENT_SECRET=...
    GOOGLE_CALLBACK_URL=http://localhost:4000/auth/google/redirect
    
    DISCORD_CLIENT_ID=...
    DISCORD_CLIENT_SECRET=...
    DISCORD_CALLBACK_URL=http://localhost:4000/auth/discord/redirect
    
    JWT_SECRET=your_secret_key
    APP_PORT=4000
    ```
2.  **Frontend Configuration**: No specific env required for local dev, assumes backend at `http://localhost:4000`.

### Running the Service

1.  **Start Backend**:
    ```bash
    cd backend
    npm run start:dev
    ```
    Runs on `http://localhost:4000`.

2.  **Start Frontend**:
    ```bash
    cd frontend
    npm run dev
    ```
    Runs on `http://localhost:3000`.

## How to Integrate Your App

To authenticate a user in your application (Consumer App), follow this flow:

1.  **Redirect User to Auth Frontend**:
    Redirect the user to the Auth Service Frontend with a `callbackUrl` query parameter.
    
    ```
    http://localhost:3000?callbackUrl=http://your-app.com/login/callback
    ```

2.  **User Logs In**:
    The user chooses a provider (e.g., Google) on the Auth Service UI.

3.  **Redirect Back**:
    After successful authentication, the Auth Service redirects the user back to your `callbackUrl` with a `token` query parameter containing the JWT.

    ```
    http://your-app.com/login/callback?token=eyJhbGciOiJIUz...
    ```

4.  **Verify Token**:
    Your application should extract the `token` and use it to authenticate the user (e.g., validate via Backend API or decode if secret is shared).

## Endpoints

- `GET /` (Frontend): Login Page. Accepts `?callbackUrl=...`
- `GET /auth/google/login`: Initiates Google OAuth.
- `GET /auth/discord/login`: Initiates Discord OAuth.
