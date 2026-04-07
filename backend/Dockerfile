FROM node:20-slim

# Install:
#   - Chromium deps required by Playwright
#   - Xvfb (virtual display for headed Chrome — no physical monitor on VPS)
#   - PulseAudio (virtual audio sink so Chrome has an audio pipeline for recording)
#   - ffmpeg (merge screen video + audio into single file)
#   - dbus (required by PulseAudio)
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
    dbus \
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

# Ensure data directories exist
RUN mkdir -p /app/data /app/.data

# Make entrypoint executable
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3001

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["npm", "run", "start:prod"]
