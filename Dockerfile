FROM node:24-bookworm-slim
WORKDIR /app
COPY --chown=node:node package.json server.js ./
COPY --chown=node:node lib ./lib
COPY --chown=node:node public ./public
RUN mkdir /data && chown node:node /data
USER node
ENV HOST=0.0.0.0 PORT=3000 SQLITE_PATH=/data/final-take.sqlite NODE_ENV=production
VOLUME ["/data"]
EXPOSE 3000
CMD ["npm", "start"]
