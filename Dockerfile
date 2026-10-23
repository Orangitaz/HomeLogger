FROM node:22-alpine
WORKDIR /app
COPY server.js VERSION ./
COPY public ./public
ENV DATA_DIR=/data PORT=3000
VOLUME /data
EXPOSE 3000
CMD ["node", "server.js"]
