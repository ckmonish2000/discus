#!/bin/sh

set -e

echo "🚀 Starting MinIO initialization..."

# Wait for MinIO to be ready
echo ${MINIO_ROOT_USER}
echo ${MINIO_ROOT_PASSWORD}
echo "⏳ Waiting for MinIO to be ready..."
until mc alias set myminio http://minio:9000 ${MINIO_ROOT_USER} ${MINIO_ROOT_PASSWORD} 2>/dev/null; do
  echo "   Retrying in 2 seconds..."
  sleep 2
done

echo "✅ MinIO is ready"

# Create bucket if it doesn't exist
BUCKET_NAME="discus"
if mc ls myminio/${BUCKET_NAME} 2>/dev/null; then
  echo "✅ Bucket '${BUCKET_NAME}' already exists"
else
  mc mb myminio/${BUCKET_NAME}
  echo "✅ Created bucket '${BUCKET_NAME}'"
fi

# Configure webhook notification
echo "⚙️  Configuring webhook notification..."
mc event add myminio/${BUCKET_NAME} arn:minio:sqs::primary:webhook \
  --event put,delete,get

echo "✅ Configured webhook notification for bucket '${BUCKET_NAME}'"
echo "   Webhook endpoint: http://api:8000/storage/webhook"

echo "🎉 MinIO initialization completed successfully!"
