#!/bin/bash

echo "=== Установка Docker и Docker Compose ==="
echo ""

# Проверка прав root
if [ "$EUID" -ne 0 ]; then 
    echo "Пожалуйста, запустите скрипт с sudo:"
    echo "  sudo bash install_docker.sh"
    exit 1
fi

# Определение системы
if [ -f /etc/debian_version ]; then
    echo "Обнаружена Debian/Ubuntu система"
    
    # Обновление пакетов
    echo "Обновление списка пакетов..."
    apt-get update
    
    # Установка зависимостей
    echo "Установка зависимостей..."
    apt-get install -y apt-transport-https ca-certificates gnupg lsb-release
    
    # Добавление официального GPG ключа Docker
    echo "Добавление GPG ключа Docker..."
    if ! [ -f /usr/share/keyrings/docker-archive-keyring.gpg ]; then
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    fi
    
    # Добавление репозитория Docker
    echo "Добавление репозитория Docker..."
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Установка Docker
    echo "Установка Docker..."
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
elif [ -f /etc/redhat-release ]; then
    echo "Обнаружена RedHat/CentOS система"
    
    # Установка зависимостей
    yum install -y yum-utils
    
    # Добавление репозитория Docker
    yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
    
    # Установка Docker
    yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
else
    echo "Автоматическая установка не поддерживается для этой системы"
    echo "Установите Docker вручную: https://docs.docker.com/get-docker/"
    exit 1
fi

# Запуск Docker
echo "Запуск Docker..."
systemctl start docker
systemctl enable docker

# Проверка установки
echo ""
echo "=== Проверка установки ==="
docker --version
docker compose version

echo ""
echo "✅ Docker установлен и запущен!"
echo ""
echo "Теперь вы можете запустить PostgreSQL:"
echo "  cd /var/www/marketsport"
echo "  docker compose up -d"

