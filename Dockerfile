FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY server.py README.md ./
COPY static ./static
COPY docs ./docs

EXPOSE 8088

CMD ["python", "server.py"]
