# No build step: the app is static files served as-is.
FROM nginx:alpine
COPY web/ /usr/share/nginx/html/
