# Gunakan image Node.js resmi yang ringan
FROM node:20-alpine

# Set working directory di dalam container
WORKDIR /app

# Salin file dependency
COPY package*.json ./

# Install dependency
RUN npm install

# Salin seluruh file ke dalam image
COPY . .

# Jalankan script saat container start
CMD ["node", "index.js"]
