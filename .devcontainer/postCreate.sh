#!/usr/bin/env bash
# Runs once after the Codespace container is created.
# Installs MySQL (schemas auto-create on first service startup via
# createDatabaseIfNotExist=true - no manual DB setup needed), sets the
# root/root credentials every service's application.yml already expects,
# and pre-installs frontend deps so the first `npm start` is fast.
set -euo pipefail

echo "Installing Maven and MySQL..."
sudo apt-get update -qq
# The base devcontainers/java image only ships the JDK - Maven isn't included.
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq maven mysql-server >/dev/null

sudo service mysql start
sudo mysql -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'root'; FLUSH PRIVILEGES;"

echo "Installing frontend dependencies..."
cd "$(dirname "$0")/../frontend"
npm install

echo "Done. Run ./start-all.sh from the repo root to bring up the stack."
