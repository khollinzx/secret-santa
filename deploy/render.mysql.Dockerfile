FROM mysql:8.4
COPY database/001_initial.sql /docker-entrypoint-initdb.d/001_initial.sql
EXPOSE 3306
