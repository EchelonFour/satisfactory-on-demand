FROM envoyproxy/envoy:v1.23.1 as envoy
FROM node:16.17.1-bullseye as base

WORKDIR /satisfactory

RUN apt update && apt install dumb-init
COPY package*.json ./

# make a seperate node_modules only containing prod dependencies
RUN npm ci && \
  cp -R node_modules node_modules_dev && \
  npm prune --production && \
  mkdir -p /tmp && \
  mv node_modules /tmp/node_modules_prod && \
  mv node_modules_dev node_modules

COPY src src
COPY .eslintrc .prettierrc.cjs tsconfig.json tsconfig.test.json ./
RUN npm run build


FROM gcr.io/distroless/nodejs:16

WORKDIR /satisfactory

ENV NODE_ENV production
COPY --from=base --chmod=775 /usr/bin/dumb-init /usr/local/bin/dumb-init
COPY --from=envoy --chmod=775 /usr/local/bin/envoy /usr/local/bin/envoy
USER 1000
COPY --chown=1000:1000 package*.json ./

COPY --chown=1000:1000 --from=base /tmp/node_modules_prod ./node_modules
COPY --chown=1000:1000 --from=base /satisfactory/.dist ./dist
COPY --chown=1000:1000 envoy.yaml .
ENTRYPOINT ["/usr/local/bin/dumb-init", "/nodejs/bin/node", "--enable-source-maps"]
CMD ["dist/main.js"]
EXPOSE 15777/udp
EXPOSE 15000/udp
EXPOSE 7777/udp