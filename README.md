# Tari Score Monitor

A simple web application for monitoring user scores from the Tari Airdrop platform. Built for fun.

## Features

- Track multiple users' Tari scores
- HTTP Basic Authentication for admin access
- Display historical data with interactive charts (filtered by time periods)
- Monitor user rank in the Tari ecosystem
- Send Discord notifications periodically on score changes


## Installation

```bash
# Clone the repository
git clone https://github.com/doedja/tari-score-monitor.git
cd tari-score-monitor

# Install dependencies
npm install

# Copy the example env file and edit as needed
cp .env.example .env
```

## Development

```bash
# Start the development server with hot reload
npm run dev
```

## Production

```bash
# Start the production server
npm start
```

## Environment Variables

Edit the `.env` file to configure the application:

```
PORT=3000                                               # Server port
DB_PATH=./tari_monitor.db                               # Path to the SQLite database
ADMIN_USERNAME=admin                                    # Admin username for Basic Auth
ADMIN_PASSWORD=admin                                    # Admin password for Basic Auth
```

## Authentication

The application uses HTTP Basic Authentication to protect admin routes. By default, it uses:

- Username: `admin`
- Password: `admin`

For security, you should change these credentials by setting the `ADMIN_USERNAME` and `ADMIN_PASSWORD` environment variables in your `.env` file.

## Usage

1. Open the application in your browser
2. Enter your authentication credentials when prompted
3. Enter your Tari token to add a new user
4. View your score statistics and charts
5. Toggle Discord notifications as desired

## Refresh Interval

The application automatically fetches new scores according to the fetch interval setting.

1. Keep the dashboard updated with the latest data
2. Avoid excessive API calls
3. Ensure timely notifications of score changes

## Deployment

This application can be deployed to any Node.js hosting service. For optimal performance, consider using services that support SQLite or offer filesystem persistence.

## License

MIT 
