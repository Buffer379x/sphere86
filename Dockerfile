FROM node:22-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# ---

FROM node:22-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl unzip python3 jq \
    dbus dbus-x11 xauth x11-xserver-utils xvfb openbox \
    avahi-daemon avahi-utils libnss-mdns \
    libgl1-mesa-dri mesa-utils pulseaudio \
    tini procps kmod udev libcap2-bin \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/VERSION ./VERSION
COPY --from=builder /app/tools/scripts ./scripts
COPY --from=builder /app/tools/container ./scripts/container

RUN chmod +x /app/scripts/container/*.sh

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATABASE_URL=file:/data/sphere86/config/sphere86.db
ENV SPHERE86_DATA_ROOT=/data/sphere86
ENV SPHERE86_SECRET=change-me-in-production
ENV SPHERE86_SINGLE_IMAGE_MODE=true
ENV SPHERE86_EMBEDDED_HOST=true
ENV SPHERE86_EMBEDDED_HOST_NAME="Embedded Local Host"
ENV SPHERE86_SUNSHINE_NAME="Embedded Local Host"
ENV SPHERE86_EMBEDDED_HOST_ADDRESS=127.0.0.1
ENV SPHERE86_EMBEDDED_HOST_PORT=47990
ENV SPHERE86_EMBEDDED_SUNSHINE_SCHEME=auto
ENV SPHERE86_EMBEDDED_CONFIG_BASE_PATH=/data/86box
ENV SPHERE86_EMBEDDED_86BOX_BINARY_PATH=/usr/local/bin/86Box
ENV SPHERE86_EMBEDDED_X11_DISPLAY=:0
ENV SUNSHINE_CONFIG_BASE_PATH=/data/sunshine
ENV BOX86_CONFIG_BASE_PATH=/data/86box
ENV BOX86_BINARY_PATH=/usr/local/bin/86Box
ENV BOX86_ROMS_PATH=/opt/86box/roms
ENV SUNSHINE_STREAM_PORT=47989
ENV SPHERE86_FORCE_XTEST_INPUT=true
ENV SUNSHINE_WEB_USERNAME=admin
ENV SUNSHINE_WEB_PASSWORD=sunshine
ENV SUNSHINE_FORCE_INIT_CREDS=false
ENV BOX_USER=sphere86

VOLUME /data
EXPOSE 3000
EXPOSE 47984 47989 47990 47991 48010
EXPOSE 47984/udp 47989/udp
EXPOSE 47998-48010/udp

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/app/scripts/container/entrypoint.sh"]
