# Ubuntu 22.04 держит glibc 2.35 — нижнюю границу совместимости сборки.
# webkit2gtk-4.1 + libsoup-3.0: desktop_webview_window требует libsoup-3.0
# через REQUIRED, а webkit2gtk-4.0 линкуется с libsoup2; работает только эта пара.

FROM ubuntu:22.04 AS build

ARG FLUTTER_VERSION=3.44.0
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl git unzip xz-utils zip \
        build-essential clang cmake ninja-build pkg-config \
        libgtk-3-dev liblzma-dev libstdc++-11-dev \
        libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev \
        libwebkit2gtk-4.1-dev libsoup-3.0-dev libsecret-1-dev \
    && rm -rf /var/lib/apt/lists/*

# Flutter отказывается работать от root.
RUN useradd --create-home --shell /bin/bash builder
USER builder
WORKDIR /home/builder

RUN curl -fsSL -o flutter.tar.xz \
        "https://storage.googleapis.com/flutter_infra_release/releases/stable/linux/flutter_linux_${FLUTTER_VERSION}-stable.tar.xz" \
    && tar -xf flutter.tar.xz \
    && rm flutter.tar.xz
ENV PATH="/home/builder/flutter/bin:${PATH}"

RUN git config --global --add safe.directory /home/builder/flutter \
    && flutter config --no-analytics --enable-linux-desktop \
    && flutter precache --linux

WORKDIR /home/builder/app

COPY --chown=builder:builder pubspec.yaml pubspec.lock ./
# Локальные пакеты из dependency_overrides нужны уже на этом шаге: без них
# разрешение зависимостей падает.
COPY --chown=builder:builder third_party/ third_party/
RUN flutter pub get

COPY --chown=builder:builder . .

# Ключ карты Путешествия. Он клиентский и всё равно уезжает в сборку, но в
# репозиторий не входит: без него приложение собирается и работает, только
# вместо карты показывает список мест.
ARG MAPTILER_KEY=""
RUN flutter pub get \
    && flutter build linux --release --dart-define=MAPTILER_KEY="$MAPTILER_KEY"

RUN set -eu; \
    version="$(sed -n 's/^version: *\([0-9.]*\).*/\1/p' pubspec.yaml)"; \
    root="/home/builder/out/citavuk-$version-linux-x64"; \
    mkdir -p "$root"; \
    cp -r build/linux/x64/release/bundle/. "$root/"; \
    cp deploy/linux/citavuk.desktop deploy/linux/README.txt "$root/"; \
    install -m 755 deploy/linux/install.sh "$root/install.sh"; \
    cd /home/builder/out; \
    tar -czf "citavuk-linux-x64.tar.gz" "citavuk-$version-linux-x64"; \
    echo "$version" > version.txt

# Пустой слой для `docker build --output`: наружу уходит только архив.
FROM scratch AS artifact
COPY --from=build /home/builder/out/citavuk-linux-x64.tar.gz /
COPY --from=build /home/builder/out/version.txt /
