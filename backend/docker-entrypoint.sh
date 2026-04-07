#!/bin/bash
set -e

# Start Xvfb (virtual display) for headed Chrome in Docker
export DISPLAY=:99
Xvfb :99 -screen 0 1280x720x24 -nolisten tcp &
XVFB_PID=$!

# Start PulseAudio (virtual audio sink) for Chrome audio recording
pulseaudio --start --exit-idle-time=-1 --daemon
# Create a virtual speaker sink (null sink)
pactl load-module module-null-sink sink_name=virtual_speaker sink_properties=device.description="Virtual_Speaker" 2>/dev/null || true
pactl set-default-sink virtual_speaker 2>/dev/null || true

echo "Xvfb started on :99 (PID $XVFB_PID), PulseAudio started with virtual sink"

# Run the main command
exec "$@"
