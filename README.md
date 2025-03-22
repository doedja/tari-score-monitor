# Tari Score Monitor

A simple web application for monitoring user scores from the Tari Airdrop platform. Built for fun.

This project integrates with the [Tari Airdrop website](https://airdrop.tari.com) to help users track their airdrop scores and rankings.

## Features

- Track multiple users' Tari scores
- HTTP Basic Authentication for admin access
- Display historical data with interactive charts (filtered by time periods)
- Monitor user rank in the Tari ecosystem
- Send Discord notifications periodically on score changes

## Finding Your Tari Token

To track a user's score, you'll need their Tari token. Here's how to find it:

1. Log in to [airdrop.tari.com](https://airdrop.tari.com)
2. Open browser Developer Tools (F12 or right-click > Inspect)
3. Navigate to:
   - Application tab
   - Cookies on the left sidebar
   - Find the `token` value under airdrop.tari.com

This token is required when adding a new user to monitor.

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

## Docker Deployment

The application can be easily deployed using Docker for containerization and persistent storage.

### Using Docker Compose (Recommended)

```bash
# Clone the repository
git clone https://github.com/doedja/tari-score-monitor.git
cd tari-score-monitor

# Edit the docker-compose.yml to set your environment variables
# Especially set strong admin credentials and Discord webhook if needed

# Start the container
docker-compose up -d
```

The application will be available at http://localhost:3000.

### Using Docker directly

```bash
# Build the Docker image
docker build -t tari-score-monitor .

# Run the container with persistent volume
docker run -d \
  --name tari-score-monitor \
  -p 3000:3000 \
  -v tari-data:/app/data \
  -e DB_PATH=/app/data/tari_monitor.db \
  -e ADMIN_USERNAME=your_username \
  -e ADMIN_PASSWORD=your_password \
  tari-score-monitor
```

### Deployment on Coolify

This application works well with Coolify, which handles persistent storage automatically:

1. Import this Git repository into your Coolify instance
2. Set the environment variables
3. Deploy the application
4. Coolify will automatically mount a persistent volume for the `/app/data` directory

The database will be stored in a persistent volume mounted at `/app/data`, ensuring your data is preserved between container restarts.

## License

MIT 
