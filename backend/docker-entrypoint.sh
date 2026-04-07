#!/bin/bash
set -e

echo "[entrypoint] Starting virtual display (Xvfb)..."
Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp &
XVFB_PID=$!
export DISPLAY=:99

# Wait for Xvfb to be ready
sleep 1

echo "[entrypoint] Starting PulseAudio daemon..."
# Start dbus (required by PulseAudio)
mkdir -p /run/dbus
dbus-daemon --system --fork 2>/dev/null || true

# Start PulseAudio with a virtual null sink
pulseaudio --start --exit-idle-time=-1 --daemon 2>/dev/null || true
sleep 1

# Create a null sink (virtual speaker) so Chrome has an audio output device.
# Without this, Chrome's audio pipeline is inactive and AudioContext/MediaRecorder
# produce silence even in headed mode.
pactl load-module module-null-sink sink_name=virtual_speaker \
  sink_properties=device.description="Virtual_Speaker" 2>/dev/null || true
pactl set-default-sink virtual_speaker 2>/dev/null || true

# Configure ALSA to route through PulseAudio
mkdir -p /root
cat > /root/.asoundrc <<'EOF'
pcm.!default {
    type pulse
}
ctl.!default {
    type pulse
}
EOF

echo "[entrypoint] Xvfb on :99 (PID $XVFB_PID), PulseAudio ready"
echo "[entrypoint] Starting application..."

# Run the actual command (npm run start:prod or whatever CMD is)
exec "$@"
