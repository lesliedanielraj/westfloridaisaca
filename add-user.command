#!/bin/bash
# Gives someone an account on the site. It asks for their email, their role and a password.
# Other account commands:  .venv/bin/python -m backend.accounts --help
cd "$(dirname "$0")" || exit 1
if [ ! -x .venv/bin/python ]; then echo "Run ./run-local.command once first, to set things up."; exit 1; fi
read -r -p "Email: " email
read -r -p "Role, admin or member [member]: " role
.venv/bin/python -m backend.accounts add --email "$email" --role "${role:-member}"
