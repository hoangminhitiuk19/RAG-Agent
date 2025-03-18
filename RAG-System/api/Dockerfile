FROM node:18-slim

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy application code
COPY . .

# Environment variables will be provided by Cloud Run
ENV PORT=8080
ENV NODE_ENV=production

# Expose the port
EXPOSE 8080

# Start server
CMD ["node", "server.js"]