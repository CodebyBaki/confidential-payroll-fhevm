FROM node:20-alpine

WORKDIR /app

COPY apps/api ./apps/api
COPY apps/employer ./apps/employer
COPY apps/employee ./apps/employee

ENV PORT=4000
ENV DATA_DIR=/data

EXPOSE 4000

CMD ["node", "apps/api/server.js"]
