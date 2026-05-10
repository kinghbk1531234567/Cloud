# All-cloud Render Docker deploy.
# It builds zsign during deploy so you do not need a local terminal.
FROM debian:bookworm-slim AS zsign-build
RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates build-essential clang make cmake pkg-config \
    libssl-dev libzip-dev zlib1g-dev zip unzip \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /build
RUN git clone --depth=1 https://github.com/zhlynn/zsign.git .
# Try common build paths used by zsign forks/versions.
RUN if [ -f Makefile ]; then make; \
    elif [ -f build.sh ]; then sh build.sh; \
    else clang++ -std=c++11 -O2 *.cpp common/*.cpp -lcrypto -lzip -lz -o zsign; fi

FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends zip unzip ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=zsign-build /build/zsign /usr/local/bin/zsign
COPY . .
ENV ZSIGN_PATH=/usr/local/bin/zsign
EXPOSE 3000
CMD ["npm", "start"]
