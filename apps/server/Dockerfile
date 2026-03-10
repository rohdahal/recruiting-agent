FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
COPY apps/server/package*.json apps/server/
RUN npm install

COPY . .
RUN npm run build --workspace apps/server

EXPOSE 8787
CMD ["npm", "run", "start", "--workspace", "apps/server"]
