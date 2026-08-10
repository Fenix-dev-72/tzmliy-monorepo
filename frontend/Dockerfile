FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Empty on purpose -- served same-origin behind nginx, which reverse-proxies
# /api/ to the backend container, so relative fetches need no base URL.
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npx tsc -b && npx vite build

# Output-only stage -- the host's nginx serves the static files directly
# (extracted from a container built off this image via `docker create` +
# `docker cp`), so no nginx runs inside this image at all. busybox (not
# scratch) only because `docker create` needs *some* CMD to be a valid
# container, even though it's never actually started.
FROM busybox AS export
COPY --from=build /app/dist /dist
CMD ["true"]
