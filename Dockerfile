FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# ---- build stage ----
# build context includes .git so we can extract commit/branch metadata
# into a static version.json. .git is intentionally NOT carried into
# the runtime stage — that was leaking the entire history into every
# published image (branches, tags, anything you'd rather not ship).
FROM base AS build
WORKDIR /app
COPY . /app

RUN corepack enable
RUN apk add --no-cache python3 alpine-sdk git

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile

# bake git metadata into a version.json that the runtime stage will
# copy. snag/packages/version-info checks SNAG_COMMIT / SNAG_BRANCH /
# SNAG_REMOTE env vars first, then this file at /etc/snag/version.json,
# before falling back to reading .git directly.
RUN mkdir -p /etc/snag && \
    COMMIT="$(git -C /app rev-parse HEAD 2>/dev/null || echo '')" && \
    BRANCH="$(git -C /app rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')" && \
    REMOTE_URL="$(git -C /app config --get remote.origin.url 2>/dev/null || echo '')" && \
    REMOTE="$(echo "$REMOTE_URL" | sed -E 's|^git@[^:]+:||; s|^https?://[^/]+/||; s|\.git$||')" && \
    VERSION="$(node -p "require('/app/api/package.json').version")" && \
    printf '{"commit":"%s","branch":"%s","remote":"%s","version":"%s"}\n' \
        "$COMMIT" "$BRANCH" "$REMOTE" "$VERSION" > /etc/snag/version.json

RUN pnpm deploy --filter=@snag/api --prod /prod/api

# ---- runtime stage ----
# clean image: app dir, baked version.json, no git history.
FROM base AS api
WORKDIR /app

COPY --from=build --chown=node:node /prod/api /app
COPY --from=build --chown=node:node /etc/snag /etc/snag

USER node

EXPOSE 9000
CMD [ "node", "src/snag" ]
