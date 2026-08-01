#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/assets/stems"
D=50   # seconds
R=48000

# Sync transient: 1 kHz burst at exactly t=1.000s in every stem.
SYNC="sine=f=1000:r=$R:d=0.05"

enc() { ffmpeg -y -hide_banner -loglevel error \
  -filter_complex "$1" -map "[out]" \
  -ac 2 -ar $R -c:a aac -b:a 128k -movflags +faststart "$2"; }

# Pad — low sustained fifth
enc "sine=f=110:r=$R:d=$D[a];sine=f=164.81:r=$R:d=$D[b];\
$SYNC,adelay=1000|1000,apad=whole_dur=$D[s];\
[a][b][s]amix=inputs=3:normalize=0,volume=0.18,\
aformat=channel_layouts=stereo[out]" pad.m4a

# Pulse — gated click at 2 Hz
enc "sine=f=880:r=$R:d=$D,tremolo=f=2:d=1[a];\
$SYNC,adelay=1000|1000,apad=whole_dur=$D[s];\
[a][s]amix=inputs=2:normalize=0,volume=0.15,\
aformat=channel_layouts=stereo[out]" pulse.m4a

# Ambience — filtered pink noise bed
enc "anoisesrc=color=pink:r=$R:d=$D,lowpass=f=800[a];\
$SYNC,adelay=1000|1000,apad=whole_dur=$D[s];\
[a][s]amix=inputs=2:normalize=0,volume=0.12,\
aformat=channel_layouts=stereo[out]" ambience.m4a

# Melody — slow swelling tone
enc "sine=f=329.63:r=$R:d=$D,tremolo=f=0.5:d=0.9[a];\
$SYNC,adelay=1000|1000,apad=whole_dur=$D[s];\
[a][s]amix=inputs=2:normalize=0,volume=0.14,\
aformat=channel_layouts=stereo[out]" melody.m4a

for f in *.m4a; do
  printf "%-14s %s\n" "$f" "$(ffprobe -v error -show_entries \
    format=duration -of csv=p=0 "$f")"
done
