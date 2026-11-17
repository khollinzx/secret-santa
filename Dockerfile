FROM node:22-alpine AS source
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
FROM source AS api-build
RUN npm run build:api
FROM node:22-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
COPY --from=api-build /app/node_modules ./node_modules
COPY --from=api-build /app/apps/api/package.json ./apps/api/package.json
COPY --from=api-build /app/apps/api/dist ./apps/api/dist
EXPOSE 4000
USER node
CMD ["node","apps/api/dist/main.js"]
FROM source AS web-build
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_ADMIN_URL
ARG NEXT_PUBLIC_PARTICIPANT_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_ADMIN_URL=$NEXT_PUBLIC_ADMIN_URL NEXT_PUBLIC_PARTICIPANT_URL=$NEXT_PUBLIC_PARTICIPANT_URL NEXT_TELEMETRY_DISABLED=1
RUN npm run build
FROM nginx:alpine AS participant
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/out /usr/share/nginx/html
EXPOSE 80
FROM source AS admin-build
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_ADMIN_URL
ARG NEXT_PUBLIC_PARTICIPANT_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_ADMIN_URL=$NEXT_PUBLIC_ADMIN_URL NEXT_PUBLIC_PARTICIPANT_URL=$NEXT_PUBLIC_PARTICIPANT_URL NEXT_TELEMETRY_DISABLED=1
RUN npm run build:admin
FROM nginx:alpine AS admin
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=admin-build /app/apps/admin/out /usr/share/nginx/html
EXPOSE 80
