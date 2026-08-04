FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
# Të dhënat (db.json, users.json, uploads) ruhen te /app/data
# Në Railway montohet një "Volume" i përhershëm te /app/data (jo VOLUME në Dockerfile)
# Porti vjen nga hosti (env PORT); serveri e lexon automatikisht
EXPOSE 8080
CMD ["node", "server.js"]
