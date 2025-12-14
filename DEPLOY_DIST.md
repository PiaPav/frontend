# Развёртывание `dist.zip` на Ubuntu + Nginx

Инструкция по публикации статического билда (Vite/React) из `dist.zip` на собственном сервере.

## Требования
- Ubuntu 20.04/22.04, доступ по SSH с `sudo`
- Установленные `nginx` и `unzip`
- Готовый архив `dist.zip` (содержимое каталога `dist`)

## Шаг 1. Подготовка сервера
```bash
sudo apt update
sudo apt install -y nginx unzip
```

## Шаг 2. Загрузка архива
С локальной машины положите билд на сервер (пример для `/tmp/dist.zip`):
```bash
scp dist.zip user@SERVER_IP:/tmp/dist.zip
```

## Шаг 3. Распаковка билда
```bash
sudo mkdir -p /var/www/site
sudo unzip -o /tmp/dist.zip -d /var/www/site
sudo chown -R www-data:www-data /var/www/site
```

## Шаг 4. Конфиг Nginx (HTTP)
Создайте файл `/etc/nginx/sites-available/site`:
```nginx
server {
    listen 80;
    server_name example.com www.example.com; # если нет домена — оставьте _ или IP

    root /var/www/site;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri /index.html;
    }

    # Статические файлы с кэшем
    location ~* \.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?)$ {
        try_files $uri =404;
        expires 7d;
        access_log off;
    }
}
```

Активируйте конфиг и выключите дефолтный:
```bash
sudo ln -s /etc/nginx/sites-available/site /etc/nginx/sites-enabled/site
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

## Шаг 5. HTTPS (опционально)
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d example.com -d www.example.com
```
Certbot добавит 443-сервер и автообновление сертификатов.

## Шаг 6. Проверка
- Откройте `http://example.com` или `http://SERVER_IP`.
- Для SPA убедитесь, что прямые переходы по маршрутам работают (благодаря `try_files`).

## Обновление билда
1. Загрузите новый `dist.zip` в `/tmp`.
2. Очистите старое содержимое и распакуйте новое:
   ```bash
   sudo rm -rf /var/www/site/*
   sudo unzip -o /tmp/dist.zip -d /var/www/site
   sudo chown -R www-data:www-data /var/www/site
   sudo systemctl reload nginx
   ```
