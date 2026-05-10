FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y \
    git \
    make \
    g++ \
    pkg-config \
    libssl-dev \
    zlib1g-dev \
    zip \
    unzip \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /tmp

RUN git clone --depth=1 https://github.com/zhlynn/zsign.git \
    && cd zsign/build/linux \
    && make clean \
    && make \
    && cp zsign /usr/local/bin/zsign \
    && chmod +x /usr/local/bin/zsign

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV ZSIGN_PATH=/usr/local/bin/zsign

EXPOSE 3000

CMD ["npm", "start"]
