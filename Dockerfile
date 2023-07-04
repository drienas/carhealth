FROM node:18.4.0
WORKDIR /usr/src/app
COPY package.json ./
RUN npm install
COPY . .
ENV NODE_ENV=production
CMD ["node", "index.js"]
