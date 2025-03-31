# Use official Node.js LTS image
FROM node:18

# Set working directory to match structure inside container
WORKDIR /usr/src/app

# Copy only the contents of the `api` folder into the container
COPY api/package*.json ./

# Install only production dependencies
RUN npm install --only=production

# Copy the rest of the `api` directory (your app source)
COPY api/ .

# Tell Cloud Run what port to expose (matches your Express app)
EXPOSE 8080

# Start the Node app
CMD ["node", "server.js"]
