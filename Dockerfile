FROM node:18-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Create data directory for persistent storage
RUN mkdir -p /app/data

# Copy application files
COPY . .

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/app/data/tari_monitor.db

# Expose the port the app runs on
EXPOSE 3000

# Create volume for persistent database
VOLUME /app/data

# Command to run the application
CMD ["node", "app.js"] 