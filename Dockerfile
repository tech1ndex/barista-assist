# No build step: the app is static files served as-is. Credentials are not
# baked in — 40-write-config.sh writes them from the environment at startup.
FROM nginx:alpine
COPY web/ /usr/share/nginx/html/
COPY docker/40-write-config.sh /docker-entrypoint.d/40-write-config.sh
COPY docker/cache.conf /etc/nginx/conf.d/cache.conf
RUN chmod +x /docker-entrypoint.d/40-write-config.sh
