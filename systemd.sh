#!/bin/bash

SERVICE_FILE="$HOME/.config/systemd/user/mystery-crates.service"
CURRENT_DIR=$(pwd)
SERVICE_NAME="mystery-crates"
SYSTEMCTL="systemctl --user"
ENV_FILE=".env"
ENV_EXAMPLE_FILE=".env.example"

# The service file content with the current directory substituted
SERVICE_CONTENT="[Unit]
Description=Mystery Crates
After=network.target

[Service]
WorkingDirectory=${CURRENT_DIR}
ExecStart=/usr/bin/npm run start
Restart=on-failure
Environment=NODE_ENV=production
RestartSec=5
StandardOutput=syslog
StandardError=syslog
SyslogIdentifier=${SERVICE_NAME}

[Install]
WantedBy=default.target"

check_env_file() {
  # Check if .env file exists and is different from .env.example
  if [[ ! -f "$ENV_FILE" || "$(diff -q "$ENV_FILE" "$ENV_EXAMPLE_FILE")" ]]; then
    echo ".env file is missing or identical to .env.example."
    echo "Copying .env.example to .env. Please fill it out before proceeding."
    cp "$ENV_EXAMPLE_FILE" "$ENV_FILE"
    exit 1
  fi
}

install_service() {
  # Ensure the .env file is present and different
  check_env_file

  # Create ~/.config/systemd/user if it doesn't exist
  mkdir -p "$(dirname "$SERVICE_FILE")"

  # Write the service file
  echo "$SERVICE_CONTENT" > "$SERVICE_FILE"

  # Reload systemd and enable the service
  $SYSTEMCTL daemon-reload
  $SYSTEMCTL enable "$SERVICE_NAME"
  $SYSTEMCTL start "$SERVICE_NAME"

  echo "Service installed and started."
}

update_service() {
  # Ensure the .env file is present and different
  check_env_file

  echo "Updating the repository..."
  git pull
  echo "Restarting the service..."
  $SYSTEMCTL restart "$SERVICE_NAME"
}

stop_service() {
  $SYSTEMCTL stop "$SERVICE_NAME"
  echo "Service stopped."
}

start_service() {
  # Ensure the .env file is present and different
  check_env_file

  $SYSTEMCTL start "$SERVICE_NAME"
  echo "Service started."
}

# Check command-line arguments
case "$1" in
  install)
    install_service
    ;;
  update)
    update_service
    ;;
  stop)
    stop_service
    ;;
  start)
    start_service
    ;;
  *)
    echo "Usage: $0 {install|update|stop|start}"
    ;;
esac
