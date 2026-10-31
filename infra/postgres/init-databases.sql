-- Exécuté une seule fois, à la création du volume postgres-data (voir docker-compose.yml).
-- Une base par module. Les extensions vectorielles sont activées dans les bases qui en ont besoin.
CREATE DATABASE calcom;
CREATE DATABASE chatwoot;
CREATE DATABASE openproject;
CREATE DATABASE weknora;

\connect chatwoot
CREATE EXTENSION IF NOT EXISTS vector;

\connect weknora
CREATE EXTENSION IF NOT EXISTS vector;
