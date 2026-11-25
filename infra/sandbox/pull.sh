#!/bin/sh
# Pulls/builds the images the code runner uses. Run once: pnpm sandbox:pull
set -e
cd "$(dirname "$0")"
docker pull node:24-alpine
docker pull python:3.12-alpine
docker pull eclipse-temurin:21-jdk-alpine
docker build -t tgi-sandbox-cpp -f cpp.Dockerfile .
