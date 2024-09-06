#!/bin/bash

SERVICE_FILE="$HOME/.config/systemd/user/mystery-crates.service"
CURRENT_DIR=$(pwd)
SERVICE_NAME="mystery-crates"
SYSTEMCTL="systemctl --user"

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

install_service() {
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
  $SYSTEMCTL start "$SERVICE_NAME"
  echo "Service started."
}

view_logs() {
  journalctl --user -u "$SERVICE_NAME" -f
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
  logs)
    view_logs
    ;;
  *)
    echo "Usage: $0 {install|update|stop|start|logs}"
    ;;
esac
