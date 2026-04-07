FROM node:20-slim

# Install Chromium dependencies required by Playwright + ffmpeg for recording merge
# + Xvfb for virtual display + PulseAudio for virtual audio output (needed for
# headed Chrome audio recording in Docker).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libxshmfence1 \
    libgtk-3-0 \
    libx11-xcb1 \
    fonts-liberation \
    fonts-noto-color-emoji \
    wget \
    ca-certificates \
    locales \
    ffmpeg \
    xvfb \
    pulseaudio \
  && sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen \
  && locale-gen \
  && rm -rf /var/lib/apt/lists/*

ENV LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

WORKDIR /app

COPY package*.json ./
RUN npm ci

# Install Playwright Chromium browser
RUN npx playwright install chromium

COPY . .
RUN npm run build

# Ensure the data directory exists for SQLite + auth.json
RUN mkdir -p /app/data /app/.data

# Create the entrypoint that starts Xvfb + PulseAudio before the app
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["npm", "run", "start:prod"]
